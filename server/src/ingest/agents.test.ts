import { describe, expect, it } from 'vitest';
import type { EventInput } from '@ruconnect/shared';
import { MemoryStore } from '../core/store';
import { testFixture } from '../core/testFixture';
import { critique } from './critic';
import { findDuplicate } from './deduper';
import type { ReaderDraft } from './reader';
import { scout } from './scout';
import { draft, scriptedGemini } from './testGemini';

const { buildings, events: seedEvents } = testFixture();
const now = '2026-10-10T19:30:00-04:00';

describe('critic', () => {
  const drafts = [draft({ title: 'Robotics Night' }), draft({ title: 'Film Screening' })] as ReaderDraft[];

  it('turns flagged reviews and missed events into notes for the Reader', async () => {
    const { gemini } = scriptedGemini({ critic: [JSON.stringify({
      reviews: [{ index: 0, ok: true, problems: [] }, { index: 1, ok: false, problems: ['the flyer says 8 PM, not 2 PM'] }],
      missed: ['Pizza social after the screening'],
    })] });
    const c = await critique({ text: 'source' }, drafts, { gemini, buildings, now });
    expect(c).toEqual({
      notes: ['Event 1 (Film Screening): the flyer says 8 PM, not 2 PM', 'Missed event: Pizza social after the screening'],
      flagged: 1,
      missed: 1,
    });
  });

  it('approves when nothing is wrong, and ignores an unreadable critique', async () => {
    const ok = scriptedGemini();
    expect((await critique({ text: 'source' }, drafts, { gemini: ok.gemini, buildings, now })).notes).toEqual([]);
    const junk = scriptedGemini({ critic: ['{"verdict":"looks fine"}'] });
    expect((await critique({ text: 'source' }, drafts, { gemini: junk.gemini, buildings, now })).notes).toEqual([]);
  });
});

describe('scout', () => {
  const listing = 'SparkNight [https://zimmerli.rutgers.edu/event/spark]\nTour [https://zimmerli.rutgers.edu/event/tour]';

  it('opens the pages it chooses and reports each one', async () => {
    const { gemini } = scriptedGemini({ scoutOpens: ['https://zimmerli.rutgers.edu/event/spark'] });
    const opened: string[] = [];
    const pages = await scout({
      gemini, listingUrl: 'https://zimmerli.rutgers.edu/events', listingText: listing,
      fetchPage: async (url) => `detail page for ${url}`, onOpen: (url) => opened.push(url),
    });
    expect(pages).toEqual([{ url: 'https://zimmerli.rutgers.edu/event/spark', text: 'detail page for https://zimmerli.rutgers.edu/event/spark', reason: 'listing has no room' }]);
    expect(opened).toEqual(['https://zimmerli.rutgers.edu/event/spark']);
  });

  it('refuses other sites, repeats, and pages past the limit', async () => {
    const { gemini } = scriptedGemini({ scoutOpens: [
      'https://evil.example.com/x',
      'https://zimmerli.rutgers.edu/event/spark',
      'https://zimmerli.rutgers.edu/event/spark',
      'https://zimmerli.rutgers.edu/event/tour',
    ] });
    const pages = await scout({
      gemini, listingUrl: 'https://zimmerli.rutgers.edu/events', listingText: listing, maxPages: 1,
      fetchPage: async () => 'text',
    });
    expect(pages.map((p) => p.url)).toEqual(['https://zimmerli.rutgers.edu/event/spark']);
  });
});

describe('deduper', () => {
  const store = new MemoryStore(buildings, seedEvents);
  const base: EventInput = {
    title: 'Robotics Club Info Session', description: '', category: 'club', buildingId: 'scott-hall', room: null,
    start: '2026-10-10T19:30:00-04:00', end: '2026-10-10T20:30:00-04:00', expectedAttendance: null, tags: [],
    freeFood: false, source: 'board', status: 'published', confidence: 1,
  };

  it('matches an identical title without asking the model', async () => {
    const s = scriptedGemini();
    expect((await findDuplicate(base, { store, gemini: s.gemini }))?.duplicateOf.id).toBe('seed-robotics-info');
    expect(s.count('deduper')).toBe(0);
  });

  it('asks the model about a differently titled candidate', async () => {
    const s = scriptedGemini({ deduper: ['{"sameAsId":"seed-robotics-info","reason":"same club and time"}'] });
    const dup = await findDuplicate({ ...base, title: 'RU Robotics: Meet the Team' }, { store, gemini: s.gemini });
    expect(dup).toMatchObject({ duplicateOf: { id: 'seed-robotics-info' }, reason: 'same club and time' });
  });

  it('keeps events with no nearby candidate or a model "no"', async () => {
    const s = scriptedGemini();
    expect(await findDuplicate({ ...base, title: 'Different Talk' }, { store, gemini: s.gemini })).toBeNull();
    expect(await findDuplicate({ ...base, start: '2026-10-12T19:00:00-04:00', end: '2026-10-12T20:00:00-04:00' }, { store, gemini: s.gemini })).toBeNull();
    expect(s.count('deduper')).toBe(1);
  });
});
