import request from 'supertest';
import { describe, expect, it } from 'vitest';
import express from 'express';
import type { EventInput } from '@ruconnect/shared';
import { loadConfig } from '../core/config';
import { errorHandler } from '../core/http';
import { MemoryStore } from '../core/store';
import { testFixture } from '../core/testFixture';
import { contentHash, ExtractionCache } from './cache';
import type { Gemini } from './gemini';
import { ingestRouter } from './router';

const flyer = Buffer.from('fixture-flyer-bytes');
const cachedEvent: EventInput = {
  title: 'Cached Robotics Night', description: '', category: 'club', buildingId: 'scott-hall', room: null,
  start: '2026-10-10T20:00:00-04:00', end: '2026-10-10T21:00:00-04:00', expectedAttendance: null,
  tags: [], freeFood: false, source: 'flyer', status: 'published', confidence: 1,
};

function setup(gemini: Gemini | null) {
  const seed = testFixture();
  const store = new MemoryStore(seed.buildings, seed.events);
  const deps = { config: loadConfig({ MOCK: '1', DEMO_NOW: '2026-10-10T19:30:00-04:00' }), store, pool: null };
  const cache = new ExtractionCache({ [contentHash(flyer)]: cachedEvent });
  const app = express();
  app.use('/api/ingest', ingestRouter(deps, { gemini, cache, replayDelayMs: 0 }));
  app.use(errorHandler);
  return { app, store };
}

/** Uploads one file and returns the parsed stream once the run is done. */
async function runOne(app: express.Express, bytes: Buffer) {
  const started = await request(app).post('/api/ingest/runs').attach('files', bytes, { filename: 'flyer.png', contentType: 'image/png' });
  expect(started.status).toBe(202);
  const stream = await request(app).get(`/api/ingest/runs/${started.body.runId}/stream`);
  const messages = stream.text.trim().split('\n\n').map((block) => {
    const [eventLine, dataLine] = block.split('\n');
    return { type: eventLine.slice('event: '.length), data: JSON.parse(dataLine.slice('data: '.length)) };
  });
  return { started: started.body, messages };
}

describe('ingest API', () => {
  it('replays a cached flyer in mock mode and publishes it', async () => {
    const { app, store } = setup(null);
    const { messages } = await runOne(app, flyer);
    const steps = messages.filter((m) => m.type === 'step').map((m) => `${m.data.worker}:${m.data.state}`);
    expect(steps).toEqual(['scout:started', 'scout:finished', 'reader:started', 'reader:finished', 'verifier:started', 'verifier:finished']);
    const saved = messages.find((m) => m.type === 'event')!.data.event;
    expect(saved).toMatchObject({ title: 'Cached Robotics Night', status: 'published' });
    expect(messages.at(-1)).toEqual({ type: 'done', data: { items: 1, eventsCreated: 1, sentToReview: 0, failed: 0 } });
    expect(await store.getEvent(saved.id)).not.toBeNull();
  });

  it('fails an uncached image without Gemini, without aborting the run', async () => {
    const { app } = setup(null);
    const { messages } = await runOne(app, Buffer.from('unknown'));
    expect(messages.find((m) => m.type === 'step' && m.data.state === 'failed')?.data.worker).toBe('reader');
    expect(messages.at(-1)?.data).toMatchObject({ failed: 1, eventsCreated: 0 });
  });

  it('reads with Gemini and falls back to the cache when Gemini throws', async () => {
    const gemini: Gemini = { readImage: async () => { throw new Error('quota exceeded'); } };
    const { app } = setup(gemini);
    const { messages } = await runOne(app, flyer);
    expect(messages.find((m) => m.type === 'event')?.data.event.title).toBe('Cached Robotics Night');
  });

  it('saves a low-confidence Gemini read as needs_review', async () => {
    const draft = {
      title: 'Blurry Club Meeting', description: '', category: 'club', buildingId: 'voorhees-hall', locationText: null,
      room: null, start: '2026-10-11T18:00:00-04:00', end: null, expectedAttendance: null, tags: [], freeFood: false,
      confidence: { title: 0.9, time: 0.5, location: 0.9 },
    };
    const { app } = setup({ readImage: async () => JSON.stringify(draft) });
    const { messages } = await runOne(app, Buffer.from('blurry'));
    expect(messages.find((m) => m.type === 'event')?.data.event).toMatchObject({ status: 'needs_review', confidence: 0.5 });
    expect(messages.at(-1)?.data).toMatchObject({ eventsCreated: 1, sentToReview: 1 });
  });

  it('rejects non-image uploads and answers 501 for captures', async () => {
    const { app } = setup(null);
    const res = await request(app).post('/api/ingest/runs').attach('files', Buffer.from('x'), { filename: 'a.txt', contentType: 'text/plain' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('unsupported_file_type');
    expect((await request(app).post('/api/ingest/runs').send({ capture: 'instagram' })).status).toBe(501);
  });

  it('reports an unknown run on the stream', async () => {
    const { app } = setup(null);
    expect((await request(app).get('/api/ingest/runs/nope/stream')).text).toContain('unknown_run');
  });
});
