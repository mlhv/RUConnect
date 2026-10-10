import { describe, expect, it } from 'vitest';
import { EventInputSchema, EventPatchSchema } from './index';

const base = {
  title: 'Robotics Info Session',
  category: 'club',
  buildingId: 'scott-hall',
  start: '2026-10-10T19:00:00-04:00',
  end: '2026-10-10T20:30:00-04:00',
};

describe('EventInputSchema', () => {
  it('fills defaults for optional fields', () => {
    const e = EventInputSchema.parse(base);
    expect(e).toMatchObject({
      description: '', room: null, expectedAttendance: null, tags: [],
      freeFood: false, source: 'manual', status: 'published', confidence: 1,
    });
  });

  it('rejects an end that is not after the start', () => {
    expect(EventInputSchema.safeParse({ ...base, end: base.start }).success).toBe(false);
    expect(EventInputSchema.safeParse({ ...base, end: '2026-10-10T18:00:00-04:00' }).success).toBe(false);
  });

  it('compares instants, not strings, across offsets', () => {
    // 23:30Z is 19:30 in -04:00, which is after the 19:00-04:00 start
    expect(EventInputSchema.safeParse({ ...base, end: '2026-10-10T23:30:00Z' }).success).toBe(true);
  });

  it('rejects a datetime without an offset and an unknown category', () => {
    expect(EventInputSchema.safeParse({ ...base, start: '2026-10-10T19:00:00' }).success).toBe(false);
    expect(EventInputSchema.safeParse({ ...base, category: 'party' }).success).toBe(false);
  });
});

describe('EventPatchSchema', () => {
  it('keeps only the fields that were sent', () => {
    expect(EventPatchSchema.parse({ status: 'published' })).toEqual({ status: 'published' });
  });
});
