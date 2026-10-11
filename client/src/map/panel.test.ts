import { describe, expect, it } from 'vitest';
import { eventsForBuilding } from './panel';
import { at, makeEvent } from './testEvent';

describe('eventsForBuilding', () => {
  it('splits a building\'s events into now and later today, each sorted by start', () => {
    const events = [
      makeEvent({ id: 'late', start: at(19), end: at(20) }),
      makeEvent({ id: 'now-b', start: at(13), end: at(15) }),
      makeEvent({ id: 'soon', start: at(16), end: at(17) }),
      makeEvent({ id: 'now-a', start: at(12), end: at(14) }),
    ];
    const { now, later } = eventsForBuilding(events, 'b1', at(13, 30));
    expect(now.map((e) => e.id)).toEqual(['now-a', 'now-b']);
    expect(later.map((e) => e.id)).toEqual(['soon', 'late']);
  });

  it('leaves out other buildings, finished events, other days, and unpublished events', () => {
    const events = [
      makeEvent({ id: 'elsewhere', buildingId: 'b2' }),
      makeEvent({ id: 'over', start: at(9), end: at(10) }),
      makeEvent({ id: 'tomorrow', start: at(14, 0, 11), end: at(15, 0, 11) }),
      makeEvent({ id: 'draft', status: 'needs_review' }),
    ];
    expect(eventsForBuilding(events, 'b1', at(13, 30))).toEqual({ now: [], later: [] });
  });

  it('treats an event ending exactly at the selected time as over', () => {
    const events = [makeEvent({ start: at(12), end: at(13, 30) })];
    expect(eventsForBuilding(events, 'b1', at(13, 30)).now).toEqual([]);
  });
});
