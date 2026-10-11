import { z } from 'zod';
import { IsoDateTime, type Building } from '@ruconnect/shared';
import { formatClock, formatIso } from './formatResults';

const SessionSchema = z.object({ signedUrl: z.string().min(1), now: IsoDateTime });
export type Session = z.infer<typeof SessionSchema>;

/** Throws an Error whose message is the server's error code, `http_<status>`, `network`, or `bad_response`. */
export async function fetchSession(fetchImpl: typeof fetch = (input, init) => fetch(input, init)): Promise<Session> {
  let res: Response;
  try {
    res = await fetchImpl('/api/voice/session');
  } catch {
    throw new Error('network');
  }
  const body: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const code = (body as { error?: unknown } | null)?.error;
    throw new Error(typeof code === 'string' ? code : `http_${res.status}`);
  }
  const parsed = SessionSchema.safeParse(body);
  if (!parsed.success) throw new Error('bad_response');
  return parsed.data;
}

/** Fills {{current_time}}, {{current_iso}}, and {{buildings}} in the dashboard prompt. */
export function sessionVariables(
  now: string, buildings: Building[],
): { current_time: string; current_iso: string; buildings: string } {
  return { current_time: formatClock(now), current_iso: formatIso(now), buildings: buildings.map((b) => b.name).join(', ') };
}
