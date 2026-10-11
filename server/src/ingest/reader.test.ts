import { describe, expect, it } from 'vitest';
import { testFixture } from '../core/testFixture';
import type { Gemini, GeminiRequest } from './gemini';
import { readItem } from './reader';
import { draft, events } from './testGemini';

const { buildings } = testFixture();
const now = '2026-10-10T19:30:00-04:00';
const image = { data: Buffer.from('fake-image'), mime: 'image/png' };
const good = draft({ title: 'Pizza Night', buildingId: 'scott-hall' });

/** Returns the given responses in order and records each request. */
function stub(...responses: string[]): Gemini & { requests: GeminiRequest[] } {
  const requests: GeminiRequest[] = [];
  return {
    requests,
    async generateJson(req) {
      requests.push(req);
      return responses.shift() ?? '';
    },
    runTools: async () => '',
  };
}

describe('readItem', () => {
  it('returns every event found and sends the known building ids as a schema', async () => {
    const gemini = stub(events(good, { ...good, title: 'Second' }));
    const drafts = await readItem({ image }, { gemini, buildings, now });
    expect(drafts.map((d) => d.title)).toEqual(['Pizza Night', 'Second']);
    expect(JSON.stringify(gemini.requests[0].jsonSchema)).toContain('college-ave-gym');
    expect(gemini.requests[0].prompt).toContain(now);
    expect(gemini.requests[0].images).toHaveLength(1);
  });

  it('reads page text without an image, and accepts a page with no events', async () => {
    const gemini = stub(events());
    const text = 'Office hours: Mon-Fri 9-5';
    expect(await readItem({ text, sourceRef: 'https://example.rutgers.edu/events' }, { gemini, buildings, now })).toEqual([]);
    expect(gemini.requests[0].prompt).toContain(text);
    expect(gemini.requests[0].images).toEqual([]);
  });

  it("includes the critic's notes on a second read", async () => {
    const gemini = stub(events(good));
    await readItem({ image }, { gemini, buildings, now }, ['Event 0: the flyer says Oct 15, not Oct 14']);
    expect(gemini.requests[0].prompt).toContain('the flyer says Oct 15, not Oct 14');
  });

  it('retries once with the validation error when the output is invalid', async () => {
    const gemini = stub(events({ ...good, buildingId: 'nowhere' }), events(good));
    expect((await readItem({ image }, { gemini, buildings, now }))[0].buildingId).toBe('scott-hall');
    expect(gemini.requests[1].prompt).toContain('previous answer was rejected');
  });

  it('gives up after two invalid answers', async () => {
    const gemini = stub('not json', '{}');
    await expect(readItem({ image }, { gemini, buildings, now })).rejects.toThrow('failed validation');
  });
});
