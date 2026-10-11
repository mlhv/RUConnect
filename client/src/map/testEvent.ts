import type { CampusEvent } from '@ruconnect/shared';

/** A local-time instant on Oct 10, 2026, so tests do not depend on the machine's time zone. */
export const at = (hour: number, minute = 0, day = 10): string => new Date(2026, 9, day, hour, minute).toISOString();

export function makeEvent(over: Partial<CampusEvent> = {}): CampusEvent {
  return {
    id: 'e1', title: 'Event', description: '', category: 'club', buildingId: 'b1', room: null,
    start: at(13), end: at(15), expectedAttendance: null, tags: [], freeFood: false,
    source: 'seed', status: 'published', confidence: 1, createdAt: at(9),
    ...over,
  };
}
