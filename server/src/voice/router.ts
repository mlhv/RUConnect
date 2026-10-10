import { Router } from 'express';
import type { AppDeps } from '../core/deps';

/** Slice C replaces this body. Mounted at /api/voice by core/app.ts. */
export function voiceRouter(_deps: AppDeps): Router {
  const r = Router();
  r.use((_req, res) => {
    res.status(501).json({ error: 'not_implemented', slice: 'voice' });
  });
  return r;
}
