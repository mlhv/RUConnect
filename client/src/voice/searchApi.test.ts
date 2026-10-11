import { describe, expect, it, vi } from 'vitest';
import { SearchError, searchEvents } from './searchApi';
import { hit } from './testData';

const json = (body: unknown, status = 200) =>
  vi.fn(async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;

describe('searchEvents', () => {
  it('posts the request and returns validated hits', async () => {
    const fetchImpl = json({ matches: [hit({ id: 'a' }, 120)], later: [] });
    const res = await searchEvents({ query: 'robotics', nearBuildingId: 'alexander-library' }, fetchImpl);
    expect(res.matches[0].event.id).toBe('a');
    const [url, init] = vi.mocked(fetchImpl).mock.calls[0];
    expect(url).toBe('/api/voice/search');
    expect(init?.method).toBe('POST');
    expect(JSON.parse(init?.body as string)).toEqual({ query: 'robotics', nearBuildingId: 'alexander-library' });
  });

  it('throws the server error code', async () => {
    await expect(searchEvents({}, json({ error: 'invalid_window' }, 400))).rejects.toMatchObject({ code: 'invalid_window' });
  });

  it('throws http_<status> when the error body is not JSON', async () => {
    const fetchImpl = vi.fn(async () => new Response('<html>', { status: 500 })) as unknown as typeof fetch;
    await expect(searchEvents({}, fetchImpl)).rejects.toMatchObject({ code: 'http_500' });
  });

  it('throws network when the request cannot be sent', async () => {
    const fetchImpl = vi.fn(async () => { throw new TypeError('Failed to fetch'); }) as unknown as typeof fetch;
    const err = await searchEvents({}, fetchImpl).catch((e) => e);
    expect(err).toBeInstanceOf(SearchError);
    expect(err.code).toBe('network');
  });

  it('rejects a response that does not match the schema', async () => {
    await expect(searchEvents({}, json({ matches: [{ event: {} }] }))).rejects.toBeInstanceOf(SearchError);
  });
});
