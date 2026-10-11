import { describe, expect, it } from 'vitest';
import type { EventInput } from '@ruconnect/shared';
import { MemoryStore, type Store } from '../core/store';
import { testFixture } from '../core/testFixture';
import { contentHash, ExtractionCache } from './cache';
import type { Gemini } from './gemini';
import { Swarm, type RunMessage, type SwarmItem } from './swarm';
import { draft, events, scriptedGemini } from './testGemini';

const flyer = Buffer.from('cached-flyer');
const cachedEvent: EventInput = {
  title: 'Cached Robotics Night', description: '', category: 'club', buildingId: 'scott-hall', room: null,
  start: '2026-10-15T19:00:00-04:00', end: '2026-10-15T20:00:00-04:00', expectedAttendance: null,
  tags: [], freeFood: false, source: 'flyer', status: 'published', confidence: 1,
};
const upload = (bytes: Buffer): SwarmItem => ({ kind: 'upload', name: 'flyer.png', piece: { sourceRef: 'flyer.png', mime: 'image/png', bytes } });
const never = () => new Promise<string>(() => {});

function swarm(gemini: Gemini | null, store?: Store) {
  const seed = testFixture();
  return new Swarm({
    store: store ?? new MemoryStore(seed.buildings, seed.events),
    pool: null,
    gemini,
    cache: new ExtractionCache({ [contentHash(flyer)]: [cachedEvent] }),
    concurrency: 2,
    now: () => '2026-10-10T19:30:00-04:00',
    cachedReadDeadlineMs: 50,
  });
}

/** Runs the items and collects every message until `done`. */
function run(s: Swarm, items: SwarmItem[]): Promise<RunMessage[]> {
  const { runId } = s.start(items);
  return new Promise((resolve) => {
    const messages: RunMessage[] = [];
    s.subscribe(runId, (m) => {
      messages.push(m);
      if (m.type === 'done') resolve(messages);
    });
  });
}

describe('swarm', () => {
  it('replays a cached flyer quickly when Gemini hangs on a dead network', async () => {
    const hung: Gemini = { generateJson: never, runTools: never };
    const t = Date.now();
    const messages = await run(swarm(hung), [upload(flyer)]);
    expect(Date.now() - t).toBeLessThan(1000);
    expect(messages.find((m) => m.type === 'event')).toMatchObject({ event: { title: 'Cached Robotics Night' } });
  });

  it('saves the event when the Deduper hangs', async () => {
    const s = scriptedGemini({ reader: [events(draft({ title: 'RU Robotics', buildingId: 'scott-hall', start: '2026-10-10T19:15:00-04:00' }))] });
    // A candidate with a different title exists, so the Deduper asks the model, which never answers.
    const stalled: Gemini = { ...s.gemini, generateJson: (req) => (req.prompt.includes('You are the Deduper') ? never() : s.gemini.generateJson(req)) };
    const messages = await run(swarm(stalled), [upload(Buffer.from('new flyer'))]);
    expect(messages.filter((m) => m.type === 'event')).toHaveLength(1);
  });

  it('ends the run with failures instead of crashing when the store is down', async () => {
    const seed = testFixture();
    const down = new MemoryStore(seed.buildings, seed.events);
    down.listBuildings = async () => { throw new Error('connection refused'); };
    const messages = await run(swarm(null, down), [upload(flyer), upload(Buffer.from('other'))]);
    const failed = messages.filter((m) => m.type === 'step' && m.step.state === 'failed');
    expect(failed).toHaveLength(2);
    expect(failed[0]).toMatchObject({ step: { summary: 'run failed: connection refused' } });
    expect(messages.at(-1)).toMatchObject({ type: 'done', summary: { failed: 2 } });
  });

  it('keeps a run that is still in progress when old runs are dropped', async () => {
    const s = swarm({ generateJson: never, runTools: never });
    const { runId } = s.start([upload(Buffer.from('slow, uncached'))]);
    for (let i = 0; i < 55; i++) await run(s, [upload(flyer)]);
    expect(s.subscribe(runId, () => {})).not.toBeNull();
  });
});
