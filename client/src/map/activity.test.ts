import { describe, expect, it } from 'vitest';
import { CategorySchema } from '@ruconnect/shared';
import { CATEGORY_COLORS, buildingCategories } from './activity';
import { at, makeEvent } from './testEvent';

describe('buildingCategories', () => {
  it('gives each active building the category of its best-attended event', () => {
    const events = [
      makeEvent({ id: 'small', category: 'arts', expectedAttendance: 20 }),
      makeEvent({ id: 'big', category: 'food', expectedAttendance: 200 }),
      makeEvent({ id: 'unknown', category: 'career', expectedAttendance: null }),
      makeEvent({ id: 'other', buildingId: 'b2', category: 'sports' }),
    ];
    expect(buildingCategories(events, at(13, 30))).toEqual(new Map([['b1', 'food'], ['b2', 'sports']]));
  });

  it('breaks an attendance tie by the earlier start', () => {
    const events = [
      makeEvent({ id: 'second', category: 'arts', start: at(13), end: at(15) }),
      makeEvent({ id: 'first', category: 'club', start: at(12), end: at(15) }),
    ];
    expect(buildingCategories(events, at(13, 30)).get('b1')).toBe('club');
  });

  it('ignores events that are not on now or not published', () => {
    const events = [
      makeEvent({ id: 'later', start: at(16), end: at(17) }),
      makeEvent({ id: 'draft', buildingId: 'b2', status: 'needs_review' }),
    ];
    expect(buildingCategories(events, at(13, 30)).size).toBe(0);
  });
});

describe('CATEGORY_COLORS', () => {
  it('has a distinct colour for every category', () => {
    const colors = CategorySchema.options.map((c) => CATEGORY_COLORS[c]);
    expect(colors.every((c) => /^#[0-9a-f]{6}$/.test(c))).toBe(true);
    expect(new Set(colors).size).toBe(colors.length);
  });
});
