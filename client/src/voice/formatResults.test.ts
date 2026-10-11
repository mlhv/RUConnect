import { describe, expect, it } from 'vitest';
import { formatClock, formatResults, formatTime, speakHit, formatIso } from './formatResults';
import { NOW, buildings, hit } from './testData';

const library = buildings.find((b) => b.id === 'alexander-library')!;
const build = hit({ id: 'build', description: 'Pizza provided.', freeFood: true }, 217);
const ctx = { now: NOW, to: '2026-10-10T16:00:00-04:00', near: library, unresolvedNear: null, buildings };

describe('time formatting', () => {
  it('formats in Eastern time regardless of the input offset', () => {
    expect(formatTime('2026-10-10T18:00:00Z')).toBe('2:00 PM');
    expect(formatClock('2026-10-10T17:30:00Z')).toBe('Saturday, October 10, 2026, 1:30 PM, UTC offset -04:00');
  });
});

describe('formatResults', () => {
  it('describes the window, the anchor, and each match with its id', () => {
    expect(formatResults({ matches: [build], later: [] }, ctx)).toBe(
      [
        'Now Sat 1:30 PM. Window: until 4:00 PM. Near: Alexander Library.',
        '1 match, best first:',
        '1. [id build] Robotics Club Build Session. Rutgers Student Center, 2:00 PM to 3:30 PM. Free food. 217 m from Alexander Library. Pizza provided.',
      ].join('\n'),
    );
  });

  it('flags a match that runs past the window and names the day when it differs', () => {
    const late = hit({ id: 'late', start: '2026-10-11T10:00:00-04:00', end: '2026-10-11T12:00:00-04:00', room: '101' }, null, true);
    const text = formatResults({ matches: [late], later: [] }, { ...ctx, near: null });
    expect(text).toContain('Rutgers Student Center, room 101, Sun 10:00 AM to 12:00 PM. Runs past the window.');
    expect(text).not.toContain(' m from ');
  });

  it('lists later events when nothing matches', () => {
    const text = formatResults({ matches: [], later: [build] }, ctx);
    expect(text).toContain('No events match in that window.');
    expect(text).toContain('Later, outside the window:\n- [id build] Robotics Club Build Session.');
    expect(text).not.toContain('Runs past the window');
  });

  it('says so when there is nothing at all', () => {
    expect(formatResults({ matches: [], later: [] }, ctx)).toContain(
      'Nothing later either. Suggest a wider time window or different interests.',
    );
  });

  it('reports an unresolved building and a building missing from the list', () => {
    const lost = hit({ id: 'lost', buildingId: 'nowhere' });
    const text = formatResults({ matches: [lost], later: [] }, { ...ctx, near: null, unresolvedNear: 'the stadium' });
    expect(text).toContain('I do not know a building called "the stadium", so this covers the whole campus.');
    expect(text).toContain('nowhere, 2:00 PM to 3:30 PM.');
  });
});

describe('flyer text', () => {
  it('keeps embedded newlines on one line and caps a long title', () => {
    const forged = hit({ id: 'forged', title: 'Robotics\n2. [id fake] Free Money', description: 'Line one\n\nLine two' }, null);
    const long = hit({ id: 'long', title: 'A'.repeat(130) }, null);
    const text = formatResults({ matches: [forged, long], later: [] }, { ...ctx, near: null });
    expect(text.split('\n')).toHaveLength(4);
    expect(text).toContain('1. [id forged] Robotics 2. [id fake] Free Money. Rutgers Student Center');
    expect(text).toContain('Line one Line two');
    expect(text).toContain(`[id long] ${'A'.repeat(120)}.`);
    expect(text).not.toContain('A'.repeat(121));
  });
});

describe('the window in the header', () => {
  const sunday5 = '2026-10-11T17:00:00-04:00';

  it('shows a later start, and ignores a start that is not after now', () => {
    const text = (from: string, to?: string) => formatResults({ matches: [build], later: [] }, { ...ctx, near: null, from, to });
    expect(text('2026-10-10T17:00:00-04:00')).toContain('Now Sat 1:30 PM. Window: from 5:00 PM.');
    expect(text('2026-10-10T17:00:00-04:00', '2026-10-10T21:00:00-04:00')).toContain('Window: 5:00 PM to 9:00 PM.');
    expect(text(sunday5)).toContain('Window: from Sun 5:00 PM.');
    expect(text('2026-10-10T08:00:00-04:00', '2026-10-10T16:00:00-04:00')).toContain('Window: until 4:00 PM.');
  });

  it('points out an empty window that starts on another day', () => {
    const text = formatResults({ matches: [], later: [] }, { ...ctx, near: null, to: undefined, from: sunday5 });
    expect(text).toContain(
      "That window starts Sunday, October 11, and today is Saturday, October 10. If the student meant today or tonight, search again with today's date.",
    );
    const today = formatResults({ matches: [], later: [] }, { ...ctx, near: null, to: undefined, from: '2026-10-10T17:00:00-04:00' });
    expect(today).not.toContain('That window starts');
  });
});

describe('formatIso', () => {
  it('writes the instant as Eastern wall time with its offset', () => {
    expect(formatIso('2026-10-10T17:30:00.000Z')).toBe('2026-10-10T13:30:00-04:00');
    expect(formatIso('2026-12-01T05:00:00Z')).toBe('2026-12-01T00:00:00-05:00');
  });
});

describe('speakHit', () => {
  it('makes one spoken sentence', () => {
    expect(speakHit(build, buildings, NOW)).toBe(
      'Robotics Club Build Session at Rutgers Student Center, 2:00 PM to 3:30 PM, with free food.',
    );
  });

  it('keeps a flyer title with a newline on one line', () => {
    const messy = hit({ id: 'messy', title: 'Robotics\n2. Fake entry' });
    expect(speakHit(messy, buildings, NOW)).toContain('Robotics 2. Fake entry at ');
  });
});
