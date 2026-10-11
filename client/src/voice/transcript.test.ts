import { describe, expect, it } from 'vitest';
import { transcriptReducer, type Line } from './transcript';

const add = (state: Line[], role: Line['role'], text: string) => transcriptReducer(state, { type: 'add', role, text });

describe('transcriptReducer', () => {
  it('appends lines with increasing ids', () => {
    const s = add(add([], 'user', 'hi'), 'agent', 'hello');
    expect(s.map((l) => [l.id, l.role, l.text])).toEqual([[1, 'user', 'hi'], [2, 'agent', 'hello']]);
  });

  it('ignores blank text and an exact repeat of the last line', () => {
    const s = add([], 'user', 'hi');
    expect(add(s, 'user', '  ')).toBe(s);
    expect(add(s, 'user', 'hi')).toBe(s);
    expect(add(s, 'agent', 'hi')).toHaveLength(2);
  });

  it('keeps the newest 50 lines', () => {
    let s: Line[] = [];
    for (let i = 0; i < 60; i++) s = add(s, 'user', `line ${i}`);
    expect(s).toHaveLength(50);
    expect(s[0].text).toBe('line 10');
    expect(s[49].id).toBe(60);
  });

  it("removes the agent's delivery tags and leaves other roles alone", () => {
    const s = add([], 'agent', '[excited] Tonight looks great! [happy] Or try the Art After Hours event.');
    expect(s[0].text).toBe('Tonight looks great! Or try the Art After Hours event.');
    expect(add([], 'agent', '[apologetic]')).toEqual([]);
    expect(add([], 'user', 'is [this] kept?')[0].text).toBe('is [this] kept?');
  });

  it('clears', () => {
    expect(transcriptReducer(add([], 'user', 'hi'), { type: 'clear' })).toEqual([]);
  });
});
