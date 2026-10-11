/**
 * Runs the full agent team with real Gemini on flyer images and/or the Rutgers event sites, using an
 * in-memory store, and prints each agent's steps. With --save, adds each flyer's published events to
 * data/extraction.cache.json so the demo can replay them.
 *
 *   npx tsx server/src/ingest/cli.ts data/captures/test-flyers/*.png [--save]
 *   npx tsx server/src/ingest/cli.ts --sites
 */
import { readFileSync } from 'node:fs';
import { basename, extname } from 'node:path';
import type { CampusEvent } from '@ruconnect/shared';
import { loadConfig, loadEnvFile } from '../core/config';
import { loadSeed } from '../core/seed';
import { MemoryStore } from '../core/store';
import { contentHash, ExtractionCache } from './cache';
import { createGemini } from './gemini';
import { siteItems } from './router';
import { Swarm, type SwarmItem } from './swarm';

const MIME: Record<string, string> = {
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.heic': 'image/heic',
};

loadEnvFile();
const config = loadConfig({ ...process.env, MOCK: '1' }); // reads buildings and seed events from data/, never the database
const gemini = createGemini(config);
if (!gemini) {
  console.error('Set GEMINI_API_KEY and GEMINI_VISION_MODEL in .env first.');
  process.exit(1);
}

const args = process.argv.slice(2);
const save = args.includes('--save');
const items: SwarmItem[] = args.includes('--sites') ? siteItems() : [];
const hashes = new Map<string, string>();
for (const file of args.filter((a) => !a.startsWith('--'))) {
  const mime = MIME[extname(file).toLowerCase()];
  if (!mime) {
    console.log(`${basename(file)}: skipped, not an image`);
    continue;
  }
  const bytes = readFileSync(file);
  items.push({ kind: 'upload', name: basename(file), piece: { sourceRef: basename(file), mime, bytes } });
  hashes.set(basename(file), contentHash(bytes));
}

const seed = loadSeed();
const cache = ExtractionCache.load();
const swarm = new Swarm({
  store: new MemoryStore(seed.buildings, seed.events),
  pool: null,
  gemini,
  cache: new ExtractionCache(), // read fresh with Gemini; never replay
  concurrency: config.swarmConcurrency,
  now: () => config.demoNow ?? new Date().toISOString(),
});

const { runId, items: started } = swarm.start(items);
const names = new Map(started.map((i) => [i.itemId, i.name]));
const savedByItem = new Map<string, CampusEvent[]>();
await new Promise<void>((resolve) => {
  swarm.subscribe(runId, (m) => {
    if (m.type === 'step') {
      const s = m.step;
      console.log(`${(names.get(s.itemId) ?? '?').padEnd(26)} ${s.worker.padEnd(10)} ${s.state.padEnd(8)} ${s.summary}`);
    } else if (m.type === 'event') {
      const e = m.event;
      console.log(`${''.padEnd(26)} ✓ saved    ${e.status.padEnd(12)} ${e.title} | ${e.buildingId} ${e.room ?? ''} | ${e.start} | food: ${e.freeFood}`);
      const list = savedByItem.get(m.itemId) ?? [];
      list.push(e);
      savedByItem.set(m.itemId, list);
    } else {
      console.log('\ndone:', m.summary);
      resolve();
    }
  });
});

if (save) {
  for (const { itemId, name } of started) {
    const hash = hashes.get(name);
    const events = savedByItem.get(itemId) ?? [];
    if (!hash || events.length === 0) continue;
    cache.set(hash, events.map(({ id: _id, createdAt: _c, ...e }) => ({ ...e, status: 'published' as const, confidence: 1 })));
  }
  cache.save();
  console.log('Saved flyer results to data/extraction.cache.json. Check the entries before committing; fix any wrong field by hand.');
}
