import type { Building, CampusEvent, MapController } from '@ruconnect/shared';
import { formatResults, formatTime } from './formatResults';
import { resolveBuilding } from './resolveBuilding';
import { SearchError, type Hit, type SearchRequest, type SearchResponse } from './searchApi';
import { FindEventsArgsSchema, FocusEventArgsSchema } from './toolSchemas';

export interface ToolDeps {
  search(req: SearchRequest): Promise<SearchResponse>;
  map: MapController;
  getBuildings(): Building[];
  getEvents(): CampusEvent[];
  /** The instant the app treats as now, as an ISO string. */
  now(): string;
}

export interface Tools {
  findEvents(args: unknown): Promise<string>;
  focusEvent(args: unknown): Promise<string>;
  /** Matches of the most recent search, best first. Empty after a failed search. */
  lastMatches(): Hit[];
  /** True when the most recent search could not run or did not return: bad arguments, a failed call, or a thrown dependency. */
  lastSearchFailed(): boolean;
}

const shortDay = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'short' });
const notBefore = (iso: string, now: string): string =>
  new Date(Math.max(Date.parse(iso), Date.parse(now))).toISOString();

/** The agent's two client tools. They return text for the agent and never throw. */
export function createTools(deps: ToolDeps): Tools {
  let matches: Hit[] = [];
  let remembered: Hit[] = [];
  let searchFailed = false;

  async function findEventsInner(args: unknown): Promise<string> {
    matches = [];
    const now = deps.now();
    const parsed = FindEventsArgsSchema.safeParse(args ?? {});
    if (!parsed.success) {
      searchFailed = true;
      const fields = parsed.error.issues.map((i) => i.path.join('.')).join(', ');
      return `Invalid arguments: ${fields}. Times must be ISO 8601 with a UTC offset, like 2026-10-10T16:00:00-04:00. freeFood is "prefer" or "require".`;
    }
    const { nearBuildingName, ...rest } = parsed.data;
    const buildings = deps.getBuildings();
    const near = nearBuildingName ? resolveBuilding(nearBuildingName, buildings) : null;

    const request: SearchRequest = { ...rest };
    if (near) request.nearBuildingId = near.id;
    let res: SearchResponse;
    try {
      res = await deps.search(request);
    } catch (err) {
      searchFailed = true;
      const code = err instanceof SearchError ? err.code : 'unknown';
      if (code === 'invalid_window') {
        return `That time window is already over. The current time is ${shortDay.format(new Date(now))} ${formatTime(now)}. Ask the student for a later time.`;
      }
      return `The event search failed (${code}). Tell the student that search is unavailable right now.`;
    }

    matches = res.matches;
    remembered = [...res.matches, ...res.later];
    searchFailed = false;
    try {
      if (matches.length) {
        deps.map.highlight([...new Set(matches.map((h) => h.event.buildingId))]);
        const earliest = matches.reduce((a, h) => (Date.parse(h.event.start) < Date.parse(a) ? h.event.start : a), matches[0].event.start);
        deps.map.setTime(notBefore(earliest, now));
      } else {
        deps.map.clearHighlight();
      }
    } catch {
      // A map failure must not hide the results: the agent still gets the list.
    }
    return formatResults(res, {
      now, from: parsed.data.from, to: parsed.data.to, near, unresolvedNear: nearBuildingName && !near ? nearBuildingName : null, buildings,
    });
  }

  async function focusEventInner(args: unknown): Promise<string> {
    const parsed = FocusEventArgsSchema.safeParse(args ?? {});
    const id = parsed.success ? parsed.data.eventId : null;
    const event = remembered.find((h) => h.event.id === id)?.event ?? deps.getEvents().find((e) => e.id === id);
    if (!event) return 'No event with that id. Call find_events first.';
    deps.map.flyTo(event.buildingId);
    deps.map.openBuilding(event.buildingId);
    deps.map.setTime(notBefore(event.start, deps.now()));
    const name = deps.getBuildings().find((b) => b.id === event.buildingId)?.name ?? event.buildingId;
    return `The map is now showing ${name}.`;
  }

  // The public tools never reject: any failure in a dependency becomes a sentence for the agent.
  async function findEvents(args: unknown): Promise<string> {
    try {
      return await findEventsInner(args);
    } catch {
      matches = [];
      searchFailed = true;
      return 'The event search failed (unknown). Tell the student that search is unavailable right now.';
    }
  }

  async function focusEvent(args: unknown): Promise<string> {
    try {
      return await focusEventInner(args);
    } catch {
      return 'The map could not be moved. Tell the student to try again.';
    }
  }

  return { findEvents, focusEvent, lastMatches: () => matches, lastSearchFailed: () => searchFailed };
}
