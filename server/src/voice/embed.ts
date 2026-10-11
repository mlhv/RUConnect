import { GoogleGenAI } from '@google/genai';
import type { Config } from '../core/config';
import { EMBEDDING_DIMS, type Embedder } from './semantic';

/** A search waits on this call, so it gives up well before the flyer reader would. */
const REQUEST_TIMEOUT_MS = 8000;
/** The most texts the Gemini API embeds in one request. */
const BATCH = 100;

/** Null when no key or embedding model is configured; search then ranks on words alone. */
export function createEmbedder(config: Config): Embedder | null {
  if (!config.geminiApiKey || !config.geminiEmbedModel) return null;
  const ai = new GoogleGenAI({ apiKey: config.geminiApiKey, httpOptions: { timeout: REQUEST_TIMEOUT_MS } });
  const model = config.geminiEmbedModel;

  return async (texts, kind) => {
    const vectors: number[][] = [];
    for (let i = 0; i < texts.length; i += BATCH) {
      const res = await ai.models.embedContent({
        model,
        contents: texts.slice(i, i + BATCH),
        config: { outputDimensionality: EMBEDDING_DIMS, taskType: kind === 'query' ? 'RETRIEVAL_QUERY' : 'RETRIEVAL_DOCUMENT' },
      });
      vectors.push(...(res.embeddings ?? []).map((e) => e.values ?? []));
    }
    return vectors;
  };
}
