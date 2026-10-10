import { z } from 'zod';

export const IsoDateTime = z.iso.datetime({ offset: true });

export const CategorySchema = z.enum(['academic', 'social', 'career', 'sports', 'arts', 'club', 'food', 'other']);
export const EventSourceSchema = z.enum(['flyer', 'instagram', 'board', 'manual', 'seed']);
export const EventStatusSchema = z.enum(['published', 'needs_review']);

const fields = {
  title: z.string().min(1),
  description: z.string(),
  category: CategorySchema,
  buildingId: z.string().min(1),
  room: z.string().nullable(),
  start: IsoDateTime,
  end: IsoDateTime,
  expectedAttendance: z.number().int().nonnegative().nullable(),
  tags: z.array(z.string()),
  freeFood: z.boolean(),
  source: EventSourceSchema,
  status: EventStatusSchema,
  confidence: z.number().min(0).max(1),
};

const inputFields = {
  ...fields,
  description: fields.description.default(''),
  room: fields.room.default(null),
  expectedAttendance: fields.expectedAttendance.default(null),
  tags: fields.tags.default([]),
  freeFood: fields.freeFood.default(false),
  source: fields.source.default('manual'),
  status: fields.status.default('published'),
  confidence: fields.confidence.default(1),
};

const endAfterStart = (e: { start: string; end: string }) => Date.parse(e.end) > Date.parse(e.start);
const endAfterStartIssue = { message: 'end must be after start', path: ['end'] };

/** An event as stored and returned by the API. */
export const CampusEventSchema = z
  .object({ id: z.string().min(1), ...fields, createdAt: IsoDateTime })
  .refine(endAfterStart, endAfterStartIssue);
export type CampusEvent = z.infer<typeof CampusEventSchema>;

/** Body of POST /api/events. Optional fields take defaults. */
export const EventInputSchema = z.object(inputFields).refine(endAfterStart, endAfterStartIssue);
export type EventInput = z.infer<typeof EventInputSchema>;

/** Body of PATCH /api/events/:id. Only sent fields are present. */
export const EventPatchSchema = z.object(fields).partial();
export type EventPatch = z.infer<typeof EventPatchSchema>;

/** One entry of data/events.seed.json. */
export const SeedEventSchema = z
  .object({ id: z.string().min(1), ...inputFields })
  .refine(endAfterStart, endAfterStartIssue);

const Ring = z.array(z.tuple([z.number(), z.number()])).min(4);

export const BuildingSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  aliases: z.array(z.string()),
  lng: z.number(),
  lat: z.number(),
  footprint: Ring,
  heightM: z.number().positive(),
});
export type Building = z.infer<typeof BuildingSchema>;

/** One entry of data/buildings.json. A missing footprint becomes a widthM x depthM rectangle. */
export const BuildingSeedSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  aliases: z.array(z.string()).default([]),
  lng: z.number(),
  lat: z.number(),
  heightM: z.number().positive().default(15),
  widthM: z.number().positive().default(40),
  depthM: z.number().positive().default(30),
  footprint: Ring.optional(),
});
