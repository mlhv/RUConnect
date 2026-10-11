import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';
import { EventInputSchema, type EventInput } from '@ruconnect/shared';
import { REPO_ROOT } from '../core/config';

export const CACHE_PATH = resolve(REPO_ROOT, 'data/extraction.cache.json');

// Older entries hold one event; newer ones a list, since a page can hold many.
const CacheFileSchema = z.record(
  z.string(),
  z.union([z.array(EventInputSchema), EventInputSchema.transform((e) => [e])]),
);

export const contentHash = (bytes: Buffer): string => createHash('sha256').update(bytes).digest('hex');

/** data/extraction.cache.json: content hash of a piece to its known-good events, replayed in MOCK=1 or when Gemini fails. */
export class ExtractionCache {
  constructor(private readonly entries: Record<string, EventInput[]> = {}) {}

  static load(path = CACHE_PATH): ExtractionCache {
    try {
      return new ExtractionCache(CacheFileSchema.parse(JSON.parse(readFileSync(path, 'utf8'))));
    } catch (err) {
      console.warn(`Ignoring unreadable extraction cache at ${path}:`, err);
      return new ExtractionCache();
    }
  }

  get(hash: string): EventInput[] | null {
    return this.entries[hash] ?? null;
  }

  set(hash: string, events: EventInput[]): void {
    this.entries[hash] = events;
  }

  save(path = CACHE_PATH): void {
    writeFileSync(path, `${JSON.stringify(this.entries, null, 2)}\n`);
  }
}
