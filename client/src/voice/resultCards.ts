import type { Building } from '@ruconnect/shared';
import { when } from './formatResults';
import type { Hit } from './searchApi';

export const MAX_CARDS = 3;
const MAX_TITLE = 80;

/** What the panel shows for one search result. */
export interface ResultCard {
  id: string;
  title: string;
  place: string;
  when: string;
  freeFood: boolean;
  /** The database found it by meaning alone: no word of the question appears in its text. */
  semantic: boolean;
}

/** Flyer text is untrusted: one line, capped. */
const flat = (text: string, max?: number): string => text.replace(/\s+/g, ' ').trim().slice(0, max);

/** The best few hits of a search, ready to draw. Times are Eastern. */
export function resultCards(hits: Hit[], buildings: Building[], now: string): ResultCard[] {
  return hits.slice(0, MAX_CARDS).map((hit) => {
    const e = hit.event;
    const building = buildings.find((b) => b.id === e.buildingId)?.name ?? e.buildingId;
    return {
      id: e.id,
      title: flat(e.title, MAX_TITLE),
      place: `${building}${e.room ? `, room ${flat(e.room, 30)}` : ''}`,
      when: when(hit, now),
      freeFood: e.freeFood,
      semantic: hit.semantic,
    };
  });
}
