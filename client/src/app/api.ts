import { z } from 'zod';
import {
  AppConfigSchema, BuildingSchema, CampusEventSchema,
  type AppConfig, type Building, type CampusEvent, type EventQuery,
} from '@ruconnect/shared';

async function get<T extends z.ZodType>(path: string, schema: T): Promise<z.infer<T>> {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`GET ${path} failed with ${res.status}`);
  return schema.parse(await res.json());
}

export const api = {
  buildings: (): Promise<Building[]> => get('/api/buildings', z.array(BuildingSchema)),
  events: (q: Partial<EventQuery> = {}): Promise<CampusEvent[]> => {
    // URLSearchParams encodes the "+" in UTC offsets, which a raw query string would turn into a space.
    const qs = new URLSearchParams(Object.entries(q).filter(([, v]) => v !== undefined) as [string, string][]);
    return get(`/api/events${qs.size ? `?${qs}` : ''}`, z.array(CampusEventSchema));
  },
  config: (): Promise<AppConfig> => get('/api/config', AppConfigSchema),
};
