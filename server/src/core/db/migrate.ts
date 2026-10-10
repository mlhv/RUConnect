import { readdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type pg from 'pg';
import type { Building, CampusEvent } from '@ruconnect/shared';
import { REPO_ROOT } from '../config';

export const MIGRATIONS_DIR = resolve(REPO_ROOT, 'server/migrations');

const NAME_RE = /^\d{12}_[a-z0-9_]+\.sql$/;

export async function listMigrations(dir: string): Promise<string[]> {
  const files = (await readdir(dir)).filter((f) => f.endsWith('.sql'));
  for (const f of files) {
    if (!NAME_RE.test(f)) throw new Error(`Bad migration name "${f}": expected YYYYMMDDHHMM_description.sql`);
  }
  return files.sort();
}

export function pendingMigrations(all: string[], applied: string[]): string[] {
  const done = new Set(applied);
  return all.filter((name) => !done.has(name));
}

export function assertNamedSchema(schema: string): void {
  if (schema === 'dev_yourname') throw new Error('Set DB_SCHEMA in .env to your own name (dev_<yourname>), not the placeholder');
}

export function assertResettable(schema: string): void {
  if (schema === 'prod') throw new Error('Refusing to reset the prod schema');
  if (schema === 'public') throw new Error('Refusing to reset the public schema: it holds the shared vector extension');
}

/** Applies unapplied migrations in name order, one transaction each. Returns the names applied. */
export async function migrate(pool: pg.Pool, schema: string, dir = MIGRATIONS_DIR): Promise<string[]> {
  await pool.query('CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA public');
  await pool.query(`CREATE SCHEMA IF NOT EXISTS "${schema}"`);
  await pool.query(
    `CREATE TABLE IF NOT EXISTS "${schema}"._migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`,
  );
  const applied = (await pool.query(`SELECT name FROM "${schema}"._migrations`)).rows.map((r) => r.name as string);
  const todo = pendingMigrations(await listMigrations(dir), applied);
  for (const name of todo) {
    const sql = await readFile(join(dir, name), 'utf8');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SET LOCAL search_path TO "${schema}", public`);
      await client.query(sql);
      await client.query(`INSERT INTO "${schema}"._migrations (name) VALUES ($1)`, [name]);
      await client.query('COMMIT');
    } catch (err) {
      // A dead connection makes ROLLBACK throw too; that must not mask the migration error.
      await client.query('ROLLBACK').catch(() => {});
      throw new Error(`Migration ${name} failed: ${(err as Error).message}`);
    } finally {
      client.release();
    }
  }
  return todo;
}

export async function reset(pool: pg.Pool, schema: string): Promise<void> {
  assertResettable(schema);
  await pool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
}

/** Upserts buildings and inserts seed events that are not already present. */
export async function seedDb(pool: pg.Pool, schema: string, buildings: Building[], events: CampusEvent[]): Promise<void> {
  const s = `"${schema}"`;
  for (const b of buildings) {
    await pool.query(
      `INSERT INTO ${s}.buildings (id, name, aliases, lng, lat, footprint, height_m)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, aliases = EXCLUDED.aliases, lng = EXCLUDED.lng,
         lat = EXCLUDED.lat, footprint = EXCLUDED.footprint, height_m = EXCLUDED.height_m`,
      [b.id, b.name, b.aliases, b.lng, b.lat, JSON.stringify(b.footprint), b.heightM],
    );
  }
  for (const e of events) {
    await pool.query(
      `INSERT INTO ${s}.events (id, title, description, category, building_id, room, start_at, end_at,
         expected_attendance, tags, free_food, source, status, confidence)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
       ON CONFLICT (id) DO NOTHING`,
      [e.id, e.title, e.description, e.category, e.buildingId, e.room, e.start, e.end,
        e.expectedAttendance, e.tags, e.freeFood, e.source, e.status, e.confidence],
    );
  }
}
