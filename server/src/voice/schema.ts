import { z } from 'zod';
import { CampusEventSchema, CategorySchema, IsoDateTime } from '@ruconnect/shared';

/** Body of POST /api/voice/search. Every field is optional. */
export const SearchRequestSchema = z.object({
  query: z.string().trim().max(200).optional(),
  from: IsoDateTime.optional(),
  to: IsoDateTime.optional(),
  category: CategorySchema.optional(),
  freeFood: z.enum(['prefer', 'require']).optional(),
  nearBuildingId: z.string().min(1).optional(),
});
export type SearchRequest = z.infer<typeof SearchRequestSchema>;

export const HitSchema = z.object({
  event: CampusEventSchema,
  /** Meters from the event's building to the anchor building, or null without an anchor. */
  distanceM: z.number().nullable(),
  endsAfterWindow: z.boolean(),
});
export type Hit = z.infer<typeof HitSchema>;

export const SearchResponseSchema = z.object({ matches: z.array(HitSchema), later: z.array(HitSchema) });
export type SearchResponse = z.infer<typeof SearchResponseSchema>;
