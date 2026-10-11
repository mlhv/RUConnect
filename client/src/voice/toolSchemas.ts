import { z } from 'zod';
import { CategorySchema, IsoDateTime } from '@ruconnect/shared';

/** Models often send "" or null for an argument they mean to omit. */
const optional = <T extends z.ZodType>(schema: T) =>
  z.preprocess((v) => (v === null || v === '' ? undefined : v), schema.optional());

export const FindEventsArgsSchema = z.object({
  query: optional(z.string()),
  from: optional(IsoDateTime),
  to: optional(IsoDateTime),
  category: optional(CategorySchema),
  freeFood: optional(z.enum(['prefer', 'require'])),
  nearBuildingName: optional(z.string()),
});

export const FocusEventArgsSchema = z.object({ eventId: z.string().min(1) });

/** Keyed by the tool names registered with the agent. agent/toolContract.test.ts checks these against agent/tools.json. */
export const TOOL_ARG_SCHEMAS = {
  find_events: FindEventsArgsSchema,
  focus_event: FocusEventArgsSchema,
} as const;
