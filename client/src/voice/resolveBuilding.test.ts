import { describe, expect, it } from 'vitest';
import { findMentionedBuilding, resolveBuilding } from './resolveBuilding';
import { buildings } from './testData';

const id = (name: string) => resolveBuilding(name, buildings)?.id ?? null;
const mentioned = (sentence: string) => findMentionedBuilding(sentence, buildings)?.id ?? null;

describe('resolveBuilding', () => {
  it('matches a name or alias exactly, ignoring case and a leading "the"', () => {
    expect(id('Alexander Library')).toBe('alexander-library');
    expect(id('alex')).toBe('alexander-library');
    expect(id('the Student Center')).toBe('student-center');
    expect(id('The Barn')).toBe('college-ave-gym');
  });

  it('matches part of a name', () => {
    expect(id('the library')).toBe('alexander-library');
    expect(id('gym')).toBe('college-ave-gym');
  });

  it('matches a name inside a longer phrase', () => {
    expect(id('Alexander Library on College Ave')).toBe('alexander-library');
  });

  it('picks the shortest name when several match', () => {
    expect(id('hall')).toBe('scott-hall');
  });

  it('returns null for an unknown or empty name', () => {
    expect(id('the stadium')).toBeNull();
    expect(id('  ')).toBeNull();
  });
});

describe('findMentionedBuilding', () => {
  it('finds a building by a distinctive word of its name', () => {
    expect(mentioned("I'm free until 4, what's near the library?")).toBe('alexander-library');
    expect(mentioned('anything at the gym tonight')).toBe('college-ave-gym');
  });

  it('finds a building by alias or full name', () => {
    expect(mentioned('events at Voorhees')).toBe('voorhees-hall');
    expect(mentioned('what is on at the student center')).toBe('student-center');
  });

  it('takes the first building mentioned', () => {
    expect(mentioned('from the gym to the library')).toBe('college-ave-gym');
  });

  it('ignores shared words, common words, and two-letter aliases', () => {
    expect(mentioned('which hall has food')).toBeNull();
    expect(mentioned('I am a student at Rutgers')).toBeNull();
    expect(mentioned('sc vh')).toBeNull();
    expect(mentioned('what is cool tonight')).toBeNull();
  });
});
