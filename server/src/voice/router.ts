import { Router } from 'express';
import type { AppDeps } from '../core/deps';
import { HttpError, parse } from '../core/http';
import { LATER_WINDOW_MS, rankEvents, resolveWindow } from './rank';
import { SearchRequestSchema } from './schema';

/** Mounted at /api/voice by core/app.ts. */
export function voiceRouter(deps: AppDeps): Router {
  const r = Router();

  r.post('/search', async (req, res) => {
    const body = parse(SearchRequestSchema, req.body ?? {});
    const now = deps.config.demoNow ?? new Date().toISOString();
    const { from, to } = resolveWindow(body, now);
    if (to <= from) throw new HttpError(400, 'invalid_window');

    const buildings = await deps.store.listBuildings();
    if (body.nearBuildingId && !buildings.some((b) => b.id === body.nearBuildingId)) {
      throw new HttpError(400, 'unknown_building');
    }
    const events = await deps.store.listEvents({
      from: new Date(from).toISOString(),
      to: new Date(to + LATER_WINDOW_MS).toISOString(),
      status: 'published',
    });
    res.json(rankEvents(events, buildings, body, now));
  });

  // The session route arrives with the contract change to core/app.test.ts.
  r.use((_req, res) => {
    res.status(501).json({ error: 'not_implemented', slice: 'voice' });
  });
  return r;
}
