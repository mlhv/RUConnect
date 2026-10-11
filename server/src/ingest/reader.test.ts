import { describe, expect, it } from 'vitest';
import { testFixture } from '../core/testFixture';
import type { Gemini } from './gemini';
import { readFlyer } from './reader';

const { buildings } = testFixture();
const now = '2026-10-10T19:30:00-04:00';
const image = Buffer.from('fake-image');

const good = {
  title: 'Pizza Night', description: '', category: 'social', buildingId: 'scott-hall', locationText: 'Scott Hall',
  room: null, start: '2026-10-10T20:00:00-04:00', end: null, expectedAttendance: null, tags: [], freeFood: true,
  confidence: { title: 0.9, time: 0.9, location: 0.9 },
};

/** Returns the given responses in order and records each prompt. */
function stub(...responses: string[]): Gemini & { prompts: string[]; schemas: unknown[] } {
  const prompts: string[] = [];
  const schemas: unknown[] = [];
  return {
    prompts,
    schemas,
    async readImage({ prompt, jsonSchema }) {
      prompts.push(prompt);
      schemas.push(jsonSchema);
      return responses.shift() ?? '';
    },
  };
}

describe('readFlyer', () => {
  it('returns the validated draft and sends the known building ids as a schema', async () => {
    const gemini = stub(JSON.stringify(good));
    expect(await readFlyer({ image, mime: 'image/png' }, { gemini, buildings, now })).toEqual(good);
    expect(JSON.stringify(gemini.schemas[0])).toContain('college-ave-gym');
    expect(gemini.prompts[0]).toContain(now);
  });

  it('retries once with the validation error when the output is invalid', async () => {
    const gemini = stub(JSON.stringify({ ...good, buildingId: 'nowhere' }), JSON.stringify(good));
    expect((await readFlyer({ image, mime: 'image/png' }, { gemini, buildings, now })).buildingId).toBe('scott-hall');
    expect(gemini.prompts[1]).toContain('previous answer was rejected');
  });

  it('gives up after two invalid answers', async () => {
    const gemini = stub('not json', '{}');
    await expect(readFlyer({ image, mime: 'image/png' }, { gemini, buildings, now })).rejects.toThrow('failed validation');
  });

  it('includes a caption when one is given', async () => {
    const gemini = stub(JSON.stringify(good));
    await readFlyer({ image, mime: 'image/png', caption: 'Free pizza tonight!' }, { gemini, buildings, now });
    expect(gemini.prompts[0]).toContain('Free pizza tonight!');
  });
});
