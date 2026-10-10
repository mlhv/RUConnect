import { afterEach, describe, expect, it, vi } from 'vitest';
import { useEventsStore } from './eventsStore';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const json = (data: unknown) => Promise.resolve(new Response(JSON.stringify(data), { status: 200 }));

describe('useEventsStore.load', () => {
  it('falls back to bundled seed data when the API is unreachable', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    await useEventsStore.getState().load();
    const s = useEventsStore.getState();
    expect(s.offline).toBe(true);
    expect(s.buildings.length).toBeGreaterThan(0);
    expect(s.events.length).toBeGreaterThan(0);
    expect(warn).toHaveBeenCalledOnce();
  });

  it('falls back when the API answers with an error status', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{"error":"internal"}', { status: 500 })));
    await useEventsStore.getState().load();
    expect(useEventsStore.getState().offline).toBe(true);
    expect(warn).toHaveBeenCalledOnce();
  });

  it('uses API data and DEMO_NOW when the API responds', async () => {
    const building = {
      id: 'b1', name: 'B1', aliases: [], lng: -74.45, lat: 40.5, heightM: 10,
      footprint: [[0, 0], [1, 0], [1, 1], [0, 0]],
    };
    vi.stubGlobal('fetch', vi.fn((url: string) => {
      if (url.startsWith('/api/buildings')) return json([building]);
      if (url.startsWith('/api/events')) return json([]);
      return json({ now: '2026-10-10T23:30:00.000Z' });
    }));
    await useEventsStore.getState().load();
    const s = useEventsStore.getState();
    expect(s.offline).toBe(false);
    expect(s.buildings.map((b) => b.id)).toEqual(['b1']);
    expect(s.selectedTime).toBe('2026-10-10T23:30:00.000Z');
  });
});

describe('useEventsStore.upsertEvent', () => {
  it('adds a new event and replaces one with the same id', () => {
    const e = { id: 'x', title: 'One' } as never;
    useEventsStore.setState({ events: [] });
    useEventsStore.getState().upsertEvent(e);
    useEventsStore.getState().upsertEvent({ id: 'x', title: 'Two' } as never);
    expect(useEventsStore.getState().events).toEqual([{ id: 'x', title: 'Two' }]);
  });
});
