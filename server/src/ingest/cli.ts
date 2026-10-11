/**
 * Reads flyer photos with real Gemini and prints the result. With --save, adds each publishable
 * result to data/extraction.cache.json so the demo can replay it without Gemini.
 *
 *   npx tsx server/src/ingest/cli.ts data/captures/test-flyers/*.jpg [--save]
 */
import { readFileSync } from 'node:fs';
import { basename, extname } from 'node:path';
import { loadConfig, loadEnvFile } from '../core/config';
import { loadSeed } from '../core/seed';
import { contentHash, ExtractionCache } from './cache';
import { createGemini } from './gemini';
import { readFlyer } from './reader';
import { verify } from './verifier';

const MIME: Record<string, string> = {
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.heic': 'image/heic',
};

loadEnvFile();
const config = loadConfig({ ...process.env, MOCK: '1' }); // reads buildings from data/, never the database
const gemini = createGemini(config);
if (!gemini) {
  console.error('Set GEMINI_API_KEY and GEMINI_VISION_MODEL in .env first.');
  process.exit(1);
}

const args = process.argv.slice(2);
const save = args.includes('--save');
const files = args.filter((a) => a !== '--save');
const { buildings } = loadSeed();
const cache = ExtractionCache.load();
const now = config.demoNow ?? new Date().toISOString();

for (const file of files) {
  const mime = MIME[extname(file).toLowerCase()];
  if (!mime) {
    console.log(`\n${basename(file)}: skipped, not an image`);
    continue;
  }
  const image = readFileSync(file);
  try {
    const draft = await readFlyer({ image, mime }, { gemini, buildings, now });
    const result = verify(draft, { source: 'flyer', now });
    console.log(`\n${basename(file)}:`, JSON.stringify(result.ok ? result.event : { rejected: result.reason, draft }, null, 2));
    if (save && result.ok) cache.set(contentHash(image), { ...result.event, status: 'published', confidence: 1 });
  } catch (err) {
    console.log(`\n${basename(file)}: failed: ${err instanceof Error ? err.message : err}`);
  }
}

if (save) {
  cache.save();
  console.log('\nSaved to data/extraction.cache.json. Check the entries before committing; fix any wrong field by hand.');
}
