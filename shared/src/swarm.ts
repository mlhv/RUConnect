import { z } from 'zod';

export const SwarmWorkerSchema = z.enum(['scout', 'reader', 'reconciler', 'locator', 'deduper', 'verifier']);
export const SwarmStateSchema = z.enum(['started', 'finished', 'failed']);

/** One Server-Sent Event on GET /api/ingest/runs/:id/stream. */
export const SwarmStepSchema = z.object({
  runId: z.string(),
  itemId: z.string(),
  worker: SwarmWorkerSchema,
  state: SwarmStateSchema,
  summary: z.string(),
});
export type SwarmStep = z.infer<typeof SwarmStepSchema>;
