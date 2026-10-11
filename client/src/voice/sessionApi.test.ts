import { describe, expect, it, vi } from 'vitest';
import { fetchSession, sessionVariables } from './sessionApi';
import { NOW, buildings } from './testData';

const respond = (body: unknown, status = 200) =>
  vi.fn(async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;

describe('fetchSession', () => {
  it('returns the signed URL and clock', async () => {
    const fetchImpl = respond({ signedUrl: 'wss://example.test/abc', now: '2026-10-10T17:30:00.000Z' });
    expect(await fetchSession(fetchImpl)).toEqual({ signedUrl: 'wss://example.test/abc', now: '2026-10-10T17:30:00.000Z' });
    expect(vi.mocked(fetchImpl).mock.calls[0][0]).toBe('/api/voice/session');
  });

  it('throws the server error code', async () => {
    await expect(fetchSession(respond({ error: 'voice_unavailable' }, 503))).rejects.toThrow('voice_unavailable');
  });

  it('throws on a malformed body or a network failure', async () => {
    await expect(fetchSession(respond({ signedUrl: '' }))).rejects.toThrow('bad_response');
    const down = vi.fn(async () => { throw new TypeError('Failed to fetch'); }) as unknown as typeof fetch;
    await expect(fetchSession(down)).rejects.toThrow('network');
  });
});

describe('sessionVariables', () => {
  it('gives the agent the Eastern clock and the building names', () => {
    expect(sessionVariables(NOW, buildings)).toEqual({
      current_time: 'Saturday, October 10, 2026, 1:30 PM, UTC offset -04:00',
      buildings: 'Rutgers Student Center, Alexander Library, Scott Hall, Voorhees Hall, College Avenue Gym',
    });
  });
});
