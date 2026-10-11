import { describe, expect, it, vi } from 'vitest';
import { SearchError, type SearchRequest, type SearchResponse } from './searchApi';
import { NOW, buildings, fakeMap, hit, makeEvent } from './testData';
import { createTools } from './tools';

const build = hit({ id: 'build', freeFood: true }, 217);
const study = hit(
  { id: 'study', title: 'Study Break', buildingId: 'alexander-library', start: '2026-10-10T14:30:00-04:00', end: '2026-10-10T15:30:00-04:00' },
  0,
);

function setup(response: SearchResponse | Error = { matches: [build, study], later: [] }) {
  const { map, calls } = fakeMap();
  const search = vi.fn(async (_req: SearchRequest) => {
    if (response instanceof Error) throw response;
    return response;
  });
  const tools = createTools({
    search, map, getBuildings: () => buildings, getEvents: () => [makeEvent({ id: 'stored', buildingId: 'scott-hall' })], now: () => NOW,
  });
  return { tools, search, calls };
}

describe('findEvents', () => {
  it('resolves the building, searches, and moves the map', async () => {
    const { tools, search, calls } = setup();
    const text = await tools.findEvents({
      query: 'robotics', to: '2026-10-10T16:00:00-04:00', freeFood: 'prefer', nearBuildingName: 'the library',
    });
    expect(search).toHaveBeenCalledWith(
      expect.objectContaining({ query: 'robotics', to: '2026-10-10T16:00:00-04:00', freeFood: 'prefer', nearBuildingId: 'alexander-library' }),
    );
    expect(calls).toEqual(['highlight:student-center,alexander-library', 'setTime:2026-10-10T18:00:00.000Z']);
    expect(text).toContain('Near: Alexander Library.');
    expect(text).toContain('[id build]');
    expect(tools.lastMatches().map((h) => h.event.id)).toEqual(['build', 'study']);
  });

  it('never sets the time earlier than now', async () => {
    const started = hit({ id: 'started', start: '2026-10-10T13:00:00-04:00' });
    const { tools, calls } = setup({ matches: [started], later: [] });
    await tools.findEvents({});
    expect(calls).toContain('setTime:2026-10-10T17:30:00.000Z');
  });

  it('treats empty strings, nulls, and missing arguments as absent', async () => {
    const { tools, search } = setup();
    await tools.findEvents({ query: '', from: null, to: '', category: null, freeFood: '', nearBuildingName: '' });
    expect(search.mock.calls[0][0]).toEqual({});
    await tools.findEvents(undefined);
    expect(search).toHaveBeenCalledTimes(2);
  });

  it('searches campus-wide and says so when the building is unknown', async () => {
    const { tools, search } = setup();
    const text = await tools.findEvents({ nearBuildingName: 'the stadium' });
    expect(search.mock.calls[0][0].nearBuildingId).toBeUndefined();
    expect(text).toContain('I do not know a building called "the stadium"');
  });

  it('clears highlights and keeps the time when nothing matches', async () => {
    const { tools, calls } = setup({ matches: [], later: [build] });
    const text = await tools.findEvents({});
    expect(calls).toEqual(['clearHighlight']);
    expect(text).toContain('Later, outside the window:');
    expect(tools.lastMatches()).toEqual([]);
  });

  it('returns a sentence instead of throwing on bad arguments', async () => {
    const { tools, search } = setup();
    const text = await tools.findEvents({ to: '4pm', freeFood: 'yes' });
    expect(text).toMatch(/^Invalid arguments/);
    expect(text).toContain('2026-10-10T16:00:00-04:00');
    expect(search).not.toHaveBeenCalled();
  });

  it('explains an empty window with the current time', async () => {
    const { tools } = setup(new SearchError('invalid_window'));
    expect(await tools.findEvents({ to: '2026-10-10T12:00:00-04:00' })).toContain('The current time is Sat 1:30 PM');
  });

  it('returns a sentence when the search fails, and forgets old matches', async () => {
    const { map } = fakeMap();
    const search = vi.fn<(req: SearchRequest) => Promise<SearchResponse>>()
      .mockResolvedValueOnce({ matches: [build, study], later: [] })
      .mockRejectedValueOnce(new Error('boom'));
    const tools = createTools({ search, map, getBuildings: () => buildings, getEvents: () => [], now: () => NOW });
    await tools.findEvents({});
    expect(tools.lastMatches()).toHaveLength(2);
    expect(await tools.findEvents({})).toContain('search failed');
    expect(tools.lastMatches()).toEqual([]);
  });

  it('reports whether the last search failed', async () => {
    const ok = setup();
    expect(ok.tools.lastSearchFailed()).toBe(false);
    await ok.tools.findEvents({});
    expect(ok.tools.lastSearchFailed()).toBe(false);
    const failing = setup(new SearchError('server_error'));
    await failing.tools.findEvents({});
    expect(failing.tools.lastSearchFailed()).toBe(true);
    const invalid = setup();
    await invalid.tools.findEvents({ to: '4pm' });
    expect(invalid.tools.lastSearchFailed()).toBe(true);
  });
});

describe('tools never throw', () => {
  it('findEvents still returns the results when the map throws', async () => {
    const { map } = fakeMap();
    const broken = createTools({
      search: async () => ({ matches: [build, study], later: [] }),
      map: { ...map, highlight: () => { throw new Error('map down'); } },
      getBuildings: () => buildings, getEvents: () => [], now: () => NOW,
    });
    expect(await broken.findEvents({})).toContain('[id build]');
    expect(broken.lastMatches().map((h) => h.event.id)).toEqual(['build', 'study']);
    expect(broken.lastSearchFailed()).toBe(false);
  });

  it('findEvents returns a sentence and forgets matches when a dependency throws', async () => {
    const { map } = fakeMap();
    const broken = createTools({
      search: async () => ({ matches: [build], later: [] }),
      map,
      getBuildings: () => { throw new Error('store down'); }, getEvents: () => [], now: () => NOW,
    });
    expect(await broken.findEvents({})).toBe('The event search failed (unknown). Tell the student that search is unavailable right now.');
    expect(broken.lastMatches()).toEqual([]);
    expect(broken.lastSearchFailed()).toBe(true);
  });

  it('focusEvent returns a sentence when the map throws', async () => {
    const { map } = fakeMap();
    const broken = createTools({
      search: async () => ({ matches: [build], later: [] }),
      map: { ...map, flyTo: () => { throw new Error('map down'); } },
      getBuildings: () => buildings, getEvents: () => [], now: () => NOW,
    });
    await broken.findEvents({});
    expect(await broken.focusEvent({ eventId: 'build' })).toBe('The map could not be moved. Tell the student to try again.');
  });
});

describe('focusEvent', () => {
  it('flies to a remembered event and sets its time', async () => {
    const { tools, calls } = setup();
    await tools.findEvents({});
    calls.length = 0;
    expect(await tools.focusEvent({ eventId: 'study' })).toBe('The map is now showing Alexander Library.');
    expect(calls).toEqual(['flyTo:alexander-library', 'openBuilding:alexander-library', 'setTime:2026-10-10T18:30:00.000Z']);
  });

  it('remembers later events too, and falls back to the events store', async () => {
    const { tools } = setup({ matches: [], later: [build] });
    await tools.findEvents({});
    expect(await tools.focusEvent({ eventId: 'build' })).toBe('The map is now showing Rutgers Student Center.');
    expect(await tools.focusEvent({ eventId: 'stored' })).toBe('The map is now showing Scott Hall.');
  });

  it('returns a sentence for an unknown or missing id', async () => {
    const { tools, calls } = setup();
    expect(await tools.focusEvent({ eventId: 'nope' })).toBe('No event with that id. Call find_events first.');
    expect(await tools.focusEvent({})).toBe('No event with that id. Call find_events first.');
    expect(calls).toEqual([]);
  });
});
