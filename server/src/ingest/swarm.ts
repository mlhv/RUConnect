import { randomUUID } from 'node:crypto';
import pLimit from 'p-limit';
import type pg from 'pg';
import type { Building, CampusEvent, EventInput, SwarmStep } from '@ruconnect/shared';
import type { Store } from '../core/store';
import { contentHash, type ExtractionCache } from './cache';
import type { Gemini } from './gemini';
import { readFlyer } from './reader';
import { verify } from './verifier';

export interface UploadItem {
  name: string;
  mime: string;
  bytes: Buffer;
  caption?: string | null;
}

export interface RunSummary {
  items: number;
  eventsCreated: number;
  sentToReview: number;
  failed: number;
}

/** What the stream sends: worker steps, each saved event, and a final summary. */
export type RunMessage =
  | { type: 'step'; step: SwarmStep }
  | { type: 'event'; itemId: string; event: CampusEvent }
  | { type: 'done'; summary: RunSummary };

interface Run {
  id: string;
  messages: RunMessage[];
  listeners: Set<(m: RunMessage) => void>;
  done: boolean;
}

export interface SwarmDeps {
  store: Store;
  pool: pg.Pool | null;
  gemini: Gemini | null;
  cache: ExtractionCache;
  concurrency: number;
  now: () => string;
  /** Pause between replayed cache steps so the swarm panel shows them. 0 in tests. */
  replayDelayMs?: number;
}

const MAX_RUNS_KEPT = 50;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const errorText = (err: unknown) => (err instanceof Error ? err.message : String(err));

/** In-process job queue for ingest runs. One instance per server. */
export class Swarm {
  private readonly runs = new Map<string, Run>();
  private readonly gemini: Gemini | null;

  constructor(private readonly deps: SwarmDeps) {
    // One limiter shared by every run caps concurrent Gemini calls server-wide.
    const limit = pLimit(Math.max(1, deps.concurrency));
    const g = deps.gemini;
    this.gemini = g && { readImage: (req) => limit(() => g.readImage(req)) };
  }

  /** Starts a run in the background and returns its ids immediately. */
  start(uploads: UploadItem[]): { runId: string; items: { itemId: string; name: string }[] } {
    const run: Run = { id: randomUUID(), messages: [], listeners: new Set(), done: false };
    this.runs.set(run.id, run);
    if (this.runs.size > MAX_RUNS_KEPT) this.runs.delete(this.runs.keys().next().value!);

    const items = uploads.map((u) => ({ ...u, itemId: randomUUID() }));
    void this.process(run, items);
    return { runId: run.id, items: items.map(({ itemId, name }) => ({ itemId, name })) };
  }

  /** Replays everything the run has sent so far, then forwards new messages. Null for an unknown run. */
  subscribe(runId: string, listener: (m: RunMessage) => void): (() => void) | null {
    const run = this.runs.get(runId);
    if (!run) return null;
    for (const m of run.messages) listener(m);
    if (run.done) return () => {};
    run.listeners.add(listener);
    return () => run.listeners.delete(listener);
  }

  private emit(run: Run, m: RunMessage): void {
    run.messages.push(m);
    for (const l of run.listeners) l(m);
  }

  private async process(run: Run, items: (UploadItem & { itemId: string })[]): Promise<void> {
    const summary: RunSummary = { items: items.length, eventsCreated: 0, sentToReview: 0, failed: 0 };
    const buildings = await this.deps.store.listBuildings();
    await this.db('INSERT INTO ingest_runs (id, items) VALUES ($1, $2)', [run.id, items.length]);

    await Promise.all(
      items.map(async (item) => {
        const outcome = await this.processItem(run, item, buildings).catch((err) => {
          console.error(`ingest item ${item.itemId} crashed:`, err);
          const step: SwarmStep = { runId: run.id, itemId: item.itemId, worker: 'scout', state: 'failed', summary: errorText(err) };
          this.emit(run, { type: 'step', step });
          return 'failed' as const;
        });
        if (outcome === 'published') summary.eventsCreated++;
        else if (outcome === 'needs_review') { summary.eventsCreated++; summary.sentToReview++; }
        else summary.failed++;
      }),
    );

    await this.db(
      `UPDATE ingest_runs SET status = 'done', finished_at = now(), events_created = $2, sent_to_review = $3 WHERE id = $1`,
      [run.id, summary.eventsCreated, summary.sentToReview],
    );
    this.emit(run, { type: 'done', summary });
    run.done = true;
    run.listeners.clear();
  }

  private async processItem(
    run: Run,
    item: UploadItem & { itemId: string },
    buildings: Building[],
  ): Promise<'published' | 'needs_review' | 'failed'> {
    const step = (worker: SwarmStep['worker'], state: SwarmStep['state'], summary: string) =>
      this.emit(run, { type: 'step', step: { runId: run.id, itemId: item.itemId, worker, state, summary } });
    const fail = async (worker: SwarmStep['worker'], reason: string) => {
      step(worker, 'failed', reason);
      await this.db(`UPDATE raw_items SET status = 'failed', error = $2 WHERE id = $1`, [rawId, reason]);
      return 'failed' as const;
    };

    step('scout', 'started', item.name);
    const hash = contentHash(item.bytes);
    const rawId = await this.saveRawItem(run.id, item, hash);
    step('scout', 'finished', `${Math.round(item.bytes.length / 1024)} KB image`);

    const cached = this.deps.cache.get(hash);
    let event: EventInput;

    step('reader', 'started', 'reading flyer');
    if (!this.gemini) {
      if (!cached) return fail('reader', 'no Gemini key configured and this image is not in the cache');
      await sleep(this.deps.replayDelayMs ?? 0);
      step('reader', 'finished', `replayed from cache: ${cached.title}`);
      event = cached;
    } else {
      try {
        const draft = await readFlyer(
          { image: item.bytes, mime: item.mime, caption: item.caption },
          { gemini: this.gemini, buildings, now: this.deps.now() },
        );
        step('reader', 'finished', draft.title ?? 'no title found');
        step('verifier', 'started', 'checking fields');
        const result = verify(draft, { source: 'flyer', now: this.deps.now() });
        if (!result.ok) return fail('verifier', result.reason);
        event = result.event;
      } catch (err) {
        if (!cached) return fail('reader', errorText(err));
        step('reader', 'finished', `Gemini failed, replayed from cache: ${cached.title}`);
        event = cached;
      }
    }

    if (event === cached) {
      step('verifier', 'started', 'checking fields');
      await sleep(this.deps.replayDelayMs ?? 0);
    }
    const saved = await this.deps.store.createEvent(event);
    if (rawId) {
      await this.db('UPDATE events SET raw_item_ids = ARRAY[$2]::uuid[] WHERE id = $1', [saved.id, rawId]);
      await this.db(`UPDATE raw_items SET status = 'done' WHERE id = $1`, [rawId]);
    }
    const pct = Math.round(saved.confidence * 100);
    step('verifier', 'finished', saved.status === 'published' ? `published (${pct}% confident)` : `needs review (${pct}% confident)`);
    this.emit(run, { type: 'event', itemId: item.itemId, event: saved });
    return saved.status;
  }

  /** Stores the image in raw_items. Re-uploading the same image reuses its row. Null without a database. */
  private async saveRawItem(runId: string, item: UploadItem, hash: string): Promise<string | null> {
    if (!this.deps.pool) return null;
    const res = await this.deps.pool.query<{ id: string }>(
      `INSERT INTO raw_items (run_id, source_type, source_ref, content_hash, mime, bytes, caption, status)
       VALUES ($1, 'upload', $2, $3, $4, $5, $6, 'processing')
       ON CONFLICT (content_hash) DO UPDATE SET run_id = EXCLUDED.run_id, status = 'processing', error = NULL
       RETURNING id`,
      [runId, item.name, hash, item.mime, item.bytes, item.caption ?? null],
    );
    return res.rows[0].id;
  }

  /** Bookkeeping query; skipped without a database, and logged rather than thrown so it never fails a run. */
  private async db(sql: string, params: unknown[]): Promise<void> {
    if (!this.deps.pool) return;
    try {
      await this.deps.pool.query(sql, params);
    } catch (err) {
      console.error('ingest bookkeeping query failed:', err);
    }
  }
}
