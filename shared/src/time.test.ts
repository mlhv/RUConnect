import { describe, expect, it } from 'vitest';
import { activeBuildingIds, isActiveAt, type CampusEvent } from './index';

const ev = { start: '2026-10-10T19:00:00-04:00', end: '2026-10-10T20:00:00-04:00' };

describe('isActiveAt', () => {
  it('is active at the start instant and inactive at the end instant', () => {
    expect(isActiveAt(ev, '2026-10-10T19:00:00-04:00')).toBe(true);
    expect(isActiveAt(ev, '2026-10-10T19:59:59-04:00')).toBe(true);
    expect(isActiveAt(ev, '2026-10-10T20:00:00-04:00')).toBe(false);
    expect(isActiveAt(ev, '2026-10-10T18:59:59-04:00')).toBe(false);
  });

  it('treats Z and offset times as the same instant', () => {
    expect(isActiveAt(ev, '2026-10-10T23:30:00Z')).toBe(true);
  });
});

describe('activeBuildingIds', () => {
  it('returns buildings with a published event at that time', () => {
    const mk = (buildingId: string, status: 'published' | 'needs_review') =>
      ({ ...ev, buildingId, status }) as CampusEvent;
    const ids = activeBuildingIds([mk('a', 'published'), mk('b', 'needs_review')], '2026-10-10T19:30:00-04:00');
    expect([...ids]).toEqual(['a']);
  });
});
