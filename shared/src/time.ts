import type { CampusEvent } from './schemas';

/** Active from the start instant up to, but not including, the end instant. */
export function isActiveAt(event: Pick<CampusEvent, 'start' | 'end'>, iso: string): boolean {
  const t = Date.parse(iso);
  return Date.parse(event.start) <= t && t < Date.parse(event.end);
}

export function activeBuildingIds(events: CampusEvent[], iso: string): Set<string> {
  const ids = new Set<string>();
  for (const e of events) {
    if (e.status === 'published' && isActiveAt(e, iso)) ids.add(e.buildingId);
  }
  return ids;
}
