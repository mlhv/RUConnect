import { z } from 'zod';
import { rectFootprint } from './geo';
import { BuildingSeedSchema, SeedEventSchema, type Building, type CampusEvent } from './schemas';

export function parseSeedBuildings(raw: unknown): Building[] {
  return z.array(BuildingSeedSchema).parse(raw).map((b) => ({
    id: b.id,
    name: b.name,
    aliases: b.aliases,
    lng: b.lng,
    lat: b.lat,
    heightM: b.heightM,
    footprint: b.footprint ?? rectFootprint(b.lng, b.lat, b.widthM, b.depthM),
  }));
}

export function parseSeedEvents(raw: unknown, createdAt = '2026-10-10T00:00:00.000Z'): CampusEvent[] {
  return z.array(SeedEventSchema).parse(raw).map((e) => ({ ...e, createdAt }));
}
