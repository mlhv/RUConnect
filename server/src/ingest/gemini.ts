import { ApiError, GoogleGenAI, ThinkingLevel, type Content, type GenerateContentResponse } from '@google/genai';
import type { Config } from '../core/config';

export interface GeminiRequest {
  prompt: string;
  images?: { data: Buffer; mime: string }[];
  jsonSchema: unknown;
}

/** A function the model may call during `runTools`. */
export interface AgentTool {
  name: string;
  description: string;
  parameters: unknown;
  run(args: Record<string, unknown>): Promise<unknown>;
}

/** The model calls the agents make. Agents take this interface so tests can pass a stub. */
export interface Gemini {
  /** Sends a prompt plus optional images and returns the model's raw JSON text. */
  generateJson(req: GeminiRequest): Promise<string>;
  /** Lets the model call tools until it stops or `maxSteps` model turns pass. Returns its final text. */
  runTools(req: { prompt: string; tools: AgentTool[]; maxSteps: number }): Promise<string>;
}

const RETRYABLE = new Set([429, 500, 502, 503, 504]);
const MAX_RETRIES = 3;
/** A flyer read takes a few seconds; past this the connection is probably gone. */
const REQUEST_TIMEOUT_MS = 30000;

/** Rate limits, server errors, timeouts, and dropped connections (flaky event Wi-Fi) are worth another try. */
function isRetryable(err: unknown): boolean {
  // A daily quota will not reset within a retry window, so retrying only wastes time.
  if (err instanceof ApiError) return RETRYABLE.has(err.status) && !/PerDay/i.test(err.message);
  const e = err as { name?: string; message?: string };
  return e?.name === 'AbortError' || e?.name === 'TimeoutError' || /fetch failed|network|ECONN|ETIMEDOUT|socket/i.test(e?.message ?? '');
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Retries retryable errors with exponential backoff, then rethrows. */
export async function withBackoff<T>(fn: () => Promise<T>, baseMs = 1000): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (!isRetryable(err) || attempt >= MAX_RETRIES) throw err;
      await sleep(baseMs * 2 ** attempt + Math.random() * 250);
    }
  }
}

/** Null when no key or vision model is configured; the swarm then replays the cache. */
export function createGemini(config: Config): Gemini | null {
  if (!config.geminiApiKey || !config.geminiVisionModel) return null;
  const ai = new GoogleGenAI({ apiKey: config.geminiApiKey, httpOptions: { timeout: REQUEST_TIMEOUT_MS } });
  const model = config.geminiVisionModel;
  // These tasks need little reasoning; low thinking keeps output tokens, and cost, down.
  const thinkingConfig = { thinkingLevel: ThinkingLevel.LOW };

  const logUsage = (res: GenerateContentResponse) => {
    const u = res.usageMetadata;
    if (u) console.log(`gemini ${model}: ${u.promptTokenCount ?? 0} in, ${(u.candidatesTokenCount ?? 0) + (u.thoughtsTokenCount ?? 0)} out tokens`);
  };

  return {
    async generateJson({ prompt, images = [], jsonSchema }) {
      const parts = [
        ...images.map((img) => ({ inlineData: { data: img.data.toString('base64'), mimeType: img.mime } })),
        { text: prompt },
      ];
      const res = await withBackoff(() =>
        ai.models.generateContent({
          model,
          contents: [{ role: 'user', parts }],
          config: { responseMimeType: 'application/json', responseJsonSchema: jsonSchema, thinkingConfig, maxOutputTokens: 16384 },
        }),
      );
      logUsage(res);
      if (!res.text) throw new Error('Gemini returned no text');
      return res.text;
    },

    async runTools({ prompt, tools, maxSteps }) {
      const contents: Content[] = [{ role: 'user', parts: [{ text: prompt }] }];
      const functionDeclarations = tools.map((t) => ({ name: t.name, description: t.description, parametersJsonSchema: t.parameters }));
      for (let step = 0; step < maxSteps; step++) {
        const res = await withBackoff(() =>
          ai.models.generateContent({ model, contents, config: { tools: [{ functionDeclarations }], thinkingConfig, maxOutputTokens: 4096 } }),
        );
        logUsage(res);
        const calls = res.functionCalls ?? [];
        if (calls.length === 0) return res.text ?? '';
        const reply = res.candidates?.[0]?.content;
        if (reply) contents.push(reply);
        const responses = await Promise.all(
          calls.map(async (call) => {
            const tool = tools.find((t) => t.name === call.name);
            const result = tool ? await tool.run(call.args ?? {}).catch((err) => ({ error: String(err) })) : { error: `unknown tool ${call.name}` };
            return { functionResponse: { id: call.id, name: call.name, response: { result } } };
          }),
        );
        contents.push({ role: 'user', parts: responses });
      }
      return '';
    },
  };
}
