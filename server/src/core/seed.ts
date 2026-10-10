import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseSeedBuildings, parseSeedEvents, type Building, type CampusEvent } from '@ruconnect/shared';
import { REPO_ROOT } from './config';

export function loadSeed(): { buildings: Building[]; events: CampusEvent[] } {
  const read = (name: string): unknown => JSON.parse(readFileSync(resolve(REPO_ROOT, 'data', name), 'utf8'));
  return {
    buildings: parseSeedBuildings(read('buildings.json')),
    events: parseSeedEvents(read('events.seed.json')),
  };
}
