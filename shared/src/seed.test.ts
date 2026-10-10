import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseSeedBuildings, parseSeedEvents } from './index';

const read = (name: string): unknown =>
  JSON.parse(readFileSync(new URL(`../../data/${name}`, import.meta.url), 'utf8'));

describe('seed data', () => {
  const buildings = parseSeedBuildings(read('buildings.json'));
  const events = parseSeedEvents(read('events.seed.json'));

  it('has 12 buildings with unique ids and closed footprints', () => {
    expect(buildings).toHaveLength(12);
    expect(new Set(buildings.map((b) => b.id)).size).toBe(12);
    for (const b of buildings) {
      expect(b.footprint[0]).toEqual(b.footprint[b.footprint.length - 1]);
    }
  });

  it('has at least 10 events with unique ids that reference real buildings', () => {
    expect(events.length).toBeGreaterThanOrEqual(10);
    expect(new Set(events.map((e) => e.id)).size).toBe(events.length);
    const ids = new Set(buildings.map((b) => b.id));
    for (const e of events) expect(ids.has(e.buildingId), `${e.id} -> ${e.buildingId}`).toBe(true);
  });
});
