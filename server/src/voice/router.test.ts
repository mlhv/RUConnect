import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Express } from 'express';
import { createApp } from '../core/app';
import { loadConfig } from '../core/config';
import { MemoryStore } from '../core/store';
import { testFixture } from '../core/testFixture';

let app: Express;
beforeEach(() => {
  const seed = testFixture();
  app = createApp({
    config: loadConfig({ MOCK: '1', DEMO_NOW: '2026-10-10T19:30:00-04:00' }),
    store: new MemoryStore(seed.buildings, seed.events),
    pool: null,
  });
});

const search = (body?: object) => request(app).post('/api/voice/search').send(body);
const ids = (hits: { event: { id: string } }[]) => hits.map((h) => h.event.id);

describe('POST /api/voice/search', () => {
  it('returns events in the default window when the body is empty', async () => {
    const res = await search({});
    expect(res.status).toBe(200);
    expect(ids(res.body.matches)).toEqual(['seed-robotics-info', 'seed-film-screening']);
    expect(res.body.later).toEqual([]);
  });

  it('accepts a request with no body at all', async () => {
    expect((await search()).status).toBe(200);
  });

  it('ranks by the query', async () => {
    const res = await search({ query: 'film' });
    expect(ids(res.body.matches)[0]).toBe('seed-film-screening');
  });

  it('offers later events when the window is empty', async () => {
    const res = await search({ from: '2026-10-11T08:00:00-04:00', to: '2026-10-11T09:00:00-04:00' });
    expect(res.body.matches).toEqual([]);
    expect(ids(res.body.later)).toEqual(['seed-brunch-social', 'seed-writing-workshop']);
  });

  it('offers an event that starts exactly three hours after the window ends', async () => {
    const res = await search({ from: '2026-10-11T06:00:00-04:00', to: '2026-10-11T07:00:00-04:00' });
    expect(res.body.matches).toEqual([]);
    expect(ids(res.body.later)).toContain('seed-brunch-social');
  });

  it('rejects malformed input', async () => {
    const res = await search({ from: 'yesterday' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('invalid_request');
    expect((await search({ freeFood: true })).status).toBe(400);
  });

  it('rejects a window that is already over', async () => {
    const res = await search({ to: '2026-10-10T16:00:00-04:00' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('invalid_window');
  });

  it('rejects an unknown anchor building', async () => {
    const res = await search({ nearBuildingId: 'nowhere' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('unknown_building');
  });
});
