import { describe, expect, it } from 'vitest';
import { SLIDER_STEPS, nextStep, sliderIndex, sliderPosition, timeAtIndex } from './time';

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

describe('nextStep', () => {
  const noon = '2026-10-10T16:07:00.000Z';

  it('moves one step later on the same day', () => {
    expect(sliderIndex(nextStep(timeAtIndex(noon, 54))!)).toBe(55);
  });

  it('returns null at the last step of the day', () => {
    expect(nextStep(timeAtIndex(noon, SLIDER_STEPS - 1))).toBeNull();
  });
});

describe('playback steps', () => {
  const noon = '2026-10-10T16:07:00.000Z';

  it('advances by a custom step shorter than a slider step', () => {
    const start = timeAtIndex(noon, 54);
    expect(Date.parse(nextStep(start, 3 * 60_000)!) - Date.parse(start)).toBe(3 * 60_000);
  });

  it('never runs past the last slider step of the day', () => {
    const nearEnd = new Date(Date.parse(timeAtIndex(noon, SLIDER_STEPS - 1)) - 60_000).toISOString();
    expect(nextStep(nearEnd, 3 * 60_000)).toBeNull();
  });

  it('places an instant between two slider steps', () => {
    const start = timeAtIndex(noon, 54);
    expect(sliderPosition(start)).toBe(54);
    expect(sliderPosition(new Date(Date.parse(start) + 3 * 60_000).toISOString())).toBeCloseTo(54.2);
  });
});
