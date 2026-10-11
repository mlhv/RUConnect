import { describe, expect, it } from 'vitest';
import { approach } from './fade';

describe('approach', () => {
  it('moves part of the way to the target, more with more time', () => {
    const short = approach(0, 1, 50, 300);
    const long = approach(0, 1, 300, 300);
    expect(short).toBeGreaterThan(0);
    expect(long).toBeGreaterThan(short);
    expect(long).toBeLessThan(1);
  });

  it('works downwards too', () => {
    expect(approach(1, 0, 300, 300)).toBeCloseTo(1 - approach(0, 1, 300, 300));
  });

  it('lands exactly on the target once it is close, so the fade ends', () => {
    expect(approach(0.999, 1, 16, 300)).toBe(1);
    expect(approach(59.9, 60, 16, 300)).toBe(60);
  });

  it('jumps straight to the target when the time constant is zero', () => {
    expect(approach(0, 40, 16, 0)).toBe(40);
  });
});
