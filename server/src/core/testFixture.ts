import { parseSeedBuildings, parseSeedEvents, type Building, type CampusEvent } from '@ruconnect/shared';

/** Small fixed dataset for server tests, so they do not depend on the real files in data/. */
const rect = (lng: number, lat: number): number[][] => [
  [lng, lat], [lng + 0.0004, lat], [lng + 0.0004, lat + 0.0003], [lng, lat + 0.0003], [lng, lat],
];

const building = (id: string, name: string, lng: number, lat: number) => ({
  id, name, aliases: [], lng, lat, heightM: 12, footprint: rect(lng, lat),
});

const event = (
  id: string, title: string, category: string, buildingId: string, start: string, end: string,
) => ({ id, title, description: '', category, buildingId, start, end, tags: [], source: 'seed' });

export function testFixture(): { buildings: Building[]; events: CampusEvent[] } {
  return {
    buildings: parseSeedBuildings([
      building('scott-hall', 'Scott Hall', -74.4485, 40.5005),
      building('college-ave-gym', 'College Avenue Gym', -74.4505, 40.5015),
      building('voorhees-hall', 'Voorhees Hall', -74.4465, 40.5025),
      building('brower-commons', 'Brower Commons', -74.4455, 40.5035),
    ]),
    events: parseSeedEvents([
      event('seed-pickup-basketball', 'Pickup Basketball', 'sports', 'college-ave-gym',
        '2026-10-10T17:00:00-04:00', '2026-10-10T19:00:00-04:00'),
      event('seed-robotics-info', 'Robotics Club Info Session', 'club', 'scott-hall',
        '2026-10-10T19:00:00-04:00', '2026-10-10T20:30:00-04:00'),
      event('seed-film-screening', 'International Film Screening', 'arts', 'voorhees-hall',
        '2026-10-10T19:30:00-04:00', '2026-10-10T21:30:00-04:00'),
      event('seed-brunch-social', 'Sunday Brunch Social', 'social', 'brower-commons',
        '2026-10-11T10:00:00-04:00', '2026-10-11T12:00:00-04:00'),
      event('seed-writing-workshop', 'Creative Writing Workshop', 'academic', 'brower-commons',
        '2026-10-11T11:00:00-04:00', '2026-10-11T12:30:00-04:00'),
      event('seed-fall-concert', 'Glee Club Fall Concert', 'arts', 'voorhees-hall',
        '2026-10-11T15:00:00-04:00', '2026-10-11T16:30:00-04:00'),
    ]),
  };
}
