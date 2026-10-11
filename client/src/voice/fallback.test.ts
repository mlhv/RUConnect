import { describe, expect, it, vi } from 'vitest';
import { runFallback } from './fallback';
import type { SearchRequest, SearchResponse } from './searchApi';
import { NOW, buildings, fakeMap, hit } from './testData';
import { createTools } from './tools';

function setup(response: SearchResponse) {
  const { map, calls } = fakeMap();
  const search = vi.fn(async (_req: SearchRequest) => response);
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

  it('says so when nothing matches and does not move the camera', async () => {
    const { deps, calls, spoken } = setup({ matches: [], later: [] });
    const said = await runFallback('underwater basket weaving', deps);
    expect(said).toBe('I could not find anything like that right now. Try different interests.');
    expect(spoken).toEqual([said]);
    expect(calls.some((c) => c.startsWith('flyTo'))).toBe(false);
  });

  it('ignores a blank sentence', async () => {
    const { deps, search, spoken } = setup({ matches: [], later: [] });
    expect(await runFallback('   ', deps)).toBe('');
    expect(search).not.toHaveBeenCalled();
    expect(spoken).toEqual([]);
  });
});
