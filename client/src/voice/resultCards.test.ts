import { describe, expect, it } from 'vitest';
import { resultCards } from './resultCards';
import { NOW, buildings, hit } from './testData';

describe('resultCards', () => {
  it('describes a hit as a title, a place, and a time', () => {
    const [card] = resultCards([hit({ id: 'a', room: '411', freeFood: true })], buildings, NOW);
    expect(card).toEqual({
      id: 'a', title: 'Robotics Club Build Session', place: 'Rutgers Student Center, room 411',
      when: '2:00 PM to 3:30 PM', freeFood: true, semantic: false,
    });
  });

  it('names the day when the event is not today', () => {
    const later = hit({ id: 'a', start: '2026-10-15T19:00:00-04:00', end: '2026-10-15T20:30:00-04:00' });
    expect(resultCards([later], buildings, NOW)[0].when).toBe('Thu 7:00 PM to 8:30 PM');
  });

  it('carries the found-by-meaning flag', () => {
    expect(resultCards([{ ...hit({ id: 'a' }), semantic: true }], buildings, NOW)[0].semantic).toBe(true);
  });

  it('keeps the best three, in order', () => {
    const hits = ['a', 'b', 'c', 'd'].map((id) => hit({ id }));
    expect(resultCards(hits, buildings, NOW).map((c) => c.id)).toEqual(['a', 'b', 'c']);
  });

  it('flattens and shortens flyer text, and falls back to the building id', () => {
    const [card] = resultCards([hit({ id: 'a', title: `One\nTwo ${'x'.repeat(200)}`, buildingId: 'nowhere' })], buildings, NOW);
    expect(card.title).toBe(`One Two ${'x'.repeat(72)}`);
    expect(card.place).toBe('nowhere');
  });
});
