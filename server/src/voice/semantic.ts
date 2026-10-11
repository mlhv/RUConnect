import { z } from 'zod';

/** The width of `events.embedding`. */
export const EMBEDDING_DIMS = 768;

/** Turns texts into vectors. A document is something to be found; a query is what someone is looking for. */
export type Embedder = (texts: string[], kind: 'document' | 'query') => Promise<number[][]>;

/** The part of `pg.Pool` this file uses, so tests can pass a stand-in. */
export interface Queryable {
  query(text: string, params?: unknown[]): Promise<{ rows: any[] }>;
}

const VectorsSchema = z.array(z.array(z.number()).length(EMBEDDING_DIMS));
const UnembeddedSchema = z.array(
  z.object({ id: z.string(), title: z.string(), description: z.string(), category: z.string(), tags: z.array(z.string()) }),
);
const SimilaritySchema = z.array(z.object({ id: z.string(), similarity: z.number() }));

/** The text an event is embedded as. */
export function eventText(e: { title: string; description: string; category: string; tags: string[] }): string {
  return [e.title, e.category, e.tags.join(', '), e.description].filter(Boolean).join('\n');
}

const literal = (v: number[]) => JSON.stringify(v);

async function embedChecked(embed: Embedder, texts: string[], kind: 'document' | 'query'): Promise<number[][]> {
  const vectors = VectorsSchema.parse(await embed(texts, kind));
  if (vectors.length !== texts.length) throw new Error(`Asked for ${texts.length} embeddings, got ${vectors.length}`);
  return vectors;
}

/**
 * Cosine similarity between the query and each of the given events, computed by pgvector.
 * Events with no embedding yet (new flyers, a fresh seed) are embedded and stored first, so nothing waits on the ingest slice.
 */
export async function similarities(db: Queryable, embed: Embedder, query: string, eventIds: string[]): Promise<Map<string, number>> {
  if (eventIds.length === 0) return new Map();

  const missing = UnembeddedSchema.parse(
    (await db.query('SELECT id, title, description, category, tags FROM events WHERE embedding IS NULL AND id = ANY($1)', [eventIds])).rows,
  );
  const [stored, [queryVector]] = await Promise.all([
    missing.length ? embedChecked(embed, missing.map(eventText), 'document') : [],
    embedChecked(embed, [query], 'query'),
  ]);
  await Promise.all(
    missing.map((e, i) => db.query('UPDATE events SET embedding = $1::vector WHERE id = $2', [literal(stored[i]), e.id])),
  );

  const rows = SimilaritySchema.parse(
    (
      await db.query(
        'SELECT id, 1 - (embedding <=> $1::vector) AS similarity FROM events WHERE embedding IS NOT NULL AND id = ANY($2)',
        [literal(queryVector), eventIds],
      )
    ).rows,
  );
  return new Map(rows.map((r) => [r.id, r.similarity]));
}

/**
 * `similarities`, but never throws and never takes longer than `timeoutMs`: null means rank on words alone.
 * Work still running at the timeout carries on, so embeddings it stores are there for the next search.
 */
export async function trySimilarities(
  db: Queryable, embed: Embedder, query: string, eventIds: string[], timeoutMs: number,
): Promise<Map<string, number> | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      similarities(db, embed, query, eventIds),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`no answer in ${timeoutMs} ms`)), timeoutMs);
      }),
    ]);
  } catch (err) {
    console.warn('Semantic search unavailable, ranking on words:', err instanceof Error ? err.message : err);
    return null;
  } finally {
    clearTimeout(timer);
  }
}
