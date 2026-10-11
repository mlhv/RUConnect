import type { Building } from '@ruconnect/shared';

const norm = (s: string): string =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().replace(/^the /, '');
const pad = (s: string): string => ` ${s} `;
const labels = (b: Building): string[] => [b.name, ...b.aliases].map(norm).filter(Boolean);

/** Resolves a spoken building name. Exact match first, then partial, then a name inside a longer phrase. */
export function resolveBuilding(name: string, buildings: Building[]): Building | null {
  const input = norm(name);
  if (!input) return null;
  const stages: ((label: string) => boolean)[] = [
    (label) => label === input,
    (label) => pad(label).includes(pad(input)),
    (label) => pad(input).includes(pad(label)),
  ];
  for (const stage of stages) {
    const hits = buildings.filter((b) => labels(b).some(stage));
    if (hits.length) return [...hits].sort((a, b) => a.name.length - b.name.length)[0];
  }
  return null;
}

/** Name words too generic to identify one building in a free-form sentence. */
const COMMON = new Set(['rutgers', 'college', 'avenue', 'hall', 'center', 'student', 'building', 'art']);

/** Finds the first building a free-form sentence mentions, for the text fallback. */
export function findMentionedBuilding(sentence: string, buildings: Building[]): Building | null {
  const text = pad(norm(sentence));
  const nameWords = buildings.map((b) => norm(b.name).split(' '));
  let best: { building: Building; at: number } | null = null;
  buildings.forEach((building, i) => {
    const distinctive = nameWords[i].filter(
      (w) => w.length >= 3 && !COMMON.has(w) && !nameWords.some((other, j) => j !== i && other.includes(w)),
    );
    for (const label of [...labels(building), ...distinctive]) {
      if (label.length < 3) continue;
      const at = text.indexOf(pad(label));
      if (at >= 0 && (!best || at < best.at)) best = { building, at };
    }
  });
  return (best as { building: Building } | null)?.building ?? null;
}
