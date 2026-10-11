import { z } from 'zod';
import type { Config } from '../core/config';
import { HttpError } from '../core/http';

const SIGNED_URL_ENDPOINT = 'https://api.elevenlabs.io/v1/convai/conversation/get-signed-url';
const UPSTREAM_TIMEOUT_MS = 5000;
const SignedUrlSchema = z.object({ signed_url: z.string().min(1) });

/** Trades the server-side API key for a short-lived conversation URL the browser can use. */
export async function createSession(config: Config): Promise<{ signedUrl: string; now: string }> {
  if (!config.elevenLabsApiKey || !config.elevenLabsAgentId) throw new HttpError(503, 'voice_unavailable');

  let body: unknown;
  try {
    const res = await fetch(`${SIGNED_URL_ENDPOINT}?agent_id=${encodeURIComponent(config.elevenLabsAgentId)}`, {
      headers: { 'xi-api-key': config.elevenLabsApiKey },
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`ElevenLabs answered ${res.status}`);
    body = await res.json();
  } catch (err) {
    console.warn('Could not get an ElevenLabs signed URL:', err instanceof Error ? err.message : err);
    throw new HttpError(502, 'voice_upstream');
  }

  const parsed = SignedUrlSchema.safeParse(body);
  if (!parsed.success) throw new HttpError(502, 'voice_upstream');
  return { signedUrl: parsed.data.signed_url, now: config.demoNow ?? new Date().toISOString() };
}
