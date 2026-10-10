import type pg from 'pg';
import type { Building, CampusEvent, EventInput, EventPatch, EventQuery } from '@ruconnect/shared';
import type { Store } from '../store';

const EVENT_COLS = `id, title, description, category, building_id, room, start_at, end_at,
  expected_attendance, tags, free_food, source, status, confidence, created_at`;

const PATCH_COLUMNS: Record<keyof EventPatch, string> = {
  title: 'title', description: 'description', category: 'category', buildingId: 'building_id', room: 'room',
  start: 'start_at', end: 'end_at', expectedAttendance: 'expected_attendance', tags: 'tags',
  freeFood: 'free_food', source: 'source', status: 'status', confidence: 'confidence',
};

function toEvent(r: any): CampusEvent {
  return {
    id: r.id, title: r.title, description: r.description, category: r.category, buildingId: r.building_id,
    room: r.room, start: r.start_at.toISOString(), end: r.end_at.toISOString(),
    expectedAttendance: r.expected_attendance, tags: r.tags, freeFood: r.free_food, source: r.source,
    status: r.status, confidence: r.confidence, createdAt: r.created_at.toISOString(),
  };
}

/** Relies on the pool's search_path (see createPool) to resolve unqualified table names. */
export class PgStore implements Store {
  constructor(private readonly pool: pg.Pool) {}

  async listBuildings(): Promise<Building[]> {
    const { rows } = await this.pool.query(
      'SELECT id, name, aliases, lng, lat, footprint, height_m FROM buildings ORDER BY name',
    );
    return rows.map((r) => ({
      id: r.id, name: r.name, aliases: r.aliases, lng: r.lng, lat: r.lat, footprint: r.footprint, heightM: r.height_m,
    }));
  }

  async listEvents(q: Partial<EventQuery>): Promise<CampusEvent[]> {
    const where: string[] = [];
    const params: unknown[] = [];
    const add = (clause: string, value: unknown) => {
      params.push(value);
      where.push(clause.replace('?', `$${params.length}`));
    };
    if (q.status) add('status = ?', q.status);
    if (q.buildingId) add('building_id = ?', q.buildingId);
    if (q.to) add('start_at < ?', q.to);
    if (q.from) add('end_at > ?', q.from);
    const sql = `SELECT ${EVENT_COLS} FROM events ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY start_at`;
    return (await this.pool.query(sql, params)).rows.map(toEvent);
  }

  async getEvent(id: string): Promise<CampusEvent | null> {
    const { rows } = await this.pool.query(`SELECT ${EVENT_COLS} FROM events WHERE id = $1`, [id]);
    return rows[0] ? toEvent(rows[0]) : null;
  }

  async createEvent(e: EventInput): Promise<CampusEvent> {
    const { rows } = await this.pool.query(
      `INSERT INTO events (title, description, category, building_id, room, start_at, end_at,
         expected_attendance, tags, free_food, source, status, confidence)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       RETURNING ${EVENT_COLS}`,
      [e.title, e.description, e.category, e.buildingId, e.room, e.start, e.end,
        e.expectedAttendance, e.tags, e.freeFood, e.source, e.status, e.confidence],
    );
    return toEvent(rows[0]);
  }

  async updateEvent(id: string, patch: EventPatch): Promise<CampusEvent | null> {
    const keys = (Object.keys(patch) as (keyof EventPatch)[]).filter((k) => patch[k] !== undefined);
    if (keys.length === 0) return this.getEvent(id);
    const sets = keys.map((k, i) => `${PATCH_COLUMNS[k]} = $${i + 2}`);
    const { rows } = await this.pool.query(
      `UPDATE events SET ${sets.join(', ')} WHERE id = $1 RETURNING ${EVENT_COLS}`,
      [id, ...keys.map((k) => patch[k])],
    );
    return rows[0] ? toEvent(rows[0]) : null;
  }
}
