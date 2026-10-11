import { describe, expect, it } from 'vitest';
import { rebaseToAppDate } from './demoClock';

const APP = '2026-10-10T13:30:00-04:00';
const REAL = '2026-10-11T01:50:00-04:00';

describe('rebaseToAppDate', () => {
  it('moves a time written from the real date onto the app date', () => {
    expect(rebaseToAppDate('2026-10-11T17:00:00-04:00', APP, REAL)).toBe('2026-10-10T21:00:00.000Z');
    expect(rebaseToAppDate('2026-10-15T19:00:00-04:00', APP, REAL)).toBe('2026-10-14T23:00:00.000Z');
  });

  it('leaves a time that is already on the app date', () => {
    expect(rebaseToAppDate('2026-10-10T16:00:00-04:00', APP, REAL)).toBe('2026-10-10T16:00:00-04:00');
  });

  it('does nothing when both clocks are on the same day', () => {
    expect(rebaseToAppDate('2026-10-11T17:00:00-04:00', REAL, '2026-10-11T09:00:00-04:00')).toBe('2026-10-11T17:00:00-04:00');
  });

  it('works when the app clock is ahead of the real one', () => {
    const real = '2026-10-08T10:00:00-04:00';
    expect(rebaseToAppDate('2026-10-08T17:00:00-04:00', APP, real)).toBe('2026-10-10T21:00:00.000Z');
    expect(rebaseToAppDate('2026-10-10T17:00:00-04:00', APP, real)).toBe('2026-10-10T17:00:00-04:00');
  });

  it('judges the day in Eastern time, not UTC', () => {
    // 11 PM Eastern on the real date is already the next day in UTC.
    expect(rebaseToAppDate('2026-10-12T03:00:00Z', APP, REAL)).toBe('2026-10-11T03:00:00.000Z');
  });
});
