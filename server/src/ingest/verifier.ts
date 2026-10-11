import { EventInputSchema, type EventInput } from '@ruconnect/shared';
import type { ReaderDraft } from './reader';

type EventSource = EventInput['source'];

export const PUBLISH_THRESHOLD = 0.8;
const DAY_MS = 24 * 60 * 60 * 1000;
/** Dates outside [now - 1 day, now + 90 days] are probably misread and go to review. */
const PLAUSIBLE_PAST_MS = DAY_MS;
const PLAUSIBLE_FUTURE_MS = 90 * DAY_MS;

/** `skipped` drafts are not College Ave events, or lack what the map needs. They are expected, not errors. */
export type VerifyResult =
  | { ok: true; event: EventInput; notes: string[] }
  | { ok: false; reason: string };

/** Turns a draft into a saveable event, or explains why it is skipped. */
export function verify(draft: ReaderDraft, opts: { source: EventSource; now: string }): VerifyResult {
  if (!draft.title) return { ok: false, reason: 'no title' };
  // Only College Ave is on the map for now. Widening this is the switch for other campuses.
  if (draft.campus !== 'college_ave') return { ok: false, reason: `not College Ave (${draft.campus})` };
  if (!draft.start) return { ok: false, reason: 'no date or time' };
  if (!draft.buildingId) return { ok: false, reason: `no building matches "${draft.locationText ?? 'unknown location'}"` };

  const notes: string[] = [];
  let confidence = Math.min(draft.confidence.title, draft.confidence.time, draft.confidence.location);

  const now = Date.parse(opts.now);
  const start = Date.parse(draft.start);
  if (start < now - PLAUSIBLE_PAST_MS || start > now + PLAUSIBLE_FUTURE_MS) {
    notes.push('date looks implausible');
    confidence = Math.min(confidence, 0.5);
  }

  const parsed = EventInputSchema.safeParse({
    title: draft.title,
    description: draft.description,
    category: draft.category,
    buildingId: draft.buildingId,
    room: draft.room,
    start: draft.start,
    end: draft.end ?? new Date(start + 60 * 60 * 1000).toISOString(),
    expectedAttendance: draft.expectedAttendance,
    tags: draft.tags,
    freeFood: draft.freeFood,
    source: opts.source,
    status: confidence >= PUBLISH_THRESHOLD ? 'published' : 'needs_review',
    confidence,
  });
  if (!parsed.success) {
    return { ok: false, reason: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') };
  }
  return { ok: true, event: parsed.data, notes };
}
