import { z } from 'zod';
import { CampusEventSchema } from '@ruconnect/shared';

/** Mirrors server/src/voice/schema.ts, which the client cannot import. */
export const HitSchema = z.object({
  event: CampusEventSchema,
  distanceM: z.number().nullable(),
  endsAfterWindow: z.boolean(),
});
export type Hit = z.infer<typeof HitSchema>;

export const SearchResponseSchema = z.object({ matches: z.array(HitSchema), later: z.array(HitSchema) });
export type SearchResponse = z.infer<typeof SearchResponseSchema>;

export interface SearchRequest {
  query?: string;
  from?: string;
  to?: string;
  category?: string;
  freeFood?: 'prefer' | 'require';
  nearBuildingId?: string;
}

export class SearchError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

export async function searchEvents(
  req: SearchRequest,
  fetchImpl: typeof fetch = (input, init) => fetch(input, init),
): Promise<SearchResponse> {
  let res: Response;
  try {
    res = await fetchImpl('/api/voice/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
    });
  } catch {
    throw new SearchError('network');
  }
  if (!res.ok) {
    const body: unknown = await res.json().catch(() => null);
    const code = (body as { error?: unknown } | null)?.error;
    throw new SearchError(typeof code === 'string' ? code : `http_${res.status}`);
  }
  const parsed = SearchResponseSchema.safeParse(await res.json().catch(() => null));
  if (!parsed.success) throw new SearchError('bad_response');
  return parsed.data;
}
