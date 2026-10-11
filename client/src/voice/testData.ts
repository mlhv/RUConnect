import { parseSeedBuildings, parseSeedEvents, type CampusEvent, type MapController } from '@ruconnect/shared';
import type { Hit } from './searchApi';

/** Shared fixtures for voice tests. Not a test file. */
export const NOW = '2026-10-10T13:30:00-04:00';

export const buildings = parseSeedBuildings([
  { id: 'student-center', name: 'Rutgers Student Center', aliases: ['RSC', 'Student Center'], lng: -74.4517, lat: 40.5028 },
  { id: 'alexander-library', name: 'Alexander Library', aliases: ['Alex', 'Alexander'], lng: -74.4527, lat: 40.5046 },
  { id: 'scott-hall', name: 'Scott Hall', aliases: ['Scott', 'SC'], lng: -74.4478, lat: 40.4999 },
  { id: 'voorhees-hall', name: 'Voorhees Hall', aliases: ['Voorhees', 'VH'], lng: -74.4462, lat: 40.4993 },
  { id: 'college-ave-gym', name: 'College Avenue Gym', aliases: ['The Barn', 'College Ave Gym'], lng: -74.4522, lat: 40.5034 },
]);

export function makeEvent(over: Partial<CampusEvent> & { id: string }): CampusEvent {
  return parseSeedEvents([
    {
      title: 'Robotics Club Build Session', category: 'club', buildingId: 'student-center',
      start: '2026-10-10T14:00:00-04:00', end: '2026-10-10T15:30:00-04:00', source: 'seed', ...over,
    },
  ])[0];
}

export function hit(over: Partial<CampusEvent> & { id: string }, distanceM: number | null = null, endsAfterWindow = false): Hit {
  return { event: makeEvent(over), distanceM, endsAfterWindow };
}

export function fakeMap(): { map: MapController; calls: string[] } {
  const calls: string[] = [];
  const map: MapController = {
    flyTo: (id) => void calls.push(`flyTo:${id}`),
    openBuilding: (id) => void calls.push(`openBuilding:${id}`),
    highlight: (ids) => void calls.push(`highlight:${ids.join(',')}`),
    clearHighlight: () => void calls.push('clearHighlight'),
    setTime: (iso) => void calls.push(`setTime:${iso}`),
  };
  return { map, calls };
}
