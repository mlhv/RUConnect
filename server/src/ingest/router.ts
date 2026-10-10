import { Router } from 'express';
import type { AppDeps } from '../core/deps';

/** Slice B replaces this body. Mounted at /api/ingest by core/app.ts. */
export function ingestRouter(_deps: AppDeps): Router {
  const r = Router();
  r.use((_req, res) => {
    res.status(501).json({ error: 'not_implemented', slice: 'ingest' });
  });
  return r;
}
