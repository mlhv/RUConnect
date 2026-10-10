import { Router } from 'express';
import { EventInputSchema, EventPatchSchema, EventQuerySchema, type AppConfig } from '@ruconnect/shared';
import type { AppDeps } from './deps';
import { HttpError, parse } from './http';
import type { Store } from './store';

async function assertBuilding(store: Store, buildingId: string): Promise<void> {
  const known = (await store.listBuildings()).some((b) => b.id === buildingId);
  if (!known) throw new HttpError(400, 'unknown_building', [{ path: ['buildingId'], message: buildingId }]);
}

export function coreRouter({ store, config }: AppDeps): Router {
  const r = Router();

  r.get('/health', (_req, res) => {
    res.json({ ok: true, mock: config.mock, schema: config.dbSchema });
  });

  r.get('/config', (_req, res) => {
    res.json({ now: config.demoNow } satisfies AppConfig);
  });

  r.get('/buildings', async (_req, res) => {
    res.json(await store.listBuildings());
  });

  r.get('/events', async (req, res) => {
    res.json(await store.listEvents(parse(EventQuerySchema, req.query)));
  });

  r.post('/events', async (req, res) => {
    const input = parse(EventInputSchema, req.body);
    await assertBuilding(store, input.buildingId);
    res.status(201).json(await store.createEvent(input));
  });

  r.patch('/events/:id', async (req, res) => {
    const patch = parse(EventPatchSchema, req.body);
    const current = await store.getEvent(req.params.id);
    if (!current) throw new HttpError(404, 'not_found');
    if (patch.buildingId) await assertBuilding(store, patch.buildingId);
    const merged = { ...current, ...patch };
    if (Date.parse(merged.end) <= Date.parse(merged.start)) {
      throw new HttpError(400, 'invalid_request', [{ path: ['end'], message: 'end must be after start' }]);
    }
    res.json(await store.updateEvent(req.params.id, patch));
  });

  return r;
}
