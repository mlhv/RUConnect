import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type pg from 'pg';
import { loadSeed } from '../seed';
import { migrate, seedDb } from './migrate';
import { PgStore } from './pgStore';
import { createPool } from './pool';

const url = process.env.TEST_DATABASE_URL;
const schema = `test_${Date.now()}`;

describe.skipIf(!url)('PgStore against a real database', () => {
  let pool: pg.Pool;
  let store: PgStore;

  beforeAll(async () => {
    pool = createPool(url!, schema);
    await migrate(pool, schema);
    const seed = loadSeed();
    await seedDb(pool, schema, seed.buildings, seed.events);
    store = new PgStore(pool);
  });

  afterAll(async () => {
    await pool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await pool.end();
  });

  it('migrating twice applies nothing the second time', async () => {
    expect(await migrate(pool, schema)).toEqual([]);
  });

  it('returns seeded buildings with footprints', async () => {
    const buildings = await store.listBuildings();
    expect(buildings).toHaveLength(12);
    expect(buildings[0].footprint.length).toBeGreaterThanOrEqual(4);
  });

  it('lists events overlapping a window', async () => {
    const ids = (await store.listEvents({
      from: '2026-10-10T19:00:00-04:00', to: '2026-10-10T19:30:00-04:00', status: 'published',
    })).map((e) => e.id);
    expect(ids).toContain('seed-robotics-info');
    expect(ids).not.toContain('seed-pickup-basketball');
  });

  it('creates and updates an event', async () => {
    const created = await store.createEvent({
      title: 'PG Test', description: '', category: 'other', buildingId: 'scott-hall', room: null,
      start: '2026-10-10T12:00:00-04:00', end: '2026-10-10T13:00:00-04:00', expectedAttendance: null,
      tags: ['a'], freeFood: false, source: 'manual', status: 'needs_review', confidence: 0.5,
    });
    expect(created.start).toBe('2026-10-10T16:00:00.000Z');
    const updated = await store.updateEvent(created.id, { status: 'published' });
    expect(updated?.status).toBe('published');
    expect(await store.updateEvent('missing', { title: 'x' })).toBeNull();
  });
});
