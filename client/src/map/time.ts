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

/** Where an instant sits on the slider, with a fraction when it falls between two steps. */
export function sliderPosition(iso: string): number {
  const position = (Date.parse(iso) - localMidnight(iso)) / STEP_MS;
  return Math.min(SLIDER_STEPS - 1, Math.max(0, position));
}

/**
 * The instant `stepMs` later, or null when that would pass the last slider step of the day.
 * Drives the play button, which uses steps shorter than the slider's own so the clock glides.
 */
export function nextStep(iso: string, stepMs = STEP_MS): string | null {
  const next = Date.parse(iso) + stepMs;
  return next > localMidnight(iso) + (SLIDER_STEPS - 1) * STEP_MS ? null : new Date(next).toISOString();
}
