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
import { draft, events, scriptedGemini } from './testGemini';

const flyer = Buffer.from('fixture-flyer-bytes');
const cachedEvent: EventInput = {
  title: 'Cached Robotics Night', description: '', category: 'club', buildingId: 'scott-hall', room: null,
  start: '2026-10-10T20:00:00-04:00', end: '2026-10-10T21:00:00-04:00', expectedAttendance: null,
  tags: [], freeFood: false, source: 'flyer', status: 'published', confidence: 1,
};

/** Serves `listing` for the listing URL, `detail` for /event/ pages, and 404 for later listing pages. */
const fakeFetch = (listing: string, detail = '<p>Room 105</p>'): typeof fetch => async (input) => {
  const url = String(input);
  if (url.includes('?page=')) return new Response('', { status: 404 });
  return new Response(url.includes('/event/') ? detail : listing, { status: 200 });
};

function setup(gemini: Gemini | null, opts: { fetchImpl?: typeof fetch } = {}) {
  const seed = testFixture();
  const store = new MemoryStore(seed.buildings, seed.events);
  const deps = { config: loadConfig({ MOCK: '1', DEMO_NOW: '2026-10-10T19:30:00-04:00' }), store, pool: null };
  const cache = new ExtractionCache({ [contentHash(flyer)]: [cachedEvent] });
  const app = express();
  app.use(express.json());
  app.use('/api/ingest', ingestRouter(deps, {
    gemini, cache, replayDelayMs: 0,
    sites: ['https://zimmerli.rutgers.edu/events'],
    fetchImpl: opts.fetchImpl ?? fakeFetch('<p>Highlights Tour, Oct 11 <a href="/event/tour">details</a></p>'),
  }));
  app.use(errorHandler);
  return { app, store };
}

type Message = { type: string; data: any };

async function readStream(app: express.Express, runId: string): Promise<Message[]> {
  const stream = await request(app).get(`/api/ingest/runs/${runId}/stream`);
  return stream.text.trim().split('\n\n').map((block) => {
    const [eventLine, dataLine] = block.split('\n');
    return { type: eventLine.slice('event: '.length), data: JSON.parse(dataLine.slice('data: '.length)) };
  });
}

async function uploadOne(app: express.Express, bytes: Buffer) {
  const started = await request(app).post('/api/ingest/runs').attach('files', bytes, { filename: 'flyer.png', contentType: 'image/png' });
  expect(started.status).toBe(202);
  return readStream(app, started.body.runId);
}

async function scrape(app: express.Express) {
  const started = await request(app).post('/api/ingest/runs').send({ capture: 'board' });
  expect(started.status).toBe(202);
  return readStream(app, started.body.runId);
}

const workers = (messages: Message[]) =>
  [...new Set(messages.filter((m) => m.type === 'step').map((m) => m.data.worker))];
const saved = (messages: Message[]) => messages.filter((m) => m.type === 'event').map((m) => m.data.event);
const last = (messages: Message[], worker: string) => messages.filter((m) => m.type === 'step' && m.data.worker === worker).at(-1)?.data;

describe('ingest API: flyer uploads', () => {
  it('replays a cached flyer in mock mode and publishes it', async () => {
    const { app, store } = setup(null);
    const messages = await uploadOne(app, flyer);
    expect(workers(messages)).toEqual(['scout', 'reader', 'verifier', 'deduper']);
    const [event] = saved(messages);
    expect(event).toMatchObject({ title: 'Cached Robotics Night', status: 'published' });
    expect(messages.at(-1)?.data).toMatchObject({ items: 1, eventsCreated: 1, failed: 0 });
    expect(await store.getEvent(event.id)).not.toBeNull();
  });

  it('fails an uncached image without Gemini, without aborting the run', async () => {
    const { app } = setup(null);
    const messages = await uploadOne(app, Buffer.from('unknown'));
    expect(last(messages, 'reader')).toMatchObject({ state: 'failed' });
    expect(messages.at(-1)?.data).toMatchObject({ failed: 1, eventsCreated: 0 });
  });

  it('falls back to the cache when Gemini throws', async () => {
    const broken: Gemini = { generateJson: async () => { throw new Error('quota exceeded'); }, runTools: async () => '' };
    expect(saved(await uploadOne(setup(broken).app, flyer))[0]?.title).toBe('Cached Robotics Night');
  });

  it('sends a flyer back to the Reader when the Critic finds a mistake', async () => {
    const s = scriptedGemini({
      reader: [events(draft({ start: '2026-10-11T14:00:00-04:00' })), events(draft({ start: '2026-10-11T20:00:00-04:00' }))],
      critic: [JSON.stringify({ reviews: [{ index: 0, ok: false, problems: ['the flyer says 8 PM, not 2 PM'] }], missed: [] })],
    });
    const messages = await uploadOne(setup(s.gemini).app, Buffer.from('new flyer'));
    expect(workers(messages)).toEqual(['scout', 'reader', 'verifier', 'reconciler', 'deduper']);
    expect(s.calls.find((c) => c.agent === 'reader' && c.prompt.includes('8 PM, not 2 PM'))).toBeDefined();
    expect(saved(messages)[0].start).toBe('2026-10-11T20:00:00-04:00');
    expect(last(messages, 'verifier').summary).toContain('flagged 1 for a second read');
  });

  it('saves a low-confidence read as needs_review', async () => {
    const s = scriptedGemini({ reader: [events(draft({ confidence: { title: 0.9, time: 0.5, location: 0.9 } }))] });
    const messages = await uploadOne(setup(s.gemini).app, Buffer.from('blurry'));
    expect(saved(messages)[0]).toMatchObject({ status: 'needs_review', confidence: 0.5, source: 'flyer' });
    expect(messages.at(-1)?.data).toMatchObject({ eventsCreated: 1, sentToReview: 1 });
  });

  it('rejects non-image uploads, and answers 501 for Instagram and empty requests', async () => {
    const { app } = setup(null);
    const res = await request(app).post('/api/ingest/runs').attach('files', Buffer.from('x'), { filename: 'a.txt', contentType: 'text/plain' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('unsupported_file_type');
    expect((await request(app).post('/api/ingest/runs').send({ capture: 'instagram' })).status).toBe(501);
    expect((await request(app).post('/api/ingest/runs')).status).toBe(501);
  });

  it('reports an unknown run on the stream', async () => {
    expect((await request(setup(null).app).get('/api/ingest/runs/nope/stream')).text).toContain('unknown_run');
  });
});

describe('ingest API: site scraping', () => {
  it('runs the whole team: the Scout opens a detail page, College Ave events are saved, the rest skipped', async () => {
    const s = scriptedGemini({
      scoutOpens: ['https://zimmerli.rutgers.edu/event/tour'],
      reader: [
        events(draft(), draft({ title: 'Busch Yoga', campus: 'busch', buildingId: null }), draft({ title: 'Webinar', campus: 'online', buildingId: null })),
        events(draft({ room: '105' })),
      ],
    });
    const messages = await scrape(setup(s.gemini).app);
    expect(workers(messages)).toEqual(['scout', 'reader', 'verifier', 'deduper']);
    expect(messages.some((m) => m.data.summary?.startsWith('opening tour: listing has no room'))).toBe(true);
    // The listing and the detail page both describe the tour; the Deduper keeps one.
    expect(saved(messages)).toHaveLength(1);
    expect(saved(messages)[0]).toMatchObject({ title: 'Highlights Tour', source: 'board', buildingId: 'voorhees-hall' });
    expect(last(messages, 'verifier').summary).toContain('2 skipped: not College Ave');
    expect(messages.at(-1)?.data).toMatchObject({ items: 1, eventsCreated: 1, skipped: 2, duplicates: 1 });
    expect(s.count('scout')).toBe(1);
  });

  it('does not scout or read an unchanged listing again', async () => {
    const s = scriptedGemini({ reader: [events(draft())] });
    const { app } = setup(s.gemini);
    await scrape(app);
    const second = await scrape(app);
    expect(s.count('scout')).toBe(1);
    expect(s.count('reader')).toBe(1);
    expect(last(second, 'scout').summary).toBe('unchanged since the last scrape');
  });

  it('asks the Deduper agent about a differently titled event already on the map', async () => {
    const s = scriptedGemini({
      reader: [events(draft({ title: 'RU Robotics: Meet the Team', buildingId: 'scott-hall', start: '2026-10-10T19:15:00-04:00' }))],
      deduper: ['{"sameAsId":"seed-robotics-info","reason":"same club and time"}'],
    });
    const messages = await scrape(setup(s.gemini).app);
    expect(saved(messages)).toHaveLength(0);
    expect(last(messages, 'deduper').summary).toContain('"RU Robotics: Meet the Team" is "Robotics Club Info Session"');
  });

  it('marks a site that cannot be fetched as failed and finishes the run', async () => {
    const down: typeof fetch = async () => new Response('', { status: 403 });
    const messages = await scrape(setup(scriptedGemini().gemini, { fetchImpl: down }).app);
    expect(last(messages, 'scout')).toMatchObject({ state: 'failed', summary: 'zimmerli.rutgers.edu answered 403' });
    expect(messages.at(-1)?.data).toMatchObject({ failed: 1 });
  });
});
