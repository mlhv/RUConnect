import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../core/app';
import { loadConfig } from '../core/config';
import { MemoryStore } from '../core/store';
import { testFixture } from '../core/testFixture';

const DEMO_NOW = '2026-10-10T13:30:00-04:00';
const withKeys = { MOCK: '1', DEMO_NOW, ELEVENLABS_API_KEY: 'test-key', ELEVENLABS_AGENT_ID: 'agent_123' };

function appWith(env: Record<string, string>) {
  const seed = testFixture();
  return createApp({ config: loadConfig(env), store: new MemoryStore(seed.buildings, seed.events), pool: null });
}

function stubFetch(impl: () => Promise<Response>) {
  const mock = vi.fn(impl);
  vi.stubGlobal('fetch', mock);
  return mock;
}

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('GET /api/voice/session', () => {
  it('returns a signed URL and the app clock, keeping the key on the server', async () => {
    const mock = stubFetch(async () => new Response(JSON.stringify({ signed_url: 'wss://example.test/abc' }), { status: 200 }));
    const res = await request(appWith(withKeys)).get('/api/voice/session');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ signedUrl: 'wss://example.test/abc', now: '2026-10-10T17:30:00.000Z' });
    expect(JSON.stringify(res.body)).not.toContain('test-key');

    const [url, init] = mock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.elevenlabs.io/v1/convai/conversation/get-signed-url?agent_id=agent_123');
    expect((init.headers as Record<string, string>)['xi-api-key']).toBe('test-key');
  });

  it('answers 503 without calling ElevenLabs when credentials are missing', async () => {
    const mock = stubFetch(async () => new Response('{}'));
    const res = await request(appWith({ MOCK: '1', DEMO_NOW })).get('/api/voice/session');
    expect(res.status).toBe(503);
    expect(res.body.error).toBe('voice_unavailable');
    expect(mock).not.toHaveBeenCalled();
  });

  it('answers 502 when ElevenLabs refuses', async () => {
    stubFetch(async () => new Response('{"detail":"unauthorized"}', { status: 401 }));
    const res = await request(appWith(withKeys)).get('/api/voice/session');
    expect(res.status).toBe(502);
    expect(res.body.error).toBe('voice_upstream');
  });

  it('answers 502 when the request throws or the body is unexpected', async () => {
    stubFetch(async () => { throw new Error('timeout'); });
    expect((await request(appWith(withKeys)).get('/api/voice/session')).status).toBe(502);
    stubFetch(async () => new Response('{"url":"wss://x"}', { status: 200 }));
    expect((await request(appWith(withKeys)).get('/api/voice/session')).status).toBe(502);
  });
});
