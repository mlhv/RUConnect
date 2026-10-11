const MAX_NAMED = 3;
const MAX_TITLE = 60;

/**
 * The panel's note for results the database found by vector similarity alone, or null when there are none.
 * Titles come from flyers, so each is flattened to one line and capped.
 */
export function meaningNote(hits: { event: { title: string }; semantic: boolean }[]): string | null {
  const titles = hits.filter((h) => h.semantic).map((h) => h.event.title.replace(/\s+/g, ' ').trim().slice(0, MAX_TITLE));
  if (titles.length === 0) return null;
  const rest = titles.length - MAX_NAMED;
  return `Matched by meaning: ${titles.slice(0, MAX_NAMED).join(', ')}${rest > 0 ? ` and ${rest} more` : ''}`;
}
