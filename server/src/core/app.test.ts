import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Express } from 'express';
import { createApp } from './app';
import { loadConfig } from './config';
import { testFixture } from './testFixture';
import { MemoryStore } from './store';

let app: Express;
beforeEach(() => {
  const seed = testFixture();
  app = createApp({
    config: loadConfig({ MOCK: '1', DEMO_NOW: '2026-10-10T19:30:00-04:00' }),
    store: new MemoryStore(seed.buildings, seed.events),
    pool: null,
  });
});

const body = {
  title: 'New Event', category: 'club', buildingId: 'scott-hall',
  start: '2026-10-10T12:00:00-04:00', end: '2026-10-10T13:00:00-04:00',
};

describe('core API', () => {
  it('reports health and config', async () => {
    expect((await request(app).get('/api/health')).body).toMatchObject({ ok: true, mock: true });
    expect((await request(app).get('/api/config')).body).toEqual({ now: '2026-10-10T23:30:00.000Z' });
  });

  it('lists buildings with footprints', async () => {
    const res = await request(app).get('/api/buildings');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(4);
    expect(res.body[0].footprint.length).toBeGreaterThanOrEqual(4);
  });

  it('lists published events and filters by window', async () => {
    const all = await request(app).get('/api/events');
    expect(all.body).toHaveLength(6);
    const win = await request(app)
      .get('/api/events')
      .query({ from: '2026-10-11T00:00:00-04:00', to: '2026-10-11T23:59:00-04:00' });
    expect(win.body.map((e: { id: string }) => e.id).sort()).toEqual(
      ['seed-brunch-social', 'seed-fall-concert', 'seed-writing-workshop'],
    );
  });

  it('rejects a malformed query', async () => {
    const res = await request(app).get('/api/events').query({ from: 'yesterday' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('invalid_request');
  });

  it('creates an event that then appears in the list', async () => {
    const created = await request(app).post('/api/events').send(body);
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ title: 'New Event', status: 'published', source: 'manual' });
    const list = await request(app).get('/api/events').query({ buildingId: 'scott-hall' });
    expect(list.body.map((e: { id: string }) => e.id)).toContain(created.body.id);
  });

  it('rejects an event whose end is not after its start', async () => {
    const res = await request(app).post('/api/events').send({ ...body, end: body.start });
    expect(res.status).toBe(400);
  });

  it('rejects an event in an unknown building', async () => {
    const res = await request(app).post('/api/events').send({ ...body, buildingId: 'nowhere' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('unknown_building');
  });

  it('rejects malformed JSON with 400', async () => {
    const res = await request(app).post('/api/events').set('Content-Type', 'application/json').send('{"title":');
    expect(res.status).toBe(400);
  });

  it('approves a needs_review event through PATCH', async () => {
    const draft = await request(app).post('/api/events').send({ ...body, status: 'needs_review', confidence: 0.4 });
    const res = await request(app).patch(`/api/events/${draft.body.id}`).send({ status: 'published' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('published');
    expect(res.body.title).toBe('New Event');
  });

  it('rejects a PATCH that moves the end before the stored start', async () => {
    const res = await request(app)
      .patch('/api/events/seed-robotics-info')
      .send({ end: '2026-10-10T18:00:00-04:00' });
    expect(res.status).toBe(400);
    const after = await request(app).get('/api/events').query({ buildingId: 'scott-hall' });
    expect(after.body[0].end).toBe('2026-10-10T20:30:00-04:00');
  });

  it('returns 404 for an unknown event and an unknown API path', async () => {
    expect((await request(app).patch('/api/events/missing').send({ title: 'x' })).status).toBe(404);
    const res = await request(app).get('/api/nope');
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('not_found');
  });

  it('answers 501 from slice routers that are not built yet', async () => {
    expect((await request(app).post('/api/ingest/runs')).status).toBe(501);
  });
});
