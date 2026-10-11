import { describe, expect, it } from 'vitest';
import { ApiError } from '@google/genai';
import { withBackoff } from './gemini';

/** Fails with the given errors in order, then succeeds. */
function flaky(...errors: unknown[]) {
  let calls = 0;
  const fn = async () => {
    calls++;
    const err = errors.shift();
    if (err) throw err;
    return 'ok';
  };
  return { fn, calls: () => calls };
}

describe('withBackoff', () => {
  it('retries dropped connections and timeouts', async () => {
    const timeout = Object.assign(new Error('The operation timed out'), { name: 'TimeoutError' });
    const f = flaky(new TypeError('fetch failed'), timeout);
    expect(await withBackoff(f.fn, 1)).toBe('ok');
    expect(f.calls()).toBe(3);
  });

  it('gives up after three retries', async () => {
    const f = flaky(...Array.from({ length: 5 }, () => new TypeError('fetch failed')));
    await expect(withBackoff(f.fn, 1)).rejects.toThrow('fetch failed');
    expect(f.calls()).toBe(4);
  });

  it('retries a per-minute rate limit but not an exhausted daily quota', async () => {
    const perMinute = flaky(new ApiError({ status: 429, message: 'quotaId: GenerateRequestsPerMinutePerProjectPerModel' }));
    expect(await withBackoff(perMinute.fn, 1)).toBe('ok');
    const perDay = flaky(new ApiError({ status: 429, message: 'quotaId: GenerateRequestsPerDayPerProjectPerModel-FreeTier' }));
    await expect(withBackoff(perDay.fn, 1)).rejects.toThrow();
    expect(perDay.calls()).toBe(1);
  });

  it('does not retry errors that will not fix themselves', async () => {
    const f = flaky(new Error('Reader output failed validation twice'));
    await expect(withBackoff(f.fn, 1)).rejects.toThrow();
    expect(f.calls()).toBe(1);
  });
});
