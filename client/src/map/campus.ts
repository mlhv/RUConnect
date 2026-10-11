import { isActiveAt, type Building, type CampusEvent } from '@ruconnect/shared';

export type CampusId = 'college_ave' | 'busch' | 'livingston' | 'cook_douglass';

export interface Campus {
  id: CampusId;
  name: string;
  /** Roughly the middle of the campus's buildings on the map, as [lng, lat]. */
  center: [number, number];
  /** The camera's view of the whole campus. */
  zoom: number;
  bearing: number;
}

/** The first campus is the one the app opens on. */
export const CAMPUSES: Campus[] = [
  { id: 'college_ave', name: 'College Ave', center: [-74.449, 40.5015], zoom: 16, bearing: -20 },
  { id: 'busch', name: 'Busch', center: [-74.4618, 40.5225], zoom: 15.6, bearing: -20 },
  { id: 'livingston', name: 'Livingston', center: [-74.4375, 40.5228], zoom: 15.6, bearing: -20 },
  { id: 'cook_douglass', name: 'Cook/Douglass', center: [-74.4345, 40.4832], zoom: 15.3, bearing: -20 },
];

/**
 * The campus whose centre is nearest. The building schema has no campus field, and the four
 * campuses are far enough apart that position alone decides it.
 */
export function campusAt(lng: number, lat: number): Campus {
  const cosLat = Math.cos((lat * Math.PI) / 180);
  const distance2 = (c: Campus) => ((c.center[0] - lng) * cosLat) ** 2 + (c.center[1] - lat) ** 2;
  return CAMPUSES.reduce((best, c) => (distance2(c) < distance2(best) ? c : best));
}

export function campusOf(building: Pick<Building, 'lng' | 'lat'>): Campus {
  return campusAt(building.lng, building.lat);
}

/** How many events are under way on each campus at an instant. Every campus has an entry. */
export function liveCounts(events: CampusEvent[], buildings: Building[], iso: string): Map<CampusId, number> {
  const campusByBuilding = new Map(buildings.map((b) => [b.id, campusOf(b).id]));
  const counts = new Map<CampusId, number>(CAMPUSES.map((c) => [c.id, 0]));
  for (const event of events) {
    const campus = campusByBuilding.get(event.buildingId);
    if (campus && isActiveAt(event, iso)) counts.set(campus, counts.get(campus)! + 1);
  }
  return counts;
}

const SHORT_FLIGHT_MS = 3200;
const LONG_FLIGHT_MS = 6000;
/** A flight this short, a hop within one campus, takes the usual time. */
const SHORT_FLIGHT_M = 500;
const EXTRA_MS_PER_M = 0.9;

/** How long a flight should take: longer between campuses so the ground does not blur past, up to a cap. */
export function flightMs(distanceM: number): number {
  const extra = Math.max(0, distanceM - SHORT_FLIGHT_M) * EXTRA_MS_PER_M;
  return Math.min(LONG_FLIGHT_MS, Math.round(SHORT_FLIGHT_MS + extra));
}
