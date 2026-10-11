import { describe, expect, it } from 'vitest';
import { meaningNote } from './meaningNote';

const hit = (title: string, semantic: boolean) => ({ event: { title }, semantic });

describe('meaningNote', () => {
  it('is null when every hit shares a word with the question', () => {
    expect(meaningNote([hit('Robotics Club Build Session', false)])).toBeNull();
    expect(meaningNote([])).toBeNull();
  });

  it('names the events found by meaning, in order, leaving out the others', () => {
    const hits = [hit('Robotics Club Build Session', true), hit('Night Market', false), hit('Intro to Drones Open Lab', true)];
    expect(meaningNote(hits)).toBe('Matched by meaning: Robotics Club Build Session, Intro to Drones Open Lab');
  });

  it('names three at most and counts the rest', () => {
    const hits = ['A', 'B', 'C', 'D', 'E'].map((t) => hit(t, true));
    expect(meaningNote(hits)).toBe('Matched by meaning: A, B, C and 2 more');
  });

  it('flattens and shortens a title, which comes from a flyer', () => {
    expect(meaningNote([hit(`Line one\nLine two ${'x'.repeat(200)}`, true)])).toBe(`Matched by meaning: Line one Line two ${'x'.repeat(42)}`);
  });
});
