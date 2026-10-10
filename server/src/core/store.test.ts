import { describe, expect, it } from 'vitest';
import { loadSeed } from './seed';
import { MemoryStore } from './store';

const make = () => {
  const seed = loadSeed();
  return new MemoryStore(seed.buildings, seed.events);
};

const input = {
  title: 'Test', description: '', category: 'other' as const, buildingId: 'scott-hall', room: null,
  start: '2026-10-10T12:00:00-04:00', end: '2026-10-10T13:00:00-04:00', expectedAttendance: null,
  tags: [], freeFood: false, source: 'manual' as const, status: 'needs_review' as const, confidence: 0.5,
};

describe('MemoryStore', () => {
  it('lists events overlapping a window, sorted by start', async () => {
    const events = await make().listEvents({
      from: '2026-10-10T19:00:00-04:00', to: '2026-10-10T19:30:00-04:00', status: 'published',
    });
    const ids = events.map((e) => e.id);
    expect(ids).toContain('seed-robotics-info');
    expect(ids).not.toContain('seed-pickup-basketball'); // ends exactly at 19:00
    expect(ids).not.toContain('seed-film-screening'); // starts exactly at 19:30
    const starts = events.map((e) => Date.parse(e.start));
    expect(starts).toEqual([...starts].sort((a, b) => a - b));
  });

  it('filters by building and status', async () => {
    const store = make();
    await store.createEvent(input);
    expect(await store.listEvents({ buildingId: 'scott-hall', status: 'needs_review' })).toHaveLength(1);
    expect(await store.listEvents({ buildingId: 'scott-hall', status: 'published' })).toHaveLength(1);
  });

  it('creates, reads, and updates an event', async () => {
    const store = make();
    const created = await store.createEvent(input);
    expect(created.id).toBeTruthy();
    const updated = await store.updateEvent(created.id, { status: 'published' });
    expect(updated?.status).toBe('published');
    expect((await store.getEvent(created.id))?.title).toBe('Test');
    expect(await store.updateEvent('missing', { title: 'x' })).toBeNull();
  });
});
