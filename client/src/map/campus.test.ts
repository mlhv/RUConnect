import { describe, expect, it } from 'vitest';
import { parseSeedBuildings } from '@ruconnect/shared';
import seedBuildings from '../../../data/buildings.json';
import { CAMPUSES, campusAt, campusOf, flightMs, liveCounts } from './campus';
import { at, makeEvent } from './testEvent';

const buildings = parseSeedBuildings(seedBuildings);
const building = (id: string) => buildings.find((b) => b.id === id)!;

describe('campusOf', () => {
  it('places a landmark of each campus on its own campus', () => {
    expect(campusOf(building('alexander-library')).id).toBe('college_ave');
    expect(campusOf(building('hill-center')).id).toBe('busch');
    expect(campusOf(building('jersey-mikes-arena')).id).toBe('livingston');
    expect(campusOf(building('cook-student-center')).id).toBe('cook_douglass');
  });

  it('sorts every seed building onto the campus it was added for', () => {
    const counts = new Map<string, number>();
    for (const b of buildings) counts.set(campusOf(b).id, (counts.get(campusOf(b).id) ?? 0) + 1);
    expect(Object.fromEntries(counts)).toEqual({ college_ave: 12, busch: 10, livingston: 9, cook_douglass: 10 });
  });
});

describe('campusAt', () => {
  it('names the campus whose centre is nearest to a point', () => {
    const [lng, lat] = CAMPUSES.find((c) => c.id === 'livingston')!.center;
    expect(campusAt(lng + 0.001, lat - 0.001).id).toBe('livingston');
  });
});

describe('liveCounts', () => {
  it('counts the events under way on each campus, with zero for a quiet one', () => {
    const events = [
      makeEvent({ id: 'a', buildingId: 'hill-center' }),
      makeEvent({ id: 'b', buildingId: 'serc' }),
      makeEvent({ id: 'c', buildingId: 'tillett-hall' }),
      makeEvent({ id: 'later', buildingId: 'hickman-hall', start: at(18), end: at(19) }),
    ];
    expect(liveCounts(events, buildings, at(13, 30))).toEqual(
      new Map([['college_ave', 0], ['busch', 2], ['livingston', 1], ['cook_douglass', 0]]),
    );
  });

  it('skips an event whose building is not on the map', () => {
    const counts = liveCounts([makeEvent({ buildingId: 'nowhere' })], buildings, at(13, 30));
    expect([...counts.values()]).toEqual([0, 0, 0, 0]);
  });
});

describe('flightMs', () => {
  it('keeps the usual flight time for a hop within a campus', () => {
    expect(flightMs(300)).toBe(3200);
  });

  it('takes longer to cross between campuses', () => {
    expect(flightMs(2500)).toBeGreaterThan(flightMs(300));
    expect(flightMs(4000)).toBeGreaterThan(flightMs(2500));
  });

  it('never takes more than six seconds', () => {
    expect(flightMs(50_000)).toBe(6000);
  });
});
