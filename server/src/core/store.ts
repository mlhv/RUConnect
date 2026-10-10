import { randomUUID } from 'node:crypto';
import type { Building, CampusEvent, EventInput, EventPatch, EventQuery } from '@ruconnect/shared';

export interface Store {
  listBuildings(): Promise<Building[]>;
  /** Events overlapping [from, to], sorted by start. Omitted filters match everything. */
  listEvents(q: Partial<EventQuery>): Promise<CampusEvent[]>;
  getEvent(id: string): Promise<CampusEvent | null>;
  createEvent(input: EventInput): Promise<CampusEvent>;
  updateEvent(id: string, patch: EventPatch): Promise<CampusEvent | null>;
}

/** In-memory store used when MOCK=1. Data resets on restart. */
export class MemoryStore implements Store {
  private events: CampusEvent[];

  constructor(private readonly buildings: Building[], events: CampusEvent[]) {
    this.events = [...events];
  }

  async listBuildings(): Promise<Building[]> {
    return this.buildings;
  }

  async listEvents(q: Partial<EventQuery>): Promise<CampusEvent[]> {
    const from = q.from ? Date.parse(q.from) : -Infinity;
    const to = q.to ? Date.parse(q.to) : Infinity;
    return this.events
      .filter(
        (e) =>
          (!q.status || e.status === q.status) &&
          (!q.buildingId || e.buildingId === q.buildingId) &&
          Date.parse(e.start) < to &&
          Date.parse(e.end) > from,
      )
      .sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
  }

  async getEvent(id: string): Promise<CampusEvent | null> {
    return this.events.find((e) => e.id === id) ?? null;
  }

  async createEvent(input: EventInput): Promise<CampusEvent> {
    const event: CampusEvent = { ...input, id: randomUUID(), createdAt: new Date().toISOString() };
    this.events.push(event);
    return event;
  }

  async updateEvent(id: string, patch: EventPatch): Promise<CampusEvent | null> {
    const i = this.events.findIndex((e) => e.id === id);
    if (i === -1) return null;
    this.events[i] = { ...this.events[i], ...patch };
    return this.events[i];
  }
}
