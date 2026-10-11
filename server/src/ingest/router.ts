import { Router, type NextFunction, type Request, type Response } from 'express';
import multer from 'multer';
import type { AppDeps } from '../core/deps';
import { HttpError } from '../core/http';
import { ExtractionCache } from './cache';
import { createGemini, type Gemini } from './gemini';
import { SITES } from './sites';
import { Swarm, type RunMessage, type SwarmItem } from './swarm';

const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']);
const MAX_FILES = 10;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: MAX_FILES },
  fileFilter: (_req, file, cb) => {
    if (IMAGE_TYPES.has(file.mimetype)) cb(null, true);
    else cb(new HttpError(400, 'unsupported_file_type', [{ message: `${file.originalname}: ${file.mimetype}` }]));
  },
}).array('files', MAX_FILES);

/** Multer errors carry no HTTP status, so they would otherwise surface as 500s. */
function parseUpload(req: Request, res: Response, next: NextFunction): void {
  upload(req, res, (err: unknown) => {
    if (err instanceof multer.MulterError) return next(new HttpError(400, 'invalid_upload', [{ message: err.message }]));
    next(err);
  });
}

/** One swarm item per Rutgers events site. */
export const siteItems = (urls: string[] = SITES): SwarmItem[] =>
  urls.map((url) => ({ kind: 'site', name: new URL(url).hostname.replace(/^www\./, ''), url }));

/** Tests pass stubs; the server uses the real ones. */
export interface IngestOverrides {
  gemini?: Gemini | null;
  cache?: ExtractionCache;
  replayDelayMs?: number;
  sites?: string[];
  fetchImpl?: typeof fetch;
  /** Minutes between automatic site scrapes. 0 or unset turns the schedule off. */
  scrapeEveryMin?: number;
}

/** Mounted at /api/ingest by core/app.ts. */
export function ingestRouter(deps: AppDeps, overrides: IngestOverrides = {}): Router {
  const { config } = deps;
  const gemini = overrides.gemini !== undefined ? overrides.gemini : config.mock ? null : createGemini(config);
  const swarm = new Swarm({
    store: deps.store,
    pool: deps.pool,
    // MOCK=1 never calls Gemini: everything replays from the cache.
    gemini,
    cache: overrides.cache ?? ExtractionCache.load(),
    concurrency: config.swarmConcurrency,
    now: () => config.demoNow ?? new Date().toISOString(),
    replayDelayMs: overrides.replayDelayMs ?? 400,
    fetchImpl: overrides.fetchImpl,
  });
  const sites = () => siteItems(overrides.sites);

  // Off by default: `npm run dev` restarts on every save, and a scrape on each restart would spend credit for nothing.
  const everyMin = overrides.scrapeEveryMin ?? Number(process.env.INGEST_SCRAPE_EVERY_MIN ?? 0);
  if (everyMin > 0 && gemini) {
    const scrape = () => console.log(`scheduled site scrape started: run ${swarm.start(sites()).runId}`);
    setTimeout(scrape, 5000).unref();
    setInterval(scrape, everyMin * 60 * 1000).unref();
  }

  const r = Router();

  r.post('/runs', parseUpload, (req, res) => {
    const files = (req.files as Express.Multer.File[] | undefined) ?? [];
    if (files.length > 0) {
      const caption = typeof req.body?.caption === 'string' ? req.body.caption : null;
      const items: SwarmItem[] = files.map((f) => ({
        kind: 'upload',
        name: f.originalname,
        piece: { sourceRef: f.originalname, mime: f.mimetype, bytes: f.buffer, text: caption },
      }));
      res.status(202).json(swarm.start(items));
      return;
    }
    if (req.body?.capture === 'board') {
      res.status(202).json(swarm.start(sites()));
      return;
    }
    // {capture: "instagram"} is not built yet; an empty request has nothing to run.
    throw new HttpError(501, 'not_implemented', [{ message: 'send {capture: "board"} or images as multipart field "files"' }]);
  });

  r.get('/runs/:id/stream', (req, res) => {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });
    const send = (m: RunMessage) => {
      const data = m.type === 'step' ? m.step : m.type === 'event' ? { itemId: m.itemId, event: m.event } : m.summary;
      res.write(`event: ${m.type}\ndata: ${JSON.stringify(data)}\n\n`);
      if (m.type === 'done') res.end();
    };
    const unsubscribe = swarm.subscribe(req.params.id, send);
    if (!unsubscribe) {
      res.write(`event: error\ndata: ${JSON.stringify({ error: 'unknown_run' })}\n\n`);
      res.end();
      return;
    }
    req.on('close', unsubscribe);
  });

  return r;
}
