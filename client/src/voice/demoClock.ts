import { formatIso } from './formatResults';

const DAY_MS = 86_400_000;

/** The Eastern calendar day of an instant, as a day count. */
function easternDay(iso: string): number {
  const [y, m, d] = formatIso(iso).slice(0, 10).split('-').map(Number);
  return Date.UTC(y, m - 1, d) / DAY_MS;
}

/**
 * With DEMO_NOW set, the app's clock and the real clock are on different days, and the agent's model
 * tends to write dates from the real one. Moves such a time onto the app's calendar: a time on the
 * real clock's side of the gap shifts by the gap, a time already on the app's side is returned as is.
 */
export function rebaseToAppDate(iso: string, appNow: string, realNow: string): string {
  const gap = easternDay(appNow) - easternDay(realNow);
  if (gap === 0) return iso;
  const day = easternDay(iso);
  const onRealSide = gap < 0 ? day >= easternDay(realNow) : day < easternDay(appNow);
  return onRealSide ? new Date(Date.parse(iso) + gap * DAY_MS).toISOString() : iso;
}
