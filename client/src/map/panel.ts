import { isActiveAt, type CampusEvent } from '@ruconnect/shared';

export interface BuildingEvents {
  /** Published events in the building that overlap the selected time. */
  now: CampusEvent[];
  /** Published events in the building that start later on the same local day. */
  later: CampusEvent[];
}

const byStart = (a: CampusEvent, b: CampusEvent) => Date.parse(a.start) - Date.parse(b.start);
const localDay = (iso: string) => new Date(iso).toDateString();

/** What the building panel lists for one building at the slider's time. */
export function eventsForBuilding(events: CampusEvent[], buildingId: string, iso: string): BuildingEvents {
  const t = Date.parse(iso);
  const here = events.filter((e) => e.buildingId === buildingId && e.status === 'published');
  return {
    now: here.filter((e) => isActiveAt(e, iso)).sort(byStart),
    later: here.filter((e) => Date.parse(e.start) > t && localDay(e.start) === localDay(iso)).sort(byStart),
  };
}
