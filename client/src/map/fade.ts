/**
 * Moves `current` towards `target` with an exponential ease: after `tauMs` it has covered about 63% of the gap.
 * Lands exactly on the target once within a thousandth of it (relative to the target's size), so a fade finishes.
 */
export function approach(current: number, target: number, dtMs: number, tauMs: number): number {
  if (tauMs <= 0) return target;
  const next = current + (target - current) * (1 - Math.exp(-dtMs / tauMs));
  return Math.abs(target - next) <= 0.002 * Math.max(1, Math.abs(target)) ? target : next;
}
