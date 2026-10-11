import { describe, expect, it, vi } from 'vitest';
import { runFallback } from './fallback';
import { SearchError, type SearchRequest, SearchResponse } from './searchApi';
import { NOW, buildings, fakeMap, hit } from './testData';
import { createTools } from './tools';

function setup(response: SearchResponse | Error) {
  const { map, calls } = fakeMap();
  const search = vi.fn(async (_req: SearchRequest) => {
    if (response instanceof Error) throw response;
    return response;
  });
  const tools = createTools({ search, map, getBuildings: () => buildings, getEvents: () => [], now: () => NOW });
  const spoken: string[] = [];
  const deps = { tools, getBuildings: () => buildings, now: () => NOW, speak: (t: string) => void spoken.push(t) };
  return { deps, search, calls, spoken };
}

describe('runFallback', () => {
  it('spots the building and free food, focuses the top match, and speaks it', async () => {
    const { deps, search, calls, spoken } = setup({ matches: [hit({ id: 'build', freeFood: true }, 217)], later: [] });
    const sentence = "I'm free until 4, I like robotics and free food, what's near the library?";
    const said = await runFallback(sentence, deps);
    expect(search.mock.calls[0][0]).toEqual({ query: sentence, freeFood: 'prefer', nearBuildingId: 'alexander-library' });
    expect(calls).toContain('flyTo:student-center');
    expect(said).toBe('Robotics Club Build Session at Rutgers Student Center, 2:00 PM to 3:30 PM, with free food.');
    expect(spoken).toEqual([said]);
  });

  it('sends only the query when nothing else is recognised', async () => {
    const { deps, search } = setup({ matches: [hit({ id: 'build' })], later: [] });
    await runFallback('live music', deps);
    expect(search.mock.calls[0][0]).toEqual({ query: 'live music' });
  });

  it('says nothing matches exactly when the top pick shares no interest word, and still shows it', async () => {
    const market = hit({ id: 'market', title: 'Night Market', buildingId: 'scott-hall' }, null, false, false);
    const { deps, calls, spoken } = setup({ matches: [market], later: [] });
    const said = await runFallback('chess', deps);
    expect(said).toBe(
      'Nothing matches that exactly. The top pick coming up is Night Market at Scott Hall, 2:00 PM to 3:30 PM.',
    );
    expect(spoken).toEqual([said]);
    expect(calls).toContain('flyTo:scott-hall');
  });

  it('says so when nothing matches and does not move the camera', async () => {
    const { deps, calls, spoken } = setup({ matches: [], later: [] });
    const said = await runFallback('underwater basket weaving', deps);
    expect(said).toBe('I could not find anything like that right now. Try different interests.');
    expect(spoken).toEqual([said]);
    expect(calls.some((c) => c.startsWith('flyTo'))).toBe(false);
  });

  it('says search is unavailable when the search fails, without moving the camera', async () => {
    const { deps, calls, spoken } = setup(new SearchError('server_error'));
    const said = await runFallback('robotics', deps);
    expect(said).toBe('Search is unavailable right now. Try again in a moment.');
    expect(spoken).toEqual([said]);
    expect(calls.some((c) => c.startsWith('flyTo'))).toBe(false);
  });

  it('cuts the query to the 200 characters the server accepts', async () => {
    const { deps, search } = setup({ matches: [], later: [] });
    await runFallback('robotics '.repeat(28), deps);
    expect(search.mock.calls[0][0].query).toHaveLength(200);
  });

  it('ignores a blank sentence', async () => {
    const { deps, search, spoken } = setup({ matches: [], later: [] });
    expect(await runFallback('   ', deps)).toBe('');
    expect(search).not.toHaveBeenCalled();
    expect(spoken).toEqual([]);
  });
});
