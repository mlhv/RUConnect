import type { Building } from '@ruconnect/shared';
import type { Hit, SearchResponse } from './searchApi';

const fmt = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York',
  weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  hour: 'numeric', minute: '2-digit', timeZoneName: 'longOffset',
});

function parts(iso: string): Record<string, string> {
  return Object.fromEntries(fmt.formatToParts(new Date(iso)).map((p) => [p.type, p.value]));
}

/** "2:00 PM", in Eastern time. */
export function formatTime(iso: string): string {
  const p = parts(iso);
  return `${p.hour}:${p.minute} ${p.dayPeriod}`;
}

const shortDay = (iso: string): string => parts(iso).weekday.slice(0, 3);

/** "Saturday, October 10, 2026, 1:30 PM, UTC offset -04:00". Sent to the agent as its current time. */
export function formatClock(iso: string): string {
  const p = parts(iso);
  return `${p.weekday}, ${p.month} ${p.day}, ${p.year}, ${formatTime(iso)}, UTC offset ${p.timeZoneName.replace('GMT', '')}`;
}

function sameDay(a: string, b: string): boolean {
  const pa = parts(a);
  const pb = parts(b);
  return pa.year === pb.year && pa.month === pb.month && pa.day === pb.day;
}

function when(hit: Hit, now: string): string {
  const { start, end } = hit.event;
  return `${sameDay(start, now) ? '' : `${shortDay(start)} `}${formatTime(start)} to ${formatTime(end)}`;
}

const buildingName = (id: string, buildings: Building[]): string => buildings.find((b) => b.id === id)?.name ?? id;

export interface FormatContext {
  now: string;
  to?: string;
  near: Building | null;
  /** What the agent asked for when it matched no building. */
  unresolvedNear: string | null;
  buildings: Building[];
}

/** Flyer text is untrusted: collapse it to one line so it cannot forge list entries, and cap its length. */
function clean(text: string, max?: number): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  return max === undefined ? flat : flat.slice(0, max);
}

function describeHit(hit: Hit, ctx: FormatContext, inWindow: boolean): string {
  const e = hit.event;
  const bits = [
    `[id ${e.id}] ${clean(e.title, 120)}.`,
    `${buildingName(e.buildingId, ctx.buildings)}${e.room ? `, room ${clean(e.room)}` : ''}, ${when(hit, ctx.now)}.`,
  ];
  if (e.freeFood) bits.push('Free food.');
  if (hit.distanceM !== null && ctx.near) bits.push(`${hit.distanceM} m from ${ctx.near.name}.`);
  if (inWindow && hit.endsAfterWindow) bits.push('Runs past the window.');
  const description = e.description ? clean(e.description, 140) : '';
  if (description) bits.push(description);
  return bits.join(' ');
}

/** The text a tool returns for the agent to speak from. Times are Eastern and human-readable. */
export function formatResults(res: SearchResponse, ctx: FormatContext): string {
  let header = `Now ${shortDay(ctx.now)} ${formatTime(ctx.now)}.`;
  if (ctx.to) header += ` Window: until ${sameDay(ctx.to, ctx.now) ? '' : `${shortDay(ctx.to)} `}${formatTime(ctx.to)}.`;
  if (ctx.near) header += ` Near: ${ctx.near.name}.`;
  if (ctx.unresolvedNear) {
    header += ` I do not know a building called "${ctx.unresolvedNear}", so this covers the whole campus.`;
  }

  const lines = [header];
  if (res.matches.length) {
    lines.push(`${res.matches.length} ${res.matches.length === 1 ? 'match' : 'matches'}, best first:`);
    res.matches.forEach((h, i) => lines.push(`${i + 1}. ${describeHit(h, ctx, true)}`));
  } else {
    lines.push('No events match in that window.');
  }
  if (res.later.length) {
    lines.push('Later, outside the window:');
    res.later.forEach((h) => lines.push(`- ${describeHit(h, ctx, false)}`));
  } else if (!res.matches.length) {
    lines.push('Nothing later either. Suggest a wider time window or different interests.');
  }
  return lines.join('\n');
}

/** One sentence for the text fallback to read aloud. */
export function speakHit(hit: Hit, buildings: Building[], now: string): string {
  const e = hit.event;
  return `${e.title} at ${buildingName(e.buildingId, buildings)}, ${when(hit, now)}${e.freeFood ? ', with free food' : ''}.`;
}
