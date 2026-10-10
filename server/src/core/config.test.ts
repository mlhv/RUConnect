import { describe, expect, it } from 'vitest';
import { loadConfig } from './config';

describe('loadConfig', () => {
  it('runs in mock mode with no database', () => {
    const c = loadConfig({ MOCK: '1' });
    expect(c).toMatchObject({ mock: true, databaseUrl: null, dbSchema: 'dev_local', port: 3001, swarmConcurrency: 4 });
  });

  it('requires DATABASE_URL when not mocking', () => {
    expect(() => loadConfig({ MOCK: '0' })).toThrow(/DATABASE_URL/);
  });

  it.each(['prod; DROP', 'Dev', 'dev-minh', '"x"', '1abc', 'a b'])('rejects unsafe DB_SCHEMA %j', (s) => {
    expect(() => loadConfig({ MOCK: '1', DB_SCHEMA: s })).toThrow(/DB_SCHEMA/);
  });

  it('rejects a DEMO_NOW that is not a date', () => {
    expect(() => loadConfig({ MOCK: '1', DEMO_NOW: 'tonight' })).toThrow(/DEMO_NOW/);
  });
});
