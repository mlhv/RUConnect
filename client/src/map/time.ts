const STEP_MS = 15 * 60 * 1000;
export const SLIDER_STEPS = 96;

const localMidnight = (iso: string): number => {
  const d = new Date(iso);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

/** Which 15-minute step of its local day an instant falls in. */
export function sliderIndex(iso: string): number {
  const index = Math.floor((Date.parse(iso) - localMidnight(iso)) / STEP_MS);
  return Math.min(SLIDER_STEPS - 1, Math.max(0, index));
}

/** The instant at a step of the same local day as `iso`. */
export function timeAtIndex(iso: string, index: number): string {
  const clamped = Math.min(SLIDER_STEPS - 1, Math.max(0, index));
  return new Date(localMidnight(iso) + clamped * STEP_MS).toISOString();
}

/** The next 15-minute step of the same local day, or null at the last one. Drives the play button. */
export function nextStep(iso: string): string | null {
  const index = sliderIndex(iso);
  return index >= SLIDER_STEPS - 1 ? null : timeAtIndex(iso, index + 1);
}
