import { z } from 'zod';
import { EventStatusSchema, IsoDateTime } from './schemas';

/** Query string of GET /api/events. An event matches when it overlaps [from, to]. */
export const EventQuerySchema = z.object({
  from: IsoDateTime.optional(),
  to: IsoDateTime.optional(),
  buildingId: z.string().min(1).optional(),
  status: EventStatusSchema.default('published'),
});
export type EventQuery = z.infer<typeof EventQuerySchema>;

/** Response of GET /api/config. `now` is DEMO_NOW when set. */
export const AppConfigSchema = z.object({ now: IsoDateTime.nullable() });
export type AppConfig = z.infer<typeof AppConfigSchema>;

/** Shape of every non-2xx JSON response. */
export interface ApiError {
  error: string;
  issues?: unknown;
}
