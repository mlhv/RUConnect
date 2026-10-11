import { describe, expect, it } from 'vitest';
import { EMBEDDING_DIMS, eventText, similarities, trySimilarities, type Embedder, type Queryable } from './semantic';

const vec = (first: number) => [first, ...Array<number>(EMBEDDING_DIMS - 1).fill(0)];

interface Row { id: string; title: string; description: string; category: string; tags: string[]; embedding: string | null }

/** Stands in for the three statements semantic.ts sends, keeping the rows so a test can read what was written. */
function fakeDb(rows: Row[]) {
  const sql: string[] = [];
  const db: Queryable = {
    async query(text: string, params: unknown[] = []) {
      sql.push(text);
      if (text.startsWith('UPDATE')) {
        const row = rows.find((r) => r.id === params[1]);
        if (row) row.embedding = params[0] as string;
        return { rows: [] };
      }
      const wanted = rows.filter((r) => (params.at(-1) as string[]).includes(r.id));
      if (text.includes('IS NULL')) return { rows: wanted.filter((r) => r.embedding === null) };
      // The first number of each stored vector plays the part of the similarity pgvector would compute.
      return { rows: wanted.filter((r) => r.embedding !== null).map((r) => ({ id: r.id, similarity: JSON.parse(r.embedding!)[0] })) };
    },
  };
  return { db, sql, rows };
}

const row = (id: string, embedding: string | null = null): Row => ({
  id, title: `Title ${id}`, description: `About ${id}`, category: 'club', tags: ['robotics', 'pizza'], embedding,
});

/** Records every call; documents get 0.9, queries get 0.1. */
function fakeEmbedder() {
  const calls: { texts: string[]; kind: string }[] = [];
  const embed: Embedder = async (texts, kind) => {
    calls.push({ texts, kind });
    return texts.map(() => vec(kind === 'document' ? 0.9 : 0.1));
  };
  return { embed, calls };
}

describe('eventText', () => {
  it('joins the fields a person would search by', () => {
    expect(eventText(row('a'))).toBe('Title a\nclub\nrobotics, pizza\nAbout a');
  });
});

describe('similarities', () => {
  it('embeds events that have no embedding yet and stores the result', async () => {
    const { db, rows } = fakeDb([row('a'), row('b', JSON.stringify(vec(0.4)))]);
    const { embed, calls } = fakeEmbedder();
    await similarities(db, embed, 'build things', ['a', 'b']);
    expect(calls[0]).toEqual({ texts: [eventText(row('a'))], kind: 'document' });
    expect(JSON.parse(rows[0].embedding!)).toEqual(vec(0.9));
    expect(JSON.parse(rows[1].embedding!)).toEqual(vec(0.4));
  });

  it('returns the similarity of each candidate, including one embedded during this call', async () => {
    const { db } = fakeDb([row('a'), row('b', JSON.stringify(vec(0.4))), row('c', JSON.stringify(vec(0.7)))]);
    const result = await similarities(db, fakeEmbedder().embed, 'build things', ['a', 'b']);
    expect(result).toEqual(new Map([['a', 0.9], ['b', 0.4]]));
  });

  it('embeds the query as a query, once', async () => {
    const { db } = fakeDb([row('b', JSON.stringify(vec(0.4)))]);
    const { embed, calls } = fakeEmbedder();
    await similarities(db, embed, 'build things', ['b']);
    expect(calls).toEqual([{ texts: ['build things'], kind: 'query' }]);
  });

  it('asks nothing of the database or the model when there are no candidates', async () => {
    const { db, sql } = fakeDb([]);
    const { embed, calls } = fakeEmbedder();
    expect(await similarities(db, embed, 'build things', [])).toEqual(new Map());
    expect(sql).toEqual([]);
    expect(calls).toEqual([]);
  });

  it('refuses a vector of the wrong size instead of storing it', async () => {
    const { db, rows } = fakeDb([row('a')]);
    await expect(similarities(db, async (texts) => texts.map(() => [1, 2, 3]), 'q', ['a'])).rejects.toThrow();
    expect(rows[0].embedding).toBeNull();
  });
});

describe('trySimilarities', () => {
  it('returns null when the model fails', async () => {
    const { db } = fakeDb([row('b', JSON.stringify(vec(0.4)))]);
    const failing: Embedder = async () => {
      throw new Error('quota');
    };
    expect(await trySimilarities(db, failing, 'build things', ['b'], 1000)).toBeNull();
  });

  it('returns null when the answer takes longer than the limit', async () => {
    const { db } = fakeDb([row('b', JSON.stringify(vec(0.4)))]);
    const slow: Embedder = (texts) => new Promise((done) => setTimeout(() => done(texts.map(() => vec(0.1))), 200));
    expect(await trySimilarities(db, slow, 'build things', ['b'], 10)).toBeNull();
  });

  it('returns the similarities when all goes well', async () => {
    const { db } = fakeDb([row('b', JSON.stringify(vec(0.4)))]);
    expect(await trySimilarities(db, fakeEmbedder().embed, 'build things', ['b'], 1000)).toEqual(new Map([['b', 0.4]]));
  });
});
