import { describe, expect, it } from 'vitest';
import { loadConfig } from '../core/config';
import { createEmbedder } from './embed';

const config = (env: Record<string, string>) => loadConfig({ MOCK: '1', ...env });

describe('createEmbedder', () => {
  it('is null without a Gemini key', () => {
    expect(createEmbedder(config({ GEMINI_EMBED_MODEL: 'gemini-embedding-001' }))).toBeNull();
  });

  it('is null without an embedding model', () => {
    expect(createEmbedder(config({ GEMINI_API_KEY: 'k' }))).toBeNull();
  });

  it('is a function when both are set', () => {
    expect(createEmbedder(config({ GEMINI_API_KEY: 'k', GEMINI_EMBED_MODEL: 'gemini-embedding-001' }))).toBeTypeOf('function');
  });
});
