import { randomUUID } from 'node:crypto';
import pLimit from 'p-limit';
import type pg from 'pg';
import type { Building, CampusEvent, EventInput, SwarmStep } from '@ruconnect/shared';
import type { Store } from '../core/store';
import { contentHash, type ExtractionCache } from './cache';
import { critique } from './critic';
import { findDuplicate } from './deduper';
import type { Gemini } from './gemini';
import { readItem, type ReaderDraft, type ReaderInput } from './reader';
import { scout } from './scout';
import { fetchPage, fetchSite } from './sites';
import { verify } from './verifier';

/** One unit of content the Reader sees: a flyer image, a listing chunk, or a detail page. */
export interface Piece {
  sourceRef: string;
  mime: string;
  bytes: Buffer;
  /** Text to read. For images this is the caption, if any. */
  text?: string | null;
}

/** One row in the swarm panel: an uploaded flyer or a Rutgers events site. */
export type SwarmItem =
  | { kind: 'upload'; name: string; piece: Piece }
  | { kind: 'site'; name: string; url: string };

export interface RunSummary {
  items: number;
  eventsCreated: number;
  sentToReview: number;
  duplicates: number;
  skipped: number;
  failed: number;
}

/** What the stream sends: agent steps, each saved event, and a final summary. */
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
  fetchImpl?: typeof fetch;
  /** Detail pages the Scout may open per site. */
  scoutPages?: number;
}

type Step = (worker: SwarmStep['worker'], state: SwarmStep['state'], text: string) => void;
type HashedPiece = Piece & { hash: string };
/** What the Reader produced for one piece: drafts to check, or known-good events from the cache. */
interface PieceResult {
  piece: HashedPiece;
  rawId: string | null;
  drafts?: ReaderDraft[];
  cached?: EventInput[];
}

const MAX_RUNS_KEPT = 50;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const errorText = (err: unknown) => (err instanceof Error ? err.message : String(err));
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
const shortPath = (url: string) => {
  try {
    return new URL(url).pathname.replace(/\/$/, '').split('/').pop() || url;
  } catch {
    return url;
  }
};

function readerInput(p: HashedPiece): ReaderInput {
  const isImage = p.mime.startsWith('image/');
  return { text: p.text, image: isImage ? { data: p.bytes, mime: p.mime } : null, sourceRef: p.sourceRef };
}

/**
 * Runs the agent team for ingest. Per item: the Scout gathers source pieces, the Reader extracts events,
 * the Critic checks them and sends problems back for a second read (shown as the Reconciler), the Verifier's
 * rules keep College Ave events with a building and time, and the Deduper drops events already on the map.
 */
export class Swarm {
  private readonly runs = new Map<string, Run>();
  private readonly gemini: Gemini | null;
  /** Content hashes already read, so re-scraping an unchanged page costs nothing. Backed by raw_items when there is a database. */
  private readonly seen = new Set<string>();
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly deps: SwarmDeps) {
    // One limiter shared by every run caps concurrent Gemini work server-wide.
    const limit = pLimit(Math.max(1, deps.concurrency));
    const g = deps.gemini;
    this.gemini = g && {
      generateJson: (req) => limit(() => g.generateJson(req)),
      runTools: (req) => limit(() => g.runTools(req)),
    };
    this.fetchImpl = deps.fetchImpl ?? fetch;
  }

  /** Starts a run in the background and returns its ids immediately. */
  start(items: SwarmItem[]): { runId: string; items: { itemId: string; name: string }[] } {
    const run: Run = { id: randomUUID(), messages: [], listeners: new Set(), done: false };
    this.runs.set(run.id, run);
    if (this.runs.size > MAX_RUNS_KEPT) this.runs.delete(this.runs.keys().next().value!);

    const withIds = items.map((item) => ({ item, itemId: randomUUID() }));
    void this.process(run, withIds);
    return { runId: run.id, items: withIds.map(({ item, itemId }) => ({ itemId, name: item.name })) };
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

  private async process(run: Run, items: { item: SwarmItem; itemId: string }[]): Promise<void> {
    const summary: RunSummary = { items: items.length, eventsCreated: 0, sentToReview: 0, duplicates: 0, skipped: 0, failed: 0 };
    const buildings = await this.deps.store.listBuildings();
    await this.db('INSERT INTO ingest_runs (id, items) VALUES ($1, $2)', [run.id, items.length]);

    await Promise.all(
      items.map(async ({ item, itemId }) => {
        const step: Step = (worker, state, text) =>
          this.emit(run, { type: 'step', step: { runId: run.id, itemId, worker, state, summary: text } });
        try {
          const r = await this.processItem(run, itemId, item, buildings, step);
          summary.eventsCreated += r.published + r.review;
          summary.sentToReview += r.review;
          summary.duplicates += r.duplicates;
          summary.skipped += r.skipped;
          if (r.failed) summary.failed++;
        } catch (err) {
          console.error(`ingest item ${item.name} crashed:`, err);
          step('scout', 'failed', errorText(err));
          summary.failed++;
        }
      }),
    );

    await this.db(
      `UPDATE ingest_runs SET status = 'done', finished_at = now(), events_created = $2, duplicates_merged = $3, sent_to_review = $4 WHERE id = $1`,
      [run.id, summary.eventsCreated, summary.duplicates, summary.sentToReview],
    );
    this.emit(run, { type: 'done', summary });
    run.done = true;
    run.listeners.clear();
  }

  private async processItem(run: Run, itemId: string, item: SwarmItem, buildings: Building[], step: Step) {
    const result = { published: 0, review: 0, duplicates: 0, skipped: 0, failed: false };
    const now = this.deps.now();

    // Scout: gather pieces. Uploads always reprocess so a demo flyer can be shown twice.
    const pieces = item.kind === 'upload' ? this.scoutUpload(item, step) : await this.scoutSite(item, step);
    if (pieces === null) return { ...result, failed: true };
    if (pieces.length === 0) return result;

    // Reader: one model call per piece. A failed piece falls back to the cache, or is counted and dropped.
    step('reader', 'started', `reading ${plural(pieces.length, 'piece')}`);
    const results: PieceResult[] = [];
    let lastError = '';
    for (const piece of pieces) {
      const rawId = await this.saveRawItem(run.id, item.kind === 'upload' ? 'upload' : 'board', piece);
      const cached = this.deps.cache.get(piece.hash);
      try {
        if (!this.gemini) throw new Error('no Gemini key configured');
        const drafts = await readItem(readerInput(piece), { gemini: this.gemini, buildings, now });
        results.push({ piece, rawId, drafts });
        await this.markDone(piece.hash, rawId);
      } catch (err) {
        if (cached) {
          await sleep(this.deps.replayDelayMs ?? 0);
          results.push({ piece, rawId, cached });
          await this.markDone(piece.hash, rawId);
        } else {
          lastError = errorText(err);
          await this.db(`UPDATE raw_items SET status = 'failed', error = $2 WHERE id = $1`, [rawId, lastError]);
        }
      }
    }
    if (results.length === 0) {
      step('reader', 'failed', pieces.length === 1 ? `${lastError}, and not in the cache` : `all ${pieces.length} pieces failed: ${lastError}`);
      return { ...result, failed: true };
    }
    const found = results.reduce((n, r) => n + (r.drafts?.length ?? r.cached?.length ?? 0), 0);
    const failedPieces = pieces.length - results.length;
    const fromCache = results.some((r) => r.cached);
    step('reader', 'finished', `${fromCache && !this.gemini ? 'replayed from cache: ' : ''}found ${plural(found, 'event')}${failedPieces ? `, ${failedPieces} pieces failed` : ''}`);

    // Verifier part 1, the Critic: check each read against its source; problems go back to the Reader (Reconciler).
    step('verifier', 'started', 'critic checking the reads');
    const critiqued = await this.critiqueAndReread(results, buildings, now, step);

    // Verifier part 2, rules: College Ave, a known building, a plausible time, and the publish threshold.
    const events: { event: EventInput; rawId: string | null }[] = [];
    const reasons = new Map<string, number>();
    for (const r of results) {
      if (r.cached) {
        events.push(...r.cached.map((event) => ({ event, rawId: r.rawId })));
        continue;
      }
      for (const draft of r.drafts ?? []) {
        const v = verify(draft, { source: item.kind === 'upload' ? 'flyer' : 'board', now });
        if (v.ok) events.push({ event: v.event, rawId: r.rawId });
        else {
          result.skipped++;
          const key = v.reason.startsWith('no building') ? 'no matching building' : v.reason.replace(/ \(.*\)$/, '');
          reasons.set(key, (reasons.get(key) ?? 0) + 1);
        }
      }
    }
    const verdict = [critiqued, `${events.length} kept`, ...[...reasons].map(([reason, n]) => `${n} skipped: ${reason}`)];
    step('verifier', 'finished', verdict.filter(Boolean).join('; '));
    if (events.length === 0) return result;

    // Deduper: drop events already on the map, then save the rest.
    step('deduper', 'started', `checking ${plural(events.length, 'event')} against the map`);
    const dupes: string[] = [];
    for (const { event, rawId } of events) {
      let dup = null;
      try {
        dup = await findDuplicate(event, { store: this.deps.store, gemini: this.gemini });
      } catch (err) {
        console.error('deduper failed, saving the event anyway:', err);
      }
      if (dup) {
        result.duplicates++;
        dupes.push(`"${event.title}" is "${dup.duplicateOf.title}"`);
        continue;
      }
      const saved = await this.deps.store.createEvent(event);
      if (rawId) await this.db('UPDATE events SET raw_item_ids = ARRAY[$2]::uuid[] WHERE id = $1', [saved.id, rawId]);
      if (saved.status === 'published') result.published++;
      else result.review++;
      this.emit(run, { type: 'event', itemId, event: saved });
    }
    const added = [`${result.published} published`, result.review ? `${result.review} to review` : '', ...dupes.map((d) => `duplicate: ${d}`)];
    step('deduper', 'finished', added.filter(Boolean).join('; '));
    return result;
  }

  private scoutUpload(item: Extract<SwarmItem, { kind: 'upload' }>, step: Step): HashedPiece[] {
    step('scout', 'started', item.name);
    const piece = { ...item.piece, hash: contentHash(item.piece.bytes) };
    step('scout', 'finished', `${Math.round(piece.bytes.length / 1024)} KB image`);
    return [piece];
  }

  /** Fetches the listing, then lets the Scout agent open detail pages. Null when the site cannot be fetched. */
  private async scoutSite(item: Extract<SwarmItem, { kind: 'site' }>, step: Step): Promise<HashedPiece[] | null> {
    step('scout', 'started', `fetching ${item.name}`);
    let listing: HashedPiece[];
    try {
      const page = await fetchSite(item.url, this.fetchImpl);
      listing = page.chunks.map((text) => ({ sourceRef: page.url, mime: 'text/plain', bytes: Buffer.from(text), text, hash: contentHash(Buffer.from(text)) }));
    } catch (err) {
      step('scout', 'failed', errorText(err));
      return null;
    }
    const fresh = await this.unseen(listing);
    // An unchanged listing means nothing new to scout, so skip the model calls entirely.
    if (fresh.length === 0) {
      step('scout', 'finished', 'unchanged since the last scrape');
      return [];
    }

    let details: HashedPiece[] = [];
    if (this.gemini) {
      try {
        const opened = await scout({
          gemini: this.gemini,
          listingUrl: item.url,
          listingText: listing.map((p) => p.text).join('\n'),
          fetchPage: (url) => fetchPage(url, this.fetchImpl),
          maxPages: this.deps.scoutPages,
          onOpen: (url, reason) => step('scout', 'started', `opening ${shortPath(url)}: ${reason}`),
        });
        details = await this.unseen(opened.map((o) => ({ sourceRef: o.url, mime: 'text/plain', bytes: Buffer.from(o.text), text: o.text, hash: contentHash(Buffer.from(o.text)) })));
      } catch (err) {
        console.error(`scout agent failed on ${item.url}, reading the listing only:`, err);
      }
    }
    step('scout', 'finished', `listing${details.length ? ` + ${plural(details.length, 'detail page')} chosen by the scout` : ''}`);
    return [...fresh, ...details];
  }

  /** Runs the Critic on each read that has College Ave events and re-reads flagged pieces once. Returns a summary. */
  private async critiqueAndReread(results: PieceResult[], buildings: Building[], now: string, step: Step): Promise<string> {
    if (!this.gemini) return '';
    let approved = 0;
    let flagged = 0;
    const toReread: { r: PieceResult; notes: string[] }[] = [];
    for (const r of results) {
      // The Critic only spends a call where its answer can change what lands on the map.
      if (!r.drafts?.some((d) => d.campus === 'college_ave')) continue;
      try {
        const c = await critique(readerInput(r.piece), r.drafts, { gemini: this.gemini, buildings, now });
        if (c.notes.length === 0) approved += r.drafts.length;
        else {
          flagged += c.flagged + c.missed;
          toReread.push({ r, notes: c.notes });
        }
      } catch (err) {
        console.error('critic failed, keeping the first read:', err);
      }
    }
    if (toReread.length > 0) {
      step('reconciler', 'started', `re-reading ${plural(toReread.length, 'piece')} with the critic's notes: ${toReread[0].notes[0]}`);
      let fixed = 0;
      for (const { r, notes } of toReread) {
        try {
          r.drafts = await readItem(readerInput(r.piece), { gemini: this.gemini, buildings, now }, notes);
          fixed++;
        } catch (err) {
          console.error('re-read failed, keeping the first read:', err);
        }
      }
      step('reconciler', 'finished', `second read done for ${plural(fixed, 'piece')}`);
    }
    if (approved === 0 && flagged === 0) return '';
    return `critic approved ${approved}${flagged ? `, flagged ${flagged} for a second read` : ''}`;
  }

  private async unseen<T extends { hash: string }>(pieces: T[]): Promise<T[]> {
    let done = new Set<string>();
    if (this.deps.pool && pieces.length) {
      try {
        const res = await this.deps.pool.query<{ content_hash: string }>(
          `SELECT content_hash FROM raw_items WHERE status = 'done' AND content_hash = ANY($1)`,
          [pieces.map((p) => p.hash)],
        );
        done = new Set(res.rows.map((r) => r.content_hash));
      } catch (err) {
        console.error('ingest seen-check failed:', err);
      }
    }
    return pieces.filter((p) => !this.seen.has(p.hash) && !done.has(p.hash));
  }

  private async markDone(hash: string, rawId: string | null): Promise<void> {
    this.seen.add(hash);
    if (rawId) await this.db(`UPDATE raw_items SET status = 'done' WHERE id = $1`, [rawId]);
  }

  /** Stores the piece in raw_items. The same content reuses its row. Null without a database or on a write error. */
  private async saveRawItem(runId: string, sourceType: 'upload' | 'board', piece: HashedPiece): Promise<string | null> {
    if (!this.deps.pool) return null;
    try {
      const res = await this.deps.pool.query<{ id: string }>(
        `INSERT INTO raw_items (run_id, source_type, source_ref, content_hash, mime, bytes, caption, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'processing')
         ON CONFLICT (content_hash) DO UPDATE SET run_id = EXCLUDED.run_id, status = 'processing', error = NULL
         RETURNING id`,
        [runId, sourceType, piece.sourceRef, piece.hash, piece.mime, piece.bytes, piece.mime.startsWith('image/') ? piece.text ?? null : null],
      );
      return res.rows[0].id;
    } catch (err) {
      console.error('ingest raw_items write failed:', err);
      return null;
    }
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
