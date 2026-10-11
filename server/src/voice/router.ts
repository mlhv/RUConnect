import { Router } from 'express';
import type { AppDeps } from '../core/deps';
import { HttpError, parse } from '../core/http';
import { createEmbedder } from './embed';
import { LATER_WINDOW_MS, rankEvents, resolveWindow } from './rank';
import { SearchRequestSchema } from './schema';
import { trySimilarities } from './semantic';
import { createSession } from './session';

/** The voice agent is waiting on the tool call; past this, answer from words alone. */
const SEMANTIC_TIMEOUT_MS = 2000;

/** Mounted at /api/voice by core/app.ts. */
export function voiceRouter(deps: AppDeps): Router {
  const r = Router();
  const embed = createEmbedder(deps.config);

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
      // +1 because the stores treat `to` as exclusive and rankEvents keeps an event starting exactly at the edge.
      to: new Date(to + LATER_WINDOW_MS + 1).toISOString(),
      status: 'published',
    });
    // Needs a database (pgvector does the comparison) and an embedding model; without either, or on failure, words rank alone.
    const similarity =
      deps.pool && embed && body.query
        ? await trySimilarities(deps.pool, embed, body.query, events.map((e) => e.id), SEMANTIC_TIMEOUT_MS)
        : null;
    res.json(rankEvents(events, buildings, body, now, similarity ?? undefined));
  });

  r.get('/session', async (_req, res) => {
    res.json(await createSession(deps.config));
  });

  return r;
}
