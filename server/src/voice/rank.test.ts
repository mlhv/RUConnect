import { describe, expect, it } from 'vitest';
import { parseSeedBuildings, parseSeedEvents } from '@ruconnect/shared';
import { queryWords, rankEvents, words } from './rank';
import type { Hit } from './schema';

const NOW = '2026-10-10T13:30:00-04:00';
const at = (hhmm: string) => `2026-10-10T${hhmm}:00-04:00`;

const buildings = parseSeedBuildings([
  { id: 'alexander-library', name: 'Alexander Library', lng: -74.4527, lat: 40.5046 },
  { id: 'student-center', name: 'Rutgers Student Center', lng: -74.4517, lat: 40.5028 },
  { id: 'college-ave-gym', name: 'College Avenue Gym', lng: -74.4522, lat: 40.5034 },
  { id: 'scott-hall', name: 'Scott Hall', lng: -74.4478, lat: 40.4999 },
  { id: 'the-yard', name: 'The Yard', lng: -74.4484, lat: 40.5003 },
]);

const ev = (
  id: string, title: string, category: string, buildingId: string, start: string, end: string, extra: object = {},
) => ({ id, title, category, buildingId, start: at(start), end: at(end), source: 'seed', ...extra });

const raw = [
  ev('build', 'Robotics Club Build Session', 'club', 'student-center', '14:00', '15:30',
    { tags: ['robotics', 'engineering'], freeFood: true, expectedAttendance: 60,
      description: 'Build and test a line-following robot with the Robotics Club. Pizza provided.' }),
  ev('study', 'Study Break: Snacks and Board Games', 'social', 'alexander-library', '14:30', '15:30',
    { tags: ['study', 'games'], freeFood: true, expectedAttendance: 40,
      description: 'Take a break from midterms with snacks and board games in the lobby.' }),
  ev('drones', 'Intro to Drones Open Lab', 'academic', 'scott-hall', '14:00', '15:00',
    { tags: ['robotics', 'drones'], expectedAttendance: 30,
      description: 'Fly a small drone and learn the basics of autonomous flight.' }),
  ev('demo', 'Robotics Team Demo and Scrimmage', 'sports', 'college-ave-gym', '16:00', '17:30',
    { tags: ['robotics', 'competition'], freeFood: true, expectedAttendance: 150,
      description: 'Watch the competition robots run a practice match. Free snacks.' }),
  ev('market', 'Night Market at The Yard', 'food', 'the-yard', '18:00', '21:00',
    { tags: ['food trucks', 'vendors'], expectedAttendance: 400 }),
  ev('draft', 'Unreviewed Robotics Flyer', 'club', 'student-center', '14:00', '15:00',
    { tags: ['robotics'], status: 'needs_review' }),
  ev('morning', 'Robotics Breakfast', 'club', 'student-center', '10:00', '12:00', { tags: ['robotics'] }),
];
const events = parseSeedEvents(raw);
const ids = (hits: Hit[]) => hits.map((h) => h.event.id);
const demo = { query: 'robotics', to: at('16:00'), freeFood: 'prefer', nearBuildingId: 'alexander-library' } as const;

describe('words', () => {
  it('lowercases, splits on punctuation, and trims a plural s', () => {
    expect(words('Food Trucks & Games')).toEqual(['food', 'truck', 'game']);
  });

  it('drops filler words from a query but keeps interests', () => {
    expect(queryWords('I like free food and robotics')).toEqual(['robotic']);
    expect(queryWords('something cool??')).toEqual([]);
    expect(queryWords(undefined)).toEqual([]);
  });
});

describe('rankEvents', () => {
  it('orders the demo sentence: robotics with food near the library wins', () => {
    const res = rankEvents(events, buildings, demo, NOW);
    expect(ids(res.matches)).toEqual(['build', 'study', 'drones']);
    expect(res.later).toEqual([]);
  });

  it('keeps the build session first for the typed fallback sentence, which has no end time', () => {
    const typed = {
      query: "I'm free until 4, I like robotics and free food, what's near the library?",
      freeFood: 'prefer', nearBuildingId: 'alexander-library',
    } as const;
    expect(rankEvents(events, buildings, typed, NOW).matches[0].event.id).toBe('build');
  });

  it('reports distance to the anchor building in meters', () => {
    const { matches } = rankEvents(events, buildings, demo, NOW);
    expect(matches[0].distanceM).toBeGreaterThan(200);
    expect(matches[0].distanceM).toBeLessThan(235);
    expect(matches[1].distanceM).toBe(0);
    expect(rankEvents(events, buildings, { to: at('16:00') }, NOW).matches[0].distanceM).toBeNull();
  });

  it('compares instants across Z and offset strings', () => {
    const res = rankEvents(events, buildings, { ...demo, to: '2026-10-10T20:00:00Z' }, NOW);
    expect(ids(res.matches)).toEqual(['build', 'study', 'drones']);
  });

  it('drops events without food only when food is required', () => {
    expect(ids(rankEvents(events, buildings, { ...demo, freeFood: 'require' }, NOW).matches)).toEqual(['build', 'study']);
  });

  it('never returns unpublished events', () => {
    expect(ids(rankEvents(events, buildings, { query: 'robotics' }, NOW).matches)).not.toContain('draft');
  });

  it('requires 30 minutes inside the window and flags events that run past it', () => {
    expect(rankEvents(events, buildings, { to: at('14:20') }, NOW).matches).toEqual([]);
    const res = rankEvents(events, buildings, { query: 'robotics', to: at('14:30') }, NOW);
    expect(ids(res.matches)).toEqual(['build', 'drones']);
    expect(res.matches.every((h) => h.endsAfterWindow)).toBe(true);
  });

  it('includes a short event that fits entirely', () => {
    const short = parseSeedEvents([ev('quick', 'Quick Demo', 'club', 'scott-hall', '13:40', '13:55')]);
    expect(ids(rankEvents(short, buildings, { to: at('14:30') }, NOW).matches)).toEqual(['quick']);
  });

  it('clamps a past from to now, so finished events never match', () => {
    const res = rankEvents(events, buildings, { query: 'robotics', from: at('08:00'), to: at('16:00') }, NOW);
    expect(ids(res.matches)).not.toContain('morning');
  });

  it('fills later when fewer than two events match', () => {
    const res = rankEvents(events, buildings, { query: 'robotics', from: at('15:40'), to: at('16:00') }, NOW);
    expect(res.matches).toEqual([]);
    expect(ids(res.later)).toEqual(['demo', 'market']);
  });

  it('ranks by a matching tag and by the category argument', () => {
    expect(ids(rankEvents(events, buildings, { query: 'trucks' }, NOW).matches)[0]).toBe('market');
    expect(ids(rankEvents(events, buildings, { category: 'sports' }, NOW).matches)[0]).toBe('demo');
  });

  it('caps a vague request at two events per category', () => {
    const many = parseSeedEvents([
      ev('c1', 'Club One', 'club', 'scott-hall', '14:00', '15:00', { expectedAttendance: 90 }),
      ev('c2', 'Club Two', 'club', 'scott-hall', '14:00', '15:00', { expectedAttendance: 80 }),
      ev('c3', 'Club Three', 'club', 'scott-hall', '14:00', '15:00', { expectedAttendance: 70 }),
      ev('a1', 'Gallery Talk', 'arts', 'scott-hall', '14:00', '15:00', { expectedAttendance: 10 }),
    ]);
    expect(ids(rankEvents(many, buildings, {}, NOW).matches)).toEqual(['c1', 'c2', 'a1']);
    expect(ids(rankEvents(many, buildings, { query: 'something cool??' }, NOW).matches)).toEqual(['c1', 'c2', 'a1']);
    expect(ids(rankEvents(many, buildings, { category: 'club' }, NOW).matches)).toEqual(['c1', 'c2', 'c3', 'a1']);
  });

  it('returns at most eight matches', () => {
    const lots = parseSeedEvents(
      Array.from({ length: 12 }, (_, i) => ev(`e${i}`, `Robotics ${i}`, 'club', 'scott-hall', '14:00', '15:00')),
    );
    expect(rankEvents(lots, buildings, { query: 'robotics' }, NOW).matches).toHaveLength(8);
  });

  it('collapses one flyer that was ingested twice', () => {
    const twice = parseSeedEvents([
      ev('a', 'Robotics Club Interest Meeting', 'club', 'scott-hall', '14:00', '15:00'),
      ev('b', 'robotics club interest meeting ', 'club', 'scott-hall', '14:00', '15:00'),
      ev('c', 'Robotics Club Interest Meeting', 'club', 'student-center', '14:00', '15:00'),
    ]);
    expect(ids(rankEvents(twice, buildings, { query: 'robotics' }, NOW).matches)).toEqual(['a', 'c']);
  });

  it('survives an event whose building is not in the list', () => {
    const orphan = parseSeedEvents([ev('lost', 'Robotics Pop-up', 'club', 'nowhere', '14:00', '15:00')]);
    const res = rankEvents(orphan, buildings, { query: 'robotics', nearBuildingId: 'alexander-library' }, NOW);
    expect(res.matches[0].distanceM).toBeNull();
  });
});
