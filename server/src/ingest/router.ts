import { Router, type NextFunction, type Request, type Response } from 'express';
import multer from 'multer';
import type { AppDeps } from '../core/deps';
import { HttpError } from '../core/http';
import { ExtractionCache } from './cache';
import { createGemini, type Gemini } from './gemini';
import { Swarm, type RunMessage } from './swarm';

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

/** Tests pass a stub Gemini and an in-memory cache; the server uses the real ones. */
export interface IngestOverrides {
  gemini?: Gemini | null;
  cache?: ExtractionCache;
  replayDelayMs?: number;
}

/** Mounted at /api/ingest by core/app.ts. */
export function ingestRouter(deps: AppDeps, overrides: IngestOverrides = {}): Router {
  const { config } = deps;
  const swarm = new Swarm({
    store: deps.store,
    pool: deps.pool,
    // MOCK=1 never calls Gemini: everything replays from the cache.
    gemini: overrides.gemini !== undefined ? overrides.gemini : config.mock ? null : createGemini(config),
    cache: overrides.cache ?? ExtractionCache.load(),
    concurrency: config.swarmConcurrency,
    now: () => config.demoNow ?? new Date().toISOString(),
    replayDelayMs: overrides.replayDelayMs ?? 400,
  });

  const r = Router();

  r.post('/runs', parseUpload, (req, res) => {
    const files = (req.files as Express.Multer.File[] | undefined) ?? [];
    if (files.length === 0) {
      // A JSON body here means {capture: "instagram" | "board"}, which is not built yet.
      throw new HttpError(501, 'not_implemented', [{ message: 'send images as multipart field "files"; captures are not built yet' }]);
    }
    const caption = typeof req.body?.caption === 'string' ? req.body.caption : null;
    const started = swarm.start(
      files.map((f) => ({ name: f.originalname, mime: f.mimetype, bytes: f.buffer, caption })),
    );
    res.status(202).json(started);
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
