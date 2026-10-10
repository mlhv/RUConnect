import { z } from 'zod';
import { CategorySchema, type Building } from '@ruconnect/shared';
import type { Gemini } from './gemini';

const Confidence = z.number().min(0).max(1);

/** What the model returns for one flyer. Nulls mean the flyer does not say. */
export function draftSchema(buildingIds: string[]) {
  return z.object({
    title: z.string().nullable(),
    description: z.string(),
    category: CategorySchema,
    buildingId: z.enum(buildingIds as [string, ...string[]]).nullable(),
    locationText: z.string().nullable(),
    room: z.string().nullable(),
    start: z.string().nullable(),
    end: z.string().nullable(),
    expectedAttendance: z.number().int().nonnegative().nullable(),
    tags: z.array(z.string()),
    freeFood: z.boolean(),
    confidence: z.object({ title: Confidence, time: Confidence, location: Confidence }),
  });
}
export type ReaderDraft = z.infer<ReturnType<typeof draftSchema>>;

export interface ReaderInput {
  image: Buffer;
  mime: string;
  /** Instagram caption or other text that came with the image. */
  caption?: string | null;
}

export interface ReaderContext {
  gemini: Gemini;
  buildings: Building[];
  /** ISO instant the flyer is read at, so the model can resolve "this Friday". */
  now: string;
}

export function buildPrompt(buildings: Building[], now: string, caption?: string | null): string {
  const list = buildings.map((b) => `- ${b.id}: ${[b.name, ...b.aliases].join(', ')}`).join('\n');
  return `You read event flyers for Rutgers University, College Avenue campus, New Brunswick NJ.
The photo may be crumpled, angled, dim, or partly covered. Extract the one main event it advertises.

Now is ${now}. Times are America/New_York. If the flyer gives a weekday or date without a year, pick the next matching date on or after today.

Rules:
- start and end: ISO 8601 with offset, e.g. 2026-10-10T19:00:00-04:00. If only a start time is shown, set end to start plus 1 hour and lower confidence.time. Null if no time is shown.
- buildingId: one id from the list below, matching the name, alias, or street address. Null if none match; still copy what the flyer says into locationText.
- room: room number or name if shown, else null.
- freeFood: true only if the flyer mentions free food, snacks, pizza, refreshments, or similar.
- expectedAttendance: a rough guess from the event's size, or null.
- tags: 1 to 5 short lowercase keywords.
- description: one or two sentences from the flyer's text. Do not invent details.
- confidence: 0 to 1 per group. Below 0.8 means a person should check it (blurry text, guessed date, unclear venue).

Buildings:
${list}${caption ? `\n\nText posted with the image:\n${caption}` : ''}`;
}

function toJsonSchema(schema: z.ZodType): unknown {
  const { $schema: _drop, ...rest } = z.toJSONSchema(schema) as Record<string, unknown>;
  return rest;
}

/** Reads one image into a draft. Invalid model output is retried once with the validation error appended. */
export async function readFlyer(input: ReaderInput, ctx: ReaderContext): Promise<ReaderDraft> {
  const schema = draftSchema(ctx.buildings.map((b) => b.id));
  const jsonSchema = toJsonSchema(schema);
  const base = buildPrompt(ctx.buildings, ctx.now, input.caption);

  let prompt = base;
  for (let attempt = 0; attempt < 2; attempt++) {
    const text = await ctx.gemini.readImage({ prompt, image: input.image, mime: input.mime, jsonSchema });
    let problem: string;
    try {
      const result = schema.safeParse(JSON.parse(text));
      if (result.success) return result.data;
      problem = z.prettifyError(result.error);
    } catch {
      problem = 'The response was not valid JSON.';
    }
    prompt = `${base}\n\nYour previous answer was rejected:\n${problem}\nAnswer again, following the schema exactly.`;
  }
  throw new Error('Reader output failed validation twice');
}
