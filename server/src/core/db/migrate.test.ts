import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { assertResettable, listMigrations, MIGRATIONS_DIR, pendingMigrations } from './migrate';

const dirWith = (...names: string[]) => {
  const dir = mkdtempSync(join(tmpdir(), 'mig-'));
  for (const n of names) writeFileSync(join(dir, n), 'SELECT 1;');
  return dir;
};

describe('listMigrations', () => {
  it('returns sql files in timestamp order and ignores other files', async () => {
    const dir = dirWith('202610102200_b.sql', '202610101800_a.sql', 'README.md');
    expect(await listMigrations(dir)).toEqual(['202610101800_a.sql', '202610102200_b.sql']);
  });

  it('rejects names that are not YYYYMMDDHHMM_description.sql', async () => {
    await expect(listMigrations(dirWith('001_init.sql'))).rejects.toThrow(/Bad migration name/);
    await expect(listMigrations(dirWith('202610101800-Init.sql'))).rejects.toThrow(/Bad migration name/);
  });

  it('accepts every migration in the repo', async () => {
    expect((await listMigrations(MIGRATIONS_DIR)).length).toBeGreaterThan(0);
  });
});

describe('pendingMigrations', () => {
  it('returns only unapplied names, in order', () => {
    expect(pendingMigrations(['a', 'b', 'c'], ['a'])).toEqual(['b', 'c']);
  });
});

describe('assertResettable', () => {
  it('refuses prod and allows dev schemas', () => {
    expect(() => assertResettable('prod')).toThrow(/prod/);
    expect(() => assertResettable('dev_minh')).not.toThrow();
  });

  it('refuses public, which holds the shared vector extension', () => {
    expect(() => assertResettable('public')).toThrow(/public/);
  });
});
