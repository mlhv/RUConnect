import type pg from 'pg';
import type { Config } from './config';
import { PgStore } from './db/pgStore';
import { createPool } from './db/pool';
import { loadSeed } from './seed';
import { MemoryStore, type Store } from './store';

/** Everything a router needs. `pool` is null in mock mode; slices that query their own tables must handle that. */
export interface AppDeps {
  config: Config;
  store: Store;
  pool: pg.Pool | null;
}

export function createDeps(config: Config): AppDeps {
  if (config.mock || !config.databaseUrl) {
    const seed = loadSeed();
    return { config, store: new MemoryStore(seed.buildings, seed.events), pool: null };
  }
  const pool = createPool(config.databaseUrl, config.dbSchema);
  return { config, store: new PgStore(pool), pool };
}
