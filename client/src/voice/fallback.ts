import type { Building } from '@ruconnect/shared';
import { speakHit } from './formatResults';
import { findMentionedBuilding } from './resolveBuilding';
import type { Tools } from './tools';

export interface FallbackDeps {
  tools: Tools;
  getBuildings(): Building[];
  now(): string;
  speak(text: string): void;
}

/**
 * The path used when the agent is unavailable. It recognises a building and "free food";
 * it does not understand times, so the search covers the default window.
 */
export async function runFallback(sentence: string, deps: FallbackDeps): Promise<string> {
  const query = sentence.trim();
  if (!query) return '';
  const buildings = deps.getBuildings();
  const near = findMentionedBuilding(query, buildings);

  await deps.tools.findEvents({
    query: query.slice(0, 200), // the server rejects a longer query
    freeFood: /\bfree food\b/i.test(query) ? 'prefer' : undefined,
    nearBuildingName: near?.name,
  });

  const top = deps.tools.lastMatches()[0];
  let said = 'I could not find anything like that right now. Try different interests.';
  if (deps.tools.lastSearchFailed()) {
    said = 'Search is unavailable right now. Try again in a moment.';
  } else if (top) {
    await deps.tools.focusEvent({ eventId: top.event.id });
    said = speakHit(top, buildings, deps.now());
    if (!top.matchesQuery) said = `Nothing matches that exactly. The top pick coming up is ${said}`;
  }
  deps.speak(said);
  return said;
}
