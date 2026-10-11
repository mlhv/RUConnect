import { describe, expect, it } from 'vitest';
import type { ReaderDraft } from './reader';
import { verify } from './verifier';

const now = '2026-10-10T19:30:00-04:00';
const draft: ReaderDraft = {
  title: 'Robotics Club Info Session',
  description: 'Meet the team.',
  category: 'club',
  campus: 'college_ave',
  buildingId: 'scott-hall',
  locationText: 'Scott Hall 123',
  room: '123',
  start: '2026-10-12T19:00:00-04:00',
  end: '2026-10-12T20:30:00-04:00',
  expectedAttendance: 60,
  tags: ['robotics'],
  freeFood: true,
  confidence: { title: 0.95, time: 0.9, location: 0.9 },
};

describe('verify', () => {
  it('publishes a confident draft, using the lowest group confidence', () => {
    const r = verify(draft, { source: 'flyer', now });
    expect(r.ok && r.event).toMatchObject({ status: 'published', confidence: 0.9, source: 'flyer', freeFood: true });
  });

  it('sends a low-confidence draft to review', () => {
    const r = verify({ ...draft, confidence: { ...draft.confidence, time: 0.6 } }, { source: 'flyer', now });
    expect(r.ok && r.event.status).toBe('needs_review');
  });

  it('sends an implausible date to review', () => {
    const r = verify({ ...draft, start: '2027-06-01T19:00:00-04:00', end: '2027-06-01T20:00:00-04:00' }, { source: 'flyer', now });
    expect(r.ok && r.event).toMatchObject({ status: 'needs_review', confidence: 0.5 });
  });

  it('defaults a missing end to one hour after start', () => {
    const r = verify({ ...draft, end: null }, { source: 'flyer', now });
    expect(r.ok && Date.parse(r.event.end) - Date.parse(r.event.start)).toBe(60 * 60 * 1000);
  });

  it('skips events on other campuses or online', () => {
    expect(verify({ ...draft, campus: 'busch' }, { source: 'board', now })).toEqual({ ok: false, reason: 'not College Ave (busch)' });
    expect(verify({ ...draft, campus: 'online' }, { source: 'board', now })).toMatchObject({ ok: false });
  });

  it('rejects drafts that cannot be placed or timed', () => {
    expect(verify({ ...draft, buildingId: null }, { source: 'flyer', now })).toMatchObject({ ok: false });
    expect(verify({ ...draft, start: null }, { source: 'flyer', now })).toMatchObject({ ok: false });
    expect(verify({ ...draft, title: null }, { source: 'flyer', now })).toMatchObject({ ok: false });
  });

  it('rejects an end before the start', () => {
    const r = verify({ ...draft, end: '2026-10-12T18:00:00-04:00' }, { source: 'flyer', now });
    expect(r).toMatchObject({ ok: false });
  });
});
