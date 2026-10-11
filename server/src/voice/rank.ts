import type { Building, CampusEvent } from '@ruconnect/shared';
import type { Hit, SearchRequest, SearchResponse } from './schema';

/** Tune these the morning of the demo; rank.test.ts pins the demo ordering. */
export const WEIGHTS = {
  title: 3,
  tags: 3,
  category: 2,
  description: 1,
  categoryArg: 4,
  freeFood: 2,
  near: 3,
  endsAfterWindow: -2,
  attendance: 0.5,
};
export const NEAR_RADIUS_M = 400;
export const ATTENDANCE_CAP = 500;
export const MIN_OVERLAP_MS = 30 * 60_000;
export const DEFAULT_WINDOW_MS = 12 * 3_600_000;
export const LATER_WINDOW_MS = 3 * 3_600_000;
export const MAX_MATCHES = 8;
export const MAX_LATER = 3;
export const MAX_PER_CATEGORY = 2;

const FILLER = new Set([
  'free', 'food', 'event', 'events', 'like', 'something', 'anything', 'near', 'cool', 'fun', 'campus', 'today', 'tonight',
  'a', 'an', 'the', 'and', 'or', 'to', 'of', 'in', 'on', 'at', 'for', 'with', 'by', 'around', 'until', 'till',
  'i', 'm', 'im', 's', 'me', 'my', 'we', 'you', 'it', 'this', 'that', 'there', 'some', 'any',
  'is', 'are', 'am', 'do', 'can', 'have', 'what', 'whats', 'where', 'when', 'want', 'looking',
]);

const split = (text: string): string[] => text.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
const stem = (w: string): string => (w.length > 3 && w.endsWith('s') ? w.slice(0, -1) : w);

/** Lowercased words with a trailing plural "s" removed. */
export function words(text: string): string[] {
  return split(text).map(stem);
}

/** The distinct interest words of a query: filler removed, then normalized like `words`. */
export function queryWords(query: string | undefined): string[] {
  if (!query) return [];
  return [...new Set(split(query).filter((w) => !FILLER.has(w)).map(stem))];
}

function distanceM(a: { lng: number; lat: number }, b: { lng: number; lat: number }): number {
  const rad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.sqrt(h));
}

/** The ingest slice has no deduper yet, so one flyer uploaded twice is two events. Keeps the best-ranked copy. */
function firstOfEachDuplicate(): (hit: Hit) => boolean {
  const seen = new Set<string>();
  return ({ event }) => {
    const key = `${words(event.title).join(' ')}|${event.buildingId}|${Date.parse(event.start)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  };
}

/** The window as epoch milliseconds. `from` is never earlier than now. `to` may be at or before `from`. */
export function resolveWindow(req: SearchRequest, now: string): { from: number; to: number } {
  const nowMs = Date.parse(now);
  const from = Math.max(req.from ? Date.parse(req.from) : nowMs, nowMs);
  const to = req.to ? Date.parse(req.to) : from + DEFAULT_WINDOW_MS;
  return { from, to };
}

function fitsWindow(e: CampusEvent, from: number, to: number): boolean {
  const start = Date.parse(e.start);
  const end = Date.parse(e.end);
  const overlap = Math.min(end, to) - Math.max(start, from);
  return overlap > 0 && overlap >= Math.min(MIN_OVERLAP_MS, end - start, to - from);
}

function fieldWords(e: CampusEvent) {
  return {
    title: new Set(words(e.title)),
    tags: new Set(e.tags.flatMap(words)),
    category: new Set(words(e.category)),
    description: new Set(words(e.description)),
  };
}

/** Whether any of the words appears in the event's title, tags, category, or description. */
function mentions(e: CampusEvent, ws: string[]): boolean {
  const fields = Object.values(fieldWords(e));
  return ws.some((w) => fields.some((f) => f.has(w)));
}

function score(e: CampusEvent, distance: number | null, endsAfterWindow: boolean, q: string[], req: SearchRequest): number {
  const { title, tags, category, description } = fieldWords(e);
  let s = 0;
  for (const w of q) {
    if (title.has(w)) s += WEIGHTS.title;
    if (tags.has(w)) s += WEIGHTS.tags;
    if (category.has(w)) s += WEIGHTS.category;
    if (description.has(w)) s += WEIGHTS.description;
  }
  if (req.category && e.category === req.category) s += WEIGHTS.categoryArg;
  if (req.freeFood === 'prefer' && e.freeFood) s += WEIGHTS.freeFood;
  if (distance !== null) s += WEIGHTS.near * Math.max(0, 1 - distance / NEAR_RADIUS_M);
  if (endsAfterWindow) s += WEIGHTS.endsAfterWindow;
  s += (WEIGHTS.attendance * Math.min(e.expectedAttendance ?? 0, ATTENDANCE_CAP)) / ATTENDANCE_CAP;
  return s;
}

/** Pure: filters by publication, window, and required food, then orders by score. No I/O. */
export function rankEvents(events: CampusEvent[], buildings: Building[], req: SearchRequest, now: string): SearchResponse {
  const { from, to } = resolveWindow(req, now);
  const byId = new Map(buildings.map((b) => [b.id, b]));
  const anchor = req.nearBuildingId ? byId.get(req.nearBuildingId) ?? null : null;
  const q = queryWords(req.query);
  // Interest words only: a number ("until 4") or the anchor's own name ("the library") says nothing about the event.
  const place = new Set(anchor ? [anchor.name, ...anchor.aliases].flatMap(words) : []);
  const interests = q.filter((w) => !/^\d+$/.test(w) && !place.has(w));

  const rank = (list: CampusEvent[]): Hit[] =>
    list
      .map((event) => {
        const building = byId.get(event.buildingId);
        const distance = anchor && building ? distanceM(anchor, building) : null;
        const endsAfterWindow = Date.parse(event.end) > to;
        const hit: Hit = {
          event,
          distanceM: distance === null ? null : Math.round(distance),
          endsAfterWindow,
          matchesQuery: interests.length === 0 || mentions(event, interests),
        };
        return { hit, score: score(event, distance, endsAfterWindow, q, req) };
      })
      .sort(
        (a, b) =>
          b.score - a.score ||
          Date.parse(a.hit.event.start) - Date.parse(b.hit.event.start) ||
          a.hit.event.id.localeCompare(b.hit.event.id),
      )
      .map((s) => s.hit)
      .filter(firstOfEachDuplicate());

  const eligible = events.filter((e) => e.status === 'published' && (req.freeFood !== 'require' || e.freeFood));

  let matches = rank(eligible.filter((e) => fitsWindow(e, from, to)));
  if (q.length === 0 && !req.category) {
    const seen = new Map<string, number>();
    matches = matches.filter((h) => {
      const n = (seen.get(h.event.category) ?? 0) + 1;
      seen.set(h.event.category, n);
      return n <= MAX_PER_CATEGORY;
    });
  }
  matches = matches.slice(0, MAX_MATCHES);

  const later =
    matches.length < 2
      ? rank(
          eligible.filter((e) => {
            const start = Date.parse(e.start);
            return start >= to && start <= to + LATER_WINDOW_MS;
          }),
        ).slice(0, MAX_LATER)
      : [];

  return { matches, later };
}
