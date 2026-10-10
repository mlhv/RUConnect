import { ApiError, GoogleGenAI, ThinkingLevel } from '@google/genai';
import type { Config } from '../core/config';

/** The model calls the swarm makes. Workers take this interface so tests can pass a stub. */
export interface Gemini {
  /** Sends one image plus a prompt and returns the model's raw JSON text. */
  readImage(req: { prompt: string; image: Buffer; mime: string; jsonSchema: unknown }): Promise<string>;
}

const RETRYABLE = new Set([429, 500, 502, 503, 504]);
const MAX_RETRIES = 3;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Retries rate-limit and server errors with exponential backoff, then rethrows. */
export async function withBackoff<T>(fn: () => Promise<T>, baseMs = 1000): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const retryable = err instanceof ApiError && RETRYABLE.has(err.status);
      if (!retryable || attempt >= MAX_RETRIES) throw err;
      await sleep(baseMs * 2 ** attempt + Math.random() * 250);
    }
  }
}

/** Null when no key or vision model is configured; the orchestrator then replays the cache. */
export function createGemini(config: Config): Gemini | null {
  if (!config.geminiApiKey || !config.geminiVisionModel) return null;
  const ai = new GoogleGenAI({ apiKey: config.geminiApiKey });
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
