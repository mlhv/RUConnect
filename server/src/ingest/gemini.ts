import { ApiError, GoogleGenAI, ThinkingLevel } from '@google/genai';
import type { Config } from '../core/config';

/** The model calls the swarm makes. Workers take this interface so tests can pass a stub. */
export interface Gemini {
  /** Sends one image plus a prompt and returns the model's raw JSON text. */
  readImage(req: { prompt: string; image: Buffer; mime: string; jsonSchema: unknown }): Promise<string>;
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

/** Null when no key or vision model is configured; the orchestrator then replays the cache. */
export function createGemini(config: Config): Gemini | null {
  if (!config.geminiApiKey || !config.geminiVisionModel) return null;
  const ai = new GoogleGenAI({ apiKey: config.geminiApiKey, httpOptions: { timeout: REQUEST_TIMEOUT_MS } });
  const model = config.geminiVisionModel;

  return {
    async readImage({ prompt, image, mime, jsonSchema }) {
      const res = await withBackoff(() =>
        ai.models.generateContent({
          model,
          contents: [{ role: 'user', parts: [{ inlineData: { data: image.toString('base64'), mimeType: mime } }, { text: prompt }] }],
          config: {
            responseMimeType: 'application/json',
            responseJsonSchema: jsonSchema,
            // Reading a flyer needs little reasoning; low thinking keeps output tokens, and cost, down.
            thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
            maxOutputTokens: 4096,
          },
        }),
      );
      const u = res.usageMetadata;
      if (u) {
        console.log(`gemini ${model}: ${u.promptTokenCount ?? 0} in, ${(u.candidatesTokenCount ?? 0) + (u.thoughtsTokenCount ?? 0)} out tokens`);
      }
      if (!res.text) throw new Error('Gemini returned no text');
      return res.text;
    },
  };
}
