import { describe, expect, it } from 'vitest';
import { SLIDER_STEPS, sliderIndex, timeAtIndex } from './time';

describe('time slider math', () => {
  const noon = '2026-10-10T16:07:00.000Z';

  it('round-trips every index on the same local day', () => {
    for (const i of [0, 1, 30, 78, SLIDER_STEPS - 1]) {
      expect(sliderIndex(timeAtIndex(noon, i))).toBe(i);
    }
  });

  it('moves in 15-minute steps', () => {
    const a = Date.parse(timeAtIndex(noon, 10));
    const b = Date.parse(timeAtIndex(noon, 11));
    expect(b - a).toBe(15 * 60 * 1000);
  });

  it('clamps out-of-range indexes', () => {
    expect(timeAtIndex(noon, -5)).toBe(timeAtIndex(noon, 0));
    expect(timeAtIndex(noon, 500)).toBe(timeAtIndex(noon, SLIDER_STEPS - 1));
  });
});
