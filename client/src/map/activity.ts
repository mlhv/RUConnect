import { isActiveAt, type CampusEvent } from '@ruconnect/shared';

export type Category = CampusEvent['category'];

/** Building colours by event category. Gold is left out: it marks highlighted buildings. */
export const CATEGORY_COLORS: Record<Category, string> = {
  academic: '#5b8def',
  social: '#ff5db1',
  career: '#2ec4b6',
  sports: '#ff8c42',
  arts: '#b388ff',
  club: '#7bd389',
  food: '#f25c54',
  other: '#9aa5b8',
};

/** The category each active building is coloured by: that of its best-attended published event at `iso`. */
export function buildingCategories(events: CampusEvent[], iso: string): Map<string, Category> {
  const best = new Map<string, CampusEvent>();
  for (const e of events) {
    if (e.status !== 'published' || !isActiveAt(e, iso)) continue;
    const current = best.get(e.buildingId);
    const lead = (e.expectedAttendance ?? 0) - (current?.expectedAttendance ?? 0);
    if (!current || lead > 0 || (lead === 0 && Date.parse(e.start) < Date.parse(current.start))) {
      best.set(e.buildingId, e);
    }
  }
  return new Map([...best].map(([buildingId, e]) => [buildingId, e.category]));
}
