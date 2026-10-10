# RUConnect Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A runnable, tested skeleton of RUConnect (contracts, storage, HTTP API, map shell, agent rules, CI) that three people's Claude Code agents can build on in parallel without editing each other's files.

**Architecture:** One npm-workspaces TypeScript repo with `shared/` (zod contracts), `server/` (Express, in-memory store for `MOCK=1`, Postgres store for Tiger), and `client/` (React, Vite, Mapbox GL JS). Slices plug in through stub routers and stub components that the core mounts, so slice owners never need to touch core files.

**Tech Stack:** Node 22+, TypeScript, npm workspaces, zod 4, Express 5, `pg`, vitest, supertest, React, Vite, mapbox-gl, zustand, tsx.

**Spec:** `docs/superpowers/specs/2026-10-10-campus-events-design.md`

**Scope:** This plan covers spec sections 2, 3, 4 (buildings and events routes only), 6 (shell, extrusions, basic slider, controller), 8, and 9. It does not implement the swarm, search, activity endpoint, voice, glow polish, or deployment. Those belong to per-slice plans (`docs/superpowers/plans/2026-10-10-slice-<map|ingest|voice>.md`) that each owner writes from the spec once this merges. The first slice-B task is the spec's vertical slice (one flyer, Reader and Verifier, building glows).

## Global Constraints

- Node 22 or newer. All packages are ESM (`"type": "module"`). Imports are extensionless.
- zod major version 4.
- Ports: server 3001, client 5173.
- `DB_SCHEMA` must match `^[a-z_][a-z0-9_]{0,62}$`. Production uses `prod`.
- Migration filenames: `YYYYMMDDHHMM_description.sql`.
- Embedding column is `vector(768)`.
- Only `VITE_MAPBOX_TOKEN` may reach the browser. No other key is read in `client/`.
- Nothing outside `client/src/map/` imports `mapbox-gl`.
- All work happens on branch `minh/foundation`; `main` receives it by pull request.
- Never commit `.env`.

## Review Focus

1. `DB_SCHEMA` containing quotes, spaces, or uppercase is interpolated into SQL: config must reject it at startup. (Task 3)
2. `npm run db:reset` with `DB_SCHEMA=prod`: must refuse and drop nothing. (Task 3)
3. An event whose end is not after its start, on create or as the result of a PATCH that changes only one of the two fields: must return 400, never be stored. (Tasks 2, 4)
4. Times with mixed UTC offsets (`-04:00` seeds, `Z` from Postgres) and the boundary instant: an event is active at its start and inactive at its end. (Task 2)
5. API unreachable when the client loads: the map must still show the bundled seed buildings and events. A missing Mapbox token must show a message, not a blank page or a thrown error. (Task 5)

---

### Task 1: Workspace, tooling, and agent rules

**Files:**
- Create: `package.json`, `tsconfig.json`, `vitest.config.ts`, `.env.example`
- Create: `shared/package.json`, `shared/src/index.ts`, `server/package.json`, `client/package.json`
- Create: `.githooks/pre-push`, `.github/workflows/ci.yml`, `.claude/settings.json`, `CLAUDE.md`

**Interfaces:**
- Consumes: nothing.
- Produces: root scripts `npm run dev | build | start | typecheck | test | db:setup | db:migrate | db:seed | db:reset`; workspace package name `@ruconnect/shared`.

- [ ] **Step 1: Create the branch**

```bash
git switch -c minh/foundation
```

- [ ] **Step 2: Write the root `package.json`**

```json
{
  "name": "ruconnect",
  "private": true,
  "type": "module",
  "engines": { "node": ">=22" },
  "workspaces": ["shared", "server", "client"],
  "scripts": {
    "prepare": "git config core.hooksPath .githooks || true",
    "dev": "concurrently -n server,client -c blue,green \"npm run dev -w server\" \"npm run dev -w client\"",
    "build": "npm run build -w client",
    "start": "npm run start -w server",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "db:setup": "npm run db:setup -w server",
    "db:migrate": "npm run db:migrate -w server",
    "db:seed": "npm run db:seed -w server",
    "db:reset": "npm run db:reset -w server"
  }
}
```

- [ ] **Step 3: Write the workspace `package.json` files**

`shared/package.json`:

```json
{
  "name": "@ruconnect/shared",
  "private": true,
  "type": "module",
  "exports": { ".": "./src/index.ts" }
}
```

`server/package.json`:

```json
{
  "name": "@ruconnect/server",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "start": "tsx src/index.ts",
    "db:setup": "tsx src/core/db/cli.ts setup",
    "db:migrate": "tsx src/core/db/cli.ts migrate",
    "db:seed": "tsx src/core/db/cli.ts seed",
    "db:reset": "tsx src/core/db/cli.ts reset"
  },
  "dependencies": { "@ruconnect/shared": "*" }
}
```

`client/package.json`:

```json
{
  "name": "@ruconnect/client",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build"
  },
  "dependencies": { "@ruconnect/shared": "*" }
}
```

`shared/src/index.ts`:

```ts
export {};
```

- [ ] **Step 4: Install every dependency the project will need**

Installing slice dependencies now keeps `package-lock.json` stable while three people work.

```bash
npm install -D typescript vitest concurrently @types/node
npm install -w shared zod@^4
npm install -w server express pg zod@^4 tsx multer p-limit @google/genai
npm install -w server -D @types/express @types/pg @types/multer supertest @types/supertest
npm install -w client react react-dom mapbox-gl zustand zod@^4 @elevenlabs/react
npm install -w client -D vite @vitejs/plugin-react @types/react @types/react-dom
```

Expected: each command exits 0 and `node_modules/@ruconnect/shared` is a symlink to `shared/`.

- [ ] **Step 5: Write `tsconfig.json` and `vitest.config.ts`**

`tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2023", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "jsx": "react-jsx",
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "esModuleInterop": true,
    "isolatedModules": true,
    "types": ["node", "vite/client"]
  },
  "include": ["shared/src", "server/src", "client/src", "client/vite.config.ts", "vitest.config.ts"]
}
```

`vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['shared/src/**/*.test.ts', 'server/src/**/*.test.ts', 'client/src/**/*.test.ts'],
    passWithNoTests: true,
  },
});
```

- [ ] **Step 6: Write `.env.example`**

```
# Copy to .env. Never commit .env.
MOCK=1                      # 1 = in-memory seed data, no database or API keys needed. Set 0 after db:setup.
DB_SCHEMA=dev_yourname      # unique per person, lowercase letters, digits, underscores. Production uses "prod".
DATABASE_URL=               # shared Tiger service connection string
GEMINI_API_KEY=
GEMINI_VISION_MODEL=        # chosen by the ingest slice
GEMINI_EMBED_MODEL=         # must output 768 dimensions
ELEVENLABS_API_KEY=
ELEVENLABS_AGENT_ID=
VITE_MAPBOX_TOKEN=          # public token (pk.*); the only value sent to the browser
SWARM_CONCURRENCY=4
DEMO_NOW=                   # optional ISO time the app treats as "now", e.g. 2026-10-10T19:30:00-04:00
PORT=3001
```

- [ ] **Step 7: Write the pre-push hook and make it executable**

`.githooks/pre-push`:

```sh
#!/bin/sh
# Blocks direct pushes to main. Merge through a pull request instead.
while read local_ref local_sha remote_ref remote_sha; do
  if [ "$remote_ref" = "refs/heads/main" ] && [ "$ALLOW_MAIN_PUSH" != "1" ]; then
    echo "Direct pushes to main are blocked. Push a branch and open a pull request." >&2
    exit 1
  fi
done
exit 0
```

```bash
chmod +x .githooks/pre-push
npm run prepare
```

- [ ] **Step 8: Verify the hook blocks main and allows branches**

```bash
printf 'refs/heads/x 1 refs/heads/main 2\n' | .githooks/pre-push; echo "main exit=$?"
printf 'refs/heads/x 1 refs/heads/minh/x 2\n' | .githooks/pre-push; echo "branch exit=$?"
git config core.hooksPath
```

Expected: `main exit=1` with the blocked message, `branch exit=0`, and `.githooks`.

- [ ] **Step 9: Write `.github/workflows/ci.yml`**

```yaml
name: CI
on:
  pull_request:
  push:
    branches: [main]
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm run typecheck
      - run: npm test
```

- [ ] **Step 10: Write `.claude/settings.json`**

```json
{
  "permissions": {
    "allow": [
      "Bash(npm run *)",
      "Bash(npm test*)",
      "Bash(npm install)",
      "Bash(npx vitest *)",
      "Bash(git status*)",
      "Bash(git diff*)",
      "Bash(git log*)",
      "Bash(git add *)",
      "Bash(git commit *)",
      "Bash(git switch *)",
      "Bash(git fetch*)",
      "Bash(git rebase origin/main)",
      "Bash(gh pr *)"
    ],
    "deny": [
      "Bash(git push origin main*)",
      "Bash(git push --force*)",
      "Read(./.env)"
    ]
  }
}
```

- [ ] **Step 11: Write the root `CLAUDE.md`**

```markdown
# RUConnect

3D map of Rutgers College Ave events. Three people work in this repo at once, each with their own agent. These rules keep that work from colliding. Design: `docs/superpowers/specs/2026-10-10-campus-events-design.md`.

## Commands

- `npm run dev`: server on 3001, client on 5173
- `npm test`: all tests. `npx vitest run <path>`: one file
- `npm run typecheck`
- `npm run db:setup`: create your schema, migrate, seed. `npm run db:reset`: rebuild your own schema

## Ownership

| Slice | Folders | Rules file |
|---|---|---|
| A: Map | `client/src/map/` | `client/src/map/CLAUDE.md` |
| B: Ingest | `server/src/ingest/`, `client/src/ingest/`, `data/captures/` | `server/src/ingest/CLAUDE.md` |
| C: Voice | `server/src/voice/`, `client/src/voice/` | `server/src/voice/CLAUDE.md` |

Ask the person you are working for which slice they own right now if they have not said. Ownership rotates.

Frozen: `shared/`, `server/src/core/`, `client/src/app/`, existing files in `server/migrations/`, and root config (`package.json`, `tsconfig.json`, `vitest.config.ts`, `.github/`, `.githooks/`, `.claude/`, this file).

## Rules

1. Edit only inside the slice your person currently owns.
2. Frozen areas change only in a separate pull request whose title starts with `contract:`, opened after all three people agree in team chat. If a task seems to need a frozen change, stop and tell your person.
3. Never push to `main`. Work on `<name>/<topic>`, open a pull request with `gh pr create`, merge when CI is green. Rebase on `origin/main` before opening and about once an hour.
4. Reach other slices only through `@ruconnect/shared` types, the HTTP API, and `client/src/app/` stores. Never import from another slice's folder.
5. Use your own `DB_SCHEMA`. Never run `db:reset` against `prod`.
6. A new migration for your own slice's tables is allowed: name it with the current time, `YYYYMMDDHHMM_description.sql`. Never edit a merged migration or alter a core table (`buildings`, `events`) outside a `contract:` pull request.
7. Do not add dependencies without your person announcing it in team chat. If `package-lock.json` conflicts, take `main`'s version and run `npm install`.
8. Develop with `MOCK=1` until the slice you depend on has merged.
9. Handoff notes go in `docs/handoff/<slice>.md`, not in `README.md`.
10. Never read, print, or commit `.env`.

## Conventions

- TypeScript, ESM, extensionless imports.
- Validate every external input (HTTP bodies, model output, files) with a zod schema from `shared/`.
- Tests sit next to the code as `*.test.ts` and run under vitest.
```

- [ ] **Step 12: Verify the toolchain**

```bash
npm run typecheck && npm test
```

Expected: typecheck exits 0; vitest reports no test files and exits 0.

- [ ] **Step 13: Commit**

```bash
git add -A
git commit -m "chore: workspace, tooling, CI, and agent rules"
```

---

### Task 2: Shared contracts and seed data

**Files:**
- Create: `shared/src/schemas.ts`, `shared/src/time.ts`, `shared/src/geo.ts`, `shared/src/seed.ts`, `shared/src/api.ts`, `shared/src/swarm.ts`, `shared/src/mapController.ts`
- Modify: `shared/src/index.ts`
- Create: `data/buildings.json`, `data/events.seed.json`, `data/extraction.cache.json`, `data/captures/instagram/.gitkeep`, `data/captures/board/.gitkeep`
- Test: `shared/src/schemas.test.ts`, `shared/src/time.test.ts`, `shared/src/seed.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces, all exported from `@ruconnect/shared`:
  - Schemas and types: `CategorySchema`, `EventSourceSchema`, `EventStatusSchema`, `CampusEventSchema`/`CampusEvent`, `EventInputSchema`/`EventInput`, `EventPatchSchema`/`EventPatch`, `BuildingSchema`/`Building`, `BuildingSeedSchema`, `EventQuerySchema`/`EventQuery`, `AppConfigSchema`/`AppConfig`, `SwarmStepSchema`/`SwarmStep`, `IsoDateTime`
  - `isActiveAt(event: Pick<CampusEvent, 'start' | 'end'>, iso: string): boolean`
  - `activeBuildingIds(events: CampusEvent[], iso: string): Set<string>`
  - `rectFootprint(lng: number, lat: number, widthM: number, depthM: number): [number, number][]`
  - `parseSeedBuildings(raw: unknown): Building[]`
  - `parseSeedEvents(raw: unknown, createdAt?: string): CampusEvent[]`
  - `interface MapController { flyTo(buildingId: string): void; highlight(buildingIds: string[]): void; clearHighlight(): void; setTime(iso: string): void }`

- [ ] **Step 1: Write the failing schema and time tests**

`shared/src/schemas.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { EventInputSchema, EventPatchSchema } from './index';

const base = {
  title: 'Robotics Info Session',
  category: 'club',
  buildingId: 'scott-hall',
  start: '2026-10-10T19:00:00-04:00',
  end: '2026-10-10T20:30:00-04:00',
};

describe('EventInputSchema', () => {
  it('fills defaults for optional fields', () => {
    const e = EventInputSchema.parse(base);
    expect(e).toMatchObject({
      description: '', room: null, expectedAttendance: null, tags: [],
      freeFood: false, source: 'manual', status: 'published', confidence: 1,
    });
  });

  it('rejects an end that is not after the start', () => {
    expect(EventInputSchema.safeParse({ ...base, end: base.start }).success).toBe(false);
    expect(EventInputSchema.safeParse({ ...base, end: '2026-10-10T18:00:00-04:00' }).success).toBe(false);
  });

  it('compares instants, not strings, across offsets', () => {
    // 23:30Z is 19:30 in -04:00, which is after the 19:00-04:00 start
    expect(EventInputSchema.safeParse({ ...base, end: '2026-10-10T23:30:00Z' }).success).toBe(true);
  });

  it('rejects a datetime without an offset and an unknown category', () => {
    expect(EventInputSchema.safeParse({ ...base, start: '2026-10-10T19:00:00' }).success).toBe(false);
    expect(EventInputSchema.safeParse({ ...base, category: 'party' }).success).toBe(false);
  });
});

describe('EventPatchSchema', () => {
  it('keeps only the fields that were sent', () => {
    expect(EventPatchSchema.parse({ status: 'published' })).toEqual({ status: 'published' });
  });
});
```

`shared/src/time.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { activeBuildingIds, isActiveAt, type CampusEvent } from './index';

const ev = { start: '2026-10-10T19:00:00-04:00', end: '2026-10-10T20:00:00-04:00' };

describe('isActiveAt', () => {
  it('is active at the start instant and inactive at the end instant', () => {
    expect(isActiveAt(ev, '2026-10-10T19:00:00-04:00')).toBe(true);
    expect(isActiveAt(ev, '2026-10-10T19:59:59-04:00')).toBe(true);
    expect(isActiveAt(ev, '2026-10-10T20:00:00-04:00')).toBe(false);
    expect(isActiveAt(ev, '2026-10-10T18:59:59-04:00')).toBe(false);
  });

  it('treats Z and offset times as the same instant', () => {
    expect(isActiveAt(ev, '2026-10-10T23:30:00Z')).toBe(true);
  });
});

describe('activeBuildingIds', () => {
  it('returns buildings with a published event at that time', () => {
    const mk = (buildingId: string, status: 'published' | 'needs_review') =>
      ({ ...ev, buildingId, status }) as CampusEvent;
    const ids = activeBuildingIds([mk('a', 'published'), mk('b', 'needs_review')], '2026-10-10T19:30:00-04:00');
    expect([...ids]).toEqual(['a']);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run shared`
Expected: FAIL, the imported names are not exported from `./index`.

- [ ] **Step 3: Write the schemas**

`shared/src/schemas.ts`:

```ts
import { z } from 'zod';

export const IsoDateTime = z.iso.datetime({ offset: true });

export const CategorySchema = z.enum(['academic', 'social', 'career', 'sports', 'arts', 'club', 'food', 'other']);
export const EventSourceSchema = z.enum(['flyer', 'instagram', 'board', 'manual', 'seed']);
export const EventStatusSchema = z.enum(['published', 'needs_review']);

const fields = {
  title: z.string().min(1),
  description: z.string(),
  category: CategorySchema,
  buildingId: z.string().min(1),
  room: z.string().nullable(),
  start: IsoDateTime,
  end: IsoDateTime,
  expectedAttendance: z.number().int().nonnegative().nullable(),
  tags: z.array(z.string()),
  freeFood: z.boolean(),
  source: EventSourceSchema,
  status: EventStatusSchema,
  confidence: z.number().min(0).max(1),
};

const inputFields = {
  ...fields,
  description: fields.description.default(''),
  room: fields.room.default(null),
  expectedAttendance: fields.expectedAttendance.default(null),
  tags: fields.tags.default([]),
  freeFood: fields.freeFood.default(false),
  source: fields.source.default('manual'),
  status: fields.status.default('published'),
  confidence: fields.confidence.default(1),
};

const endAfterStart = (e: { start: string; end: string }) => Date.parse(e.end) > Date.parse(e.start);
const endAfterStartIssue = { message: 'end must be after start', path: ['end'] };

/** An event as stored and returned by the API. */
export const CampusEventSchema = z
  .object({ id: z.string().min(1), ...fields, createdAt: IsoDateTime })
  .refine(endAfterStart, endAfterStartIssue);
export type CampusEvent = z.infer<typeof CampusEventSchema>;

/** Body of POST /api/events. Optional fields take defaults. */
export const EventInputSchema = z.object(inputFields).refine(endAfterStart, endAfterStartIssue);
export type EventInput = z.infer<typeof EventInputSchema>;

/** Body of PATCH /api/events/:id. Only sent fields are present. */
export const EventPatchSchema = z.object(fields).partial();
export type EventPatch = z.infer<typeof EventPatchSchema>;

/** One entry of data/events.seed.json. */
export const SeedEventSchema = z
  .object({ id: z.string().min(1), ...inputFields })
  .refine(endAfterStart, endAfterStartIssue);

const Ring = z.array(z.tuple([z.number(), z.number()])).min(4);

export const BuildingSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  aliases: z.array(z.string()),
  lng: z.number(),
  lat: z.number(),
  footprint: Ring,
  heightM: z.number().positive(),
});
export type Building = z.infer<typeof BuildingSchema>;

/** One entry of data/buildings.json. A missing footprint becomes a widthM x depthM rectangle. */
export const BuildingSeedSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  aliases: z.array(z.string()).default([]),
  lng: z.number(),
  lat: z.number(),
  heightM: z.number().positive().default(15),
  widthM: z.number().positive().default(40),
  depthM: z.number().positive().default(30),
  footprint: Ring.optional(),
});
```

- [ ] **Step 4: Write the helpers and remaining contracts**

`shared/src/time.ts`:

```ts
import type { CampusEvent } from './schemas';

/** Active from the start instant up to, but not including, the end instant. */
export function isActiveAt(event: Pick<CampusEvent, 'start' | 'end'>, iso: string): boolean {
  const t = Date.parse(iso);
  return Date.parse(event.start) <= t && t < Date.parse(event.end);
}

export function activeBuildingIds(events: CampusEvent[], iso: string): Set<string> {
  const ids = new Set<string>();
  for (const e of events) {
    if (e.status === 'published' && isActiveAt(e, iso)) ids.add(e.buildingId);
  }
  return ids;
}
```

`shared/src/geo.ts`:

```ts
const METERS_PER_DEG_LAT = 111_320;

/** Closed ring of [lng, lat] points for an axis-aligned rectangle centered on a point. */
export function rectFootprint(lng: number, lat: number, widthM: number, depthM: number): [number, number][] {
  const dLat = depthM / 2 / METERS_PER_DEG_LAT;
  const dLng = widthM / 2 / (METERS_PER_DEG_LAT * Math.cos((lat * Math.PI) / 180));
  return [
    [lng - dLng, lat - dLat],
    [lng + dLng, lat - dLat],
    [lng + dLng, lat + dLat],
    [lng - dLng, lat + dLat],
    [lng - dLng, lat - dLat],
  ];
}
```

`shared/src/seed.ts`:

```ts
import { z } from 'zod';
import { rectFootprint } from './geo';
import { BuildingSeedSchema, SeedEventSchema, type Building, type CampusEvent } from './schemas';

export function parseSeedBuildings(raw: unknown): Building[] {
  return z.array(BuildingSeedSchema).parse(raw).map((b) => ({
    id: b.id,
    name: b.name,
    aliases: b.aliases,
    lng: b.lng,
    lat: b.lat,
    heightM: b.heightM,
    footprint: b.footprint ?? rectFootprint(b.lng, b.lat, b.widthM, b.depthM),
  }));
}

export function parseSeedEvents(raw: unknown, createdAt = '2026-10-10T00:00:00.000Z'): CampusEvent[] {
  return z.array(SeedEventSchema).parse(raw).map((e) => ({ ...e, createdAt }));
}
```

`shared/src/api.ts`:

```ts
import { z } from 'zod';
import { EventStatusSchema, IsoDateTime } from './schemas';

/** Query string of GET /api/events. An event matches when it overlaps [from, to]. */
export const EventQuerySchema = z.object({
  from: IsoDateTime.optional(),
  to: IsoDateTime.optional(),
  buildingId: z.string().min(1).optional(),
  status: EventStatusSchema.default('published'),
});
export type EventQuery = z.infer<typeof EventQuerySchema>;

/** Response of GET /api/config. `now` is DEMO_NOW when set. */
export const AppConfigSchema = z.object({ now: IsoDateTime.nullable() });
export type AppConfig = z.infer<typeof AppConfigSchema>;

/** Shape of every non-2xx JSON response. */
export interface ApiError {
  error: string;
  issues?: unknown;
}
```

`shared/src/swarm.ts`:

```ts
import { z } from 'zod';

export const SwarmWorkerSchema = z.enum(['scout', 'reader', 'reconciler', 'locator', 'deduper', 'verifier']);
export const SwarmStateSchema = z.enum(['started', 'finished', 'failed']);

/** One Server-Sent Event on GET /api/ingest/runs/:id/stream. */
export const SwarmStepSchema = z.object({
  runId: z.string(),
  itemId: z.string(),
  worker: SwarmWorkerSchema,
  state: SwarmStateSchema,
  summary: z.string(),
});
export type SwarmStep = z.infer<typeof SwarmStepSchema>;
```

`shared/src/mapController.ts`:

```ts
/** The only way other slices drive the map. Implemented in client/src/map/. */
export interface MapController {
  flyTo(buildingId: string): void;
  highlight(buildingIds: string[]): void;
  clearHighlight(): void;
  setTime(iso: string): void;
}
```

`shared/src/index.ts` (replace contents):

```ts
export * from './schemas';
export * from './time';
export * from './geo';
export * from './seed';
export * from './api';
export * from './swarm';
export * from './mapController';
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run shared`
Expected: PASS, 8 tests.

- [ ] **Step 6: Write the failing seed-data test**

`shared/src/seed.test.ts`:

```ts
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseSeedBuildings, parseSeedEvents } from './index';

const read = (name: string): unknown =>
  JSON.parse(readFileSync(new URL(`../../data/${name}`, import.meta.url), 'utf8'));

describe('seed data', () => {
  const buildings = parseSeedBuildings(read('buildings.json'));
  const events = parseSeedEvents(read('events.seed.json'));

  it('has 12 buildings with unique ids and closed footprints', () => {
    expect(buildings).toHaveLength(12);
    expect(new Set(buildings.map((b) => b.id)).size).toBe(12);
    for (const b of buildings) {
      expect(b.footprint[0]).toEqual(b.footprint[b.footprint.length - 1]);
    }
  });

  it('has at least 10 events with unique ids that reference real buildings', () => {
    expect(events.length).toBeGreaterThanOrEqual(10);
    expect(new Set(events.map((e) => e.id)).size).toBe(events.length);
    const ids = new Set(buildings.map((b) => b.id));
    for (const e of events) expect(ids.has(e.buildingId), `${e.id} -> ${e.buildingId}`).toBe(true);
  });
});
```

Run: `npx vitest run shared/src/seed.test.ts`
Expected: FAIL with ENOENT for `data/buildings.json`.

- [ ] **Step 7: Write the seed data**

The coordinates are approximate and were not checked against a map. The Map slice owner corrects them against the Mapbox basemap and replaces rectangles with real footprints. The events are samples; the team replaces them with 25 or more real ones.

`data/buildings.json`:

```json
[
  { "id": "student-center", "name": "Rutgers Student Center", "aliases": ["RSC", "Student Center", "College Ave Student Center", "126 College Ave"], "lng": -74.4517, "lat": 40.5028, "heightM": 14, "widthM": 70, "depthM": 50 },
  { "id": "alexander-library", "name": "Alexander Library", "aliases": ["Alex", "Alexander", "169 College Ave"], "lng": -74.4527, "lat": 40.5046, "heightM": 20, "widthM": 80, "depthM": 60 },
  { "id": "scott-hall", "name": "Scott Hall", "aliases": ["Scott", "SC", "43 College Ave"], "lng": -74.4478, "lat": 40.4999, "heightM": 14, "widthM": 60, "depthM": 35 },
  { "id": "academic-building", "name": "Academic Building", "aliases": ["AB", "15 Seminary Place"], "lng": -74.4480, "lat": 40.5010, "heightM": 22, "widthM": 90, "depthM": 30 },
  { "id": "college-ave-gym", "name": "College Avenue Gym", "aliases": ["The Barn", "College Ave Gym", "130 College Ave"], "lng": -74.4522, "lat": 40.5034, "heightM": 16, "widthM": 60, "depthM": 45 },
  { "id": "voorhees-hall", "name": "Voorhees Hall", "aliases": ["Voorhees", "VH", "71 Hamilton St"], "lng": -74.4462, "lat": 40.4993, "heightM": 15, "widthM": 50, "depthM": 30 },
  { "id": "zimmerli", "name": "Zimmerli Art Museum", "aliases": ["Zimmerli", "Art Museum"], "lng": -74.4458, "lat": 40.4999, "heightM": 12, "widthM": 60, "depthM": 40 },
  { "id": "the-yard", "name": "The Yard", "aliases": ["Yard", "The Yard @ College Ave", "40 College Ave"], "lng": -74.4484, "lat": 40.5003, "heightM": 25, "widthM": 50, "depthM": 40 },
  { "id": "murray-hall", "name": "Murray Hall", "aliases": ["Murray", "MU", "510 George St"], "lng": -74.4470, "lat": 40.4990, "heightM": 15, "widthM": 45, "depthM": 25 },
  { "id": "brower-commons", "name": "Brower Commons", "aliases": ["Brower", "145 College Ave"], "lng": -74.4513, "lat": 40.5031, "heightM": 12, "widthM": 60, "depthM": 45 },
  { "id": "honors-college", "name": "Honors College", "aliases": ["HC", "Honors"], "lng": -74.4478, "lat": 40.5018, "heightM": 20, "widthM": 70, "depthM": 35 },
  { "id": "kirkpatrick-chapel", "name": "Kirkpatrick Chapel", "aliases": ["Kirkpatrick", "Chapel"], "lng": -74.4455, "lat": 40.4988, "heightM": 18, "widthM": 25, "depthM": 40 }
]
```

`data/events.seed.json`:

```json
[
  { "id": "seed-resume-review", "title": "Resume Review Drop-in", "description": "Bring a printed resume for a 10-minute review.", "category": "career", "buildingId": "academic-building", "room": "1170", "start": "2026-10-10T15:00:00-04:00", "end": "2026-10-10T17:00:00-04:00", "expectedAttendance": 40, "tags": ["resume", "careers"], "source": "seed" },
  { "id": "seed-pickup-basketball", "title": "Pickup Basketball", "description": "Open runs, all skill levels.", "category": "sports", "buildingId": "college-ave-gym", "start": "2026-10-10T17:00:00-04:00", "end": "2026-10-10T19:00:00-04:00", "expectedAttendance": 30, "tags": ["basketball"], "source": "seed" },
  { "id": "seed-art-after-hours", "title": "Art After Hours", "description": "Late gallery hours with live music and snacks.", "category": "arts", "buildingId": "zimmerli", "start": "2026-10-10T17:00:00-04:00", "end": "2026-10-10T21:00:00-04:00", "expectedAttendance": 120, "tags": ["art", "music"], "freeFood": true, "source": "seed" },
  { "id": "seed-study-night", "title": "Midterm Study Night", "description": "Group study tables, tutors, and coffee.", "category": "academic", "buildingId": "alexander-library", "start": "2026-10-10T18:00:00-04:00", "end": "2026-10-10T23:00:00-04:00", "expectedAttendance": 200, "tags": ["study", "tutoring"], "freeFood": true, "source": "seed" },
  { "id": "seed-night-market", "title": "Night Market at The Yard", "description": "Food trucks and student vendors.", "category": "food", "buildingId": "the-yard", "start": "2026-10-10T18:00:00-04:00", "end": "2026-10-10T21:00:00-04:00", "expectedAttendance": 300, "tags": ["food trucks", "vendors"], "source": "seed" },
  { "id": "seed-robotics-info", "title": "Robotics Club Info Session", "description": "Meet the team, see last year's robot, pizza provided.", "category": "club", "buildingId": "scott-hall", "room": "123", "start": "2026-10-10T19:00:00-04:00", "end": "2026-10-10T20:30:00-04:00", "expectedAttendance": 60, "tags": ["robotics", "engineering"], "freeFood": true, "source": "seed" },
  { "id": "seed-film-screening", "title": "International Film Screening", "description": "Subtitled feature followed by discussion.", "category": "arts", "buildingId": "voorhees-hall", "room": "105", "start": "2026-10-10T19:30:00-04:00", "end": "2026-10-10T21:30:00-04:00", "expectedAttendance": 80, "tags": ["film"], "source": "seed" },
  { "id": "seed-open-mic", "title": "Open Mic Night", "description": "Music, poetry, and comedy. Sign up at the door.", "category": "arts", "buildingId": "student-center", "room": "Multipurpose Room", "start": "2026-10-10T20:00:00-04:00", "end": "2026-10-10T22:30:00-04:00", "expectedAttendance": 150, "tags": ["music", "poetry", "comedy"], "source": "seed" },
  { "id": "seed-game-night", "title": "Board Game Night", "description": "Bring a game or borrow one. Snacks provided.", "category": "social", "buildingId": "honors-college", "start": "2026-10-10T21:00:00-04:00", "end": "2026-10-10T23:30:00-04:00", "expectedAttendance": 45, "tags": ["games"], "freeFood": true, "source": "seed" },
  { "id": "seed-brunch-social", "title": "Sunday Brunch Social", "description": "Meet other first-years over brunch.", "category": "social", "buildingId": "brower-commons", "start": "2026-10-11T10:00:00-04:00", "end": "2026-10-11T12:00:00-04:00", "expectedAttendance": 90, "tags": ["first-years"], "freeFood": true, "source": "seed" },
  { "id": "seed-writing-workshop", "title": "Creative Writing Workshop", "description": "Short fiction critique circle.", "category": "academic", "buildingId": "murray-hall", "room": "212", "start": "2026-10-11T11:00:00-04:00", "end": "2026-10-11T12:30:00-04:00", "expectedAttendance": 25, "tags": ["writing"], "source": "seed" },
  { "id": "seed-fall-concert", "title": "Glee Club Fall Concert", "description": "Free admission, doors open 30 minutes early.", "category": "arts", "buildingId": "kirkpatrick-chapel", "start": "2026-10-11T15:00:00-04:00", "end": "2026-10-11T16:30:00-04:00", "expectedAttendance": 180, "tags": ["choir", "concert"], "source": "seed" }
]
```

`data/extraction.cache.json`:

```json
{}
```

```bash
mkdir -p data/captures/instagram data/captures/board
touch data/captures/instagram/.gitkeep data/captures/board/.gitkeep
```

- [ ] **Step 8: Run all shared tests and typecheck**

Run: `npx vitest run shared && npm run typecheck`
Expected: PASS, 10 tests; typecheck exits 0.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: shared contracts and seed data"
```

---

### Task 3: Storage (config, memory store, Postgres store, migrations)

**Files:**
- Create: `server/src/core/config.ts`, `server/src/core/seed.ts`, `server/src/core/store.ts`
- Create: `server/src/core/db/pool.ts`, `server/src/core/db/migrate.ts`, `server/src/core/db/pgStore.ts`, `server/src/core/db/cli.ts`
- Create: `server/migrations/202610101800_init.sql`
- Test: `server/src/core/config.test.ts`, `server/src/core/store.test.ts`, `server/src/core/db/migrate.test.ts`, `server/src/core/db/pgStore.int.test.ts`

**Interfaces:**
- Consumes: `Building`, `CampusEvent`, `EventInput`, `EventPatch`, `EventQuery`, `parseSeedBuildings`, `parseSeedEvents` from `@ruconnect/shared`.
- Produces:
  - `REPO_ROOT: string`, `loadEnvFile(): void`, `loadConfig(env?: NodeJS.ProcessEnv): Config`
  - `interface Config { port: number; mock: boolean; databaseUrl: string | null; dbSchema: string; demoNow: string | null; swarmConcurrency: number; geminiApiKey: string | null; geminiVisionModel: string | null; geminiEmbedModel: string | null; elevenLabsApiKey: string | null; elevenLabsAgentId: string | null }`
  - `loadSeed(): { buildings: Building[]; events: CampusEvent[] }`
  - `interface Store { listBuildings(): Promise<Building[]>; listEvents(q: Partial<EventQuery>): Promise<CampusEvent[]>; getEvent(id: string): Promise<CampusEvent | null>; createEvent(input: EventInput): Promise<CampusEvent>; updateEvent(id: string, patch: EventPatch): Promise<CampusEvent | null> }`
  - `class MemoryStore implements Store` with `constructor(buildings: Building[], events: CampusEvent[])`
  - `createPool(databaseUrl: string, schema: string): pg.Pool`
  - `class PgStore implements Store` with `constructor(pool: pg.Pool)`
  - `listMigrations(dir)`, `pendingMigrations(all, applied)`, `assertResettable(schema)`, `migrate(pool, schema, dir)`, `reset(pool, schema)`, `seedDb(pool, schema, buildings, events)`, `MIGRATIONS_DIR`

- [ ] **Step 1: Write the failing config and memory-store tests**

`server/src/core/config.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { loadConfig } from './config';

describe('loadConfig', () => {
  it('runs in mock mode with no database', () => {
    const c = loadConfig({ MOCK: '1' });
    expect(c).toMatchObject({ mock: true, databaseUrl: null, dbSchema: 'dev_local', port: 3001, swarmConcurrency: 4 });
  });

  it('requires DATABASE_URL when not mocking', () => {
    expect(() => loadConfig({ MOCK: '0' })).toThrow(/DATABASE_URL/);
  });

  it.each(['prod; DROP', 'Dev', 'dev-minh', '"x"', '1abc', 'a b'])('rejects unsafe DB_SCHEMA %j', (s) => {
    expect(() => loadConfig({ MOCK: '1', DB_SCHEMA: s })).toThrow(/DB_SCHEMA/);
  });

  it('rejects a DEMO_NOW that is not a date', () => {
    expect(() => loadConfig({ MOCK: '1', DEMO_NOW: 'tonight' })).toThrow(/DEMO_NOW/);
  });
});
```

`server/src/core/store.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { loadSeed } from './seed';
import { MemoryStore } from './store';

const make = () => {
  const seed = loadSeed();
  return new MemoryStore(seed.buildings, seed.events);
};

const input = {
  title: 'Test', description: '', category: 'other' as const, buildingId: 'scott-hall', room: null,
  start: '2026-10-10T12:00:00-04:00', end: '2026-10-10T13:00:00-04:00', expectedAttendance: null,
  tags: [], freeFood: false, source: 'manual' as const, status: 'needs_review' as const, confidence: 0.5,
};

describe('MemoryStore', () => {
  it('lists events overlapping a window, sorted by start', async () => {
    const events = await make().listEvents({
      from: '2026-10-10T19:00:00-04:00', to: '2026-10-10T19:30:00-04:00', status: 'published',
    });
    const ids = events.map((e) => e.id);
    expect(ids).toContain('seed-robotics-info');
    expect(ids).not.toContain('seed-pickup-basketball'); // ends exactly at 19:00
    expect(ids).not.toContain('seed-film-screening'); // starts exactly at 19:30
    const starts = events.map((e) => Date.parse(e.start));
    expect(starts).toEqual([...starts].sort((a, b) => a - b));
  });

  it('filters by building and status', async () => {
    const store = make();
    await store.createEvent(input);
    expect(await store.listEvents({ buildingId: 'scott-hall', status: 'needs_review' })).toHaveLength(1);
    expect(await store.listEvents({ buildingId: 'scott-hall', status: 'published' })).toHaveLength(1);
  });

  it('creates, reads, and updates an event', async () => {
    const store = make();
    const created = await store.createEvent(input);
    expect(created.id).toBeTruthy();
    const updated = await store.updateEvent(created.id, { status: 'published' });
    expect(updated?.status).toBe('published');
    expect((await store.getEvent(created.id))?.title).toBe('Test');
    expect(await store.updateEvent('missing', { title: 'x' })).toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run server/src/core`
Expected: FAIL, `./config`, `./seed`, and `./store` do not exist.

- [ ] **Step 3: Write config, seed loader, and memory store**

`server/src/core/config.ts`:

```ts
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url));

export interface Config {
  port: number;
  mock: boolean;
  databaseUrl: string | null;
  dbSchema: string;
  demoNow: string | null;
  swarmConcurrency: number;
  geminiApiKey: string | null;
  geminiVisionModel: string | null;
  geminiEmbedModel: string | null;
  elevenLabsApiKey: string | null;
  elevenLabsAgentId: string | null;
}

// DB_SCHEMA is interpolated into SQL identifiers, so it is restricted to a safe alphabet.
const SCHEMA_RE = /^[a-z_][a-z0-9_]{0,62}$/;

/** Loads the repo-root .env if present. Real environment variables win. */
export function loadEnvFile(): void {
  try {
    process.loadEnvFile(resolve(REPO_ROOT, '.env'));
  } catch {
    // No .env file: rely on the process environment (CI, production).
  }
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const dbSchema = env.DB_SCHEMA || 'dev_local';
  if (!SCHEMA_RE.test(dbSchema)) {
    throw new Error(`DB_SCHEMA must be lowercase letters, digits, and underscores (got "${dbSchema}")`);
  }
  const mock = env.MOCK === '1';
  const databaseUrl = env.DATABASE_URL || null;
  if (!mock && !databaseUrl) throw new Error('DATABASE_URL is required unless MOCK=1');
  const demoNow = env.DEMO_NOW || null;
  if (demoNow && Number.isNaN(Date.parse(demoNow))) throw new Error('DEMO_NOW must be an ISO 8601 datetime');
  return {
    port: Number(env.PORT) || 3001,
    mock,
    databaseUrl,
    dbSchema,
    demoNow: demoNow ? new Date(demoNow).toISOString() : null,
    swarmConcurrency: Number(env.SWARM_CONCURRENCY) || 4,
    geminiApiKey: env.GEMINI_API_KEY || null,
    geminiVisionModel: env.GEMINI_VISION_MODEL || null,
    geminiEmbedModel: env.GEMINI_EMBED_MODEL || null,
    elevenLabsApiKey: env.ELEVENLABS_API_KEY || null,
    elevenLabsAgentId: env.ELEVENLABS_AGENT_ID || null,
  };
}
```

`server/src/core/seed.ts`:

```ts
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
```

`server/src/core/store.ts`:

```ts
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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run server/src/core`
Expected: PASS, 12 tests.

- [ ] **Step 5: Write the failing migration tests**

`server/src/core/db/migrate.test.ts`:

```ts
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { assertResettable, listMigrations, MIGRATIONS_DIR, pendingMigrations } from './migrate';

const dirWith = (...names: string[]) => {
  const dir = mkdtempSync(join(tmpdir(), 'mig-'));
  for (const n of names) writeFileSync(join(dir, n), 'SELECT 1;');
  return dir;
};

describe('listMigrations', () => {
  it('returns sql files in timestamp order and ignores other files', async () => {
    const dir = dirWith('202610102200_b.sql', '202610101800_a.sql', 'README.md');
    expect(await listMigrations(dir)).toEqual(['202610101800_a.sql', '202610102200_b.sql']);
  });

  it('rejects names that are not YYYYMMDDHHMM_description.sql', async () => {
    await expect(listMigrations(dirWith('001_init.sql'))).rejects.toThrow(/Bad migration name/);
    await expect(listMigrations(dirWith('202610101800-Init.sql'))).rejects.toThrow(/Bad migration name/);
  });

  it('accepts every migration in the repo', async () => {
    expect((await listMigrations(MIGRATIONS_DIR)).length).toBeGreaterThan(0);
  });
});

describe('pendingMigrations', () => {
  it('returns only unapplied names, in order', () => {
    expect(pendingMigrations(['a', 'b', 'c'], ['a'])).toEqual(['b', 'c']);
  });
});

describe('assertResettable', () => {
  it('refuses prod and allows dev schemas', () => {
    expect(() => assertResettable('prod')).toThrow(/prod/);
    expect(() => assertResettable('dev_minh')).not.toThrow();
  });
});
```

Run: `npx vitest run server/src/core/db`
Expected: FAIL, `./migrate` does not exist.

- [ ] **Step 6: Write the migration SQL**

`server/migrations/202610101800_init.sql`:

```sql
-- Runs with search_path set to the caller's schema, then public.
CREATE TABLE buildings (
  id        text PRIMARY KEY,
  name      text NOT NULL,
  aliases   text[] NOT NULL DEFAULT '{}',
  lng       double precision NOT NULL,
  lat       double precision NOT NULL,
  footprint jsonb NOT NULL,
  height_m  double precision NOT NULL
);

CREATE TABLE ingest_runs (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  status            text NOT NULL DEFAULT 'running',
  started_at        timestamptz NOT NULL DEFAULT now(),
  finished_at       timestamptz,
  items             integer NOT NULL DEFAULT 0,
  events_created    integer NOT NULL DEFAULT 0,
  duplicates_merged integer NOT NULL DEFAULT 0,
  sent_to_review    integer NOT NULL DEFAULT 0
);

CREATE TABLE raw_items (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id       uuid REFERENCES ingest_runs(id),
  source_type  text NOT NULL CHECK (source_type IN ('upload', 'instagram', 'board')),
  source_ref   text NOT NULL,
  content_hash text NOT NULL UNIQUE,
  mime         text NOT NULL,
  bytes        bytea,
  caption      text,
  status       text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'processing', 'done', 'failed')),
  error        text,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE events (
  id                  text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  title               text NOT NULL,
  description         text NOT NULL DEFAULT '',
  category            text NOT NULL,
  building_id         text NOT NULL REFERENCES buildings(id),
  room                text,
  start_at            timestamptz NOT NULL,
  end_at              timestamptz NOT NULL,
  expected_attendance integer,
  tags                text[] NOT NULL DEFAULT '{}',
  free_food           boolean NOT NULL DEFAULT false,
  source              text NOT NULL,
  status              text NOT NULL CHECK (status IN ('published', 'needs_review')),
  confidence          double precision NOT NULL DEFAULT 1,
  embedding           vector(768),
  raw_item_ids        uuid[] NOT NULL DEFAULT '{}',
  created_at          timestamptz NOT NULL DEFAULT now(),
  CHECK (end_at > start_at)
);

CREATE INDEX events_time_idx ON events (start_at, end_at);
CREATE INDEX events_building_idx ON events (building_id);
```

- [ ] **Step 7: Write the pool and migration runner**

`server/src/core/db/pool.ts`:

```ts
import pg from 'pg';

/** `schema` must already be validated by loadConfig; it is interpolated as an identifier. */
export function createPool(databaseUrl: string, schema: string): pg.Pool {
  const pool = new pg.Pool({ connectionString: databaseUrl, max: 5 });
  pool.on('connect', (client) => {
    client
      .query(`SET search_path TO "${schema}", public`)
      .catch((err) => console.error('Failed to set search_path', err));
  });
  return pool;
}
```

`server/src/core/db/migrate.ts`:

```ts
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

export function assertResettable(schema: string): void {
  if (schema === 'prod') throw new Error('Refusing to reset the prod schema');
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
      await client.query('ROLLBACK');
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
```

- [ ] **Step 8: Run the migration tests to verify they pass**

Run: `npx vitest run server/src/core/db`
Expected: PASS, 5 tests.

- [ ] **Step 9: Write the Postgres store and its integration test**

`server/src/core/db/pgStore.ts`:

```ts
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
```

`server/src/core/db/pgStore.int.test.ts` (runs only when `TEST_DATABASE_URL` is set, so CI and `MOCK=1` machines skip it):

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type pg from 'pg';
import { loadSeed } from '../seed';
import { migrate, seedDb } from './migrate';
import { PgStore } from './pgStore';
import { createPool } from './pool';

const url = process.env.TEST_DATABASE_URL;
const schema = `test_${Date.now()}`;

describe.skipIf(!url)('PgStore against a real database', () => {
  let pool: pg.Pool;
  let store: PgStore;

  beforeAll(async () => {
    pool = createPool(url!, schema);
    await migrate(pool, schema);
    const seed = loadSeed();
    await seedDb(pool, schema, seed.buildings, seed.events);
    store = new PgStore(pool);
  });

  afterAll(async () => {
    await pool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await pool.end();
  });

  it('migrating twice applies nothing the second time', async () => {
    expect(await migrate(pool, schema)).toEqual([]);
  });

  it('returns seeded buildings with footprints', async () => {
    const buildings = await store.listBuildings();
    expect(buildings).toHaveLength(12);
    expect(buildings[0].footprint.length).toBeGreaterThanOrEqual(4);
  });

  it('lists events overlapping a window', async () => {
    const ids = (await store.listEvents({
      from: '2026-10-10T19:00:00-04:00', to: '2026-10-10T19:30:00-04:00', status: 'published',
    })).map((e) => e.id);
    expect(ids).toContain('seed-robotics-info');
    expect(ids).not.toContain('seed-pickup-basketball');
  });

  it('creates and updates an event', async () => {
    const created = await store.createEvent({
      title: 'PG Test', description: '', category: 'other', buildingId: 'scott-hall', room: null,
      start: '2026-10-10T12:00:00-04:00', end: '2026-10-10T13:00:00-04:00', expectedAttendance: null,
      tags: ['a'], freeFood: false, source: 'manual', status: 'needs_review', confidence: 0.5,
    });
    expect(created.start).toBe('2026-10-10T16:00:00.000Z');
    const updated = await store.updateEvent(created.id, { status: 'published' });
    expect(updated?.status).toBe('published');
    expect(await store.updateEvent('missing', { title: 'x' })).toBeNull();
  });
});
```

- [ ] **Step 10: Write the database CLI**

`server/src/core/db/cli.ts`:

```ts
import { loadConfig, loadEnvFile } from '../config';
import { loadSeed } from '../seed';
import { migrate, reset, seedDb } from './migrate';
import { createPool } from './pool';

const command = process.argv[2];
const COMMANDS = ['setup', 'migrate', 'seed', 'reset'];
if (!COMMANDS.includes(command)) {
  console.error(`Usage: cli.ts <${COMMANDS.join('|')}>`);
  process.exit(1);
}

loadEnvFile();
// Database commands always need a real database, whatever MOCK says.
const config = loadConfig({ ...process.env, MOCK: '0' });
const pool = createPool(config.databaseUrl!, config.dbSchema);

try {
  if (command === 'reset') {
    await reset(pool, config.dbSchema);
    console.log(`Dropped schema ${config.dbSchema}`);
  }
  if (command !== 'seed') {
    const applied = await migrate(pool, config.dbSchema);
    console.log(applied.length ? `Applied: ${applied.join(', ')}` : 'No pending migrations');
  }
  if (command !== 'migrate') {
    const seed = loadSeed();
    await seedDb(pool, config.dbSchema, seed.buildings, seed.events);
    console.log(`Seeded ${seed.buildings.length} buildings and ${seed.events.length} events into ${config.dbSchema}`);
  }
} catch (err) {
  console.error((err as Error).message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
```

- [ ] **Step 11: Verify**

Run: `npm test && npm run typecheck`
Expected: PASS with the 4 `PgStore` tests skipped; typecheck exits 0.

Run: `MOCK=1 DB_SCHEMA=prod DATABASE_URL=postgres://invalid.invalid/x npm run db:reset`
Expected: prints `Refusing to reset the prod schema` and exits non-zero without connecting.

If a Tiger `DATABASE_URL` is available, also run `TEST_DATABASE_URL="$DATABASE_URL" npx vitest run server/src/core/db/pgStore.int.test.ts` and expect 4 passing tests. If `CREATE EXTENSION vector` is refused, stop and report it: the free tier may not include pgvector, which changes the spec.

- [ ] **Step 12: Commit**

```bash
git add -A
git commit -m "feat: config, memory and Postgres stores, migrations"
```

---

### Task 4: HTTP API and slice routers

**Files:**
- Create: `server/src/core/deps.ts`, `server/src/core/http.ts`, `server/src/core/routes.ts`, `server/src/core/app.ts`, `server/src/index.ts`
- Create: `server/src/ingest/router.ts`, `server/src/ingest/CLAUDE.md`, `server/src/voice/router.ts`, `server/src/voice/CLAUDE.md`
- Test: `server/src/core/app.test.ts`

**Interfaces:**
- Consumes: `Config`, `loadConfig`, `loadEnvFile`, `REPO_ROOT`, `Store`, `MemoryStore`, `PgStore`, `createPool`, `loadSeed` from Task 3; `EventInputSchema`, `EventPatchSchema`, `EventQuerySchema`, `AppConfig` from Task 2.
- Produces:
  - `interface AppDeps { config: Config; store: Store; pool: pg.Pool | null }`, `createDeps(config: Config): AppDeps`
  - `class HttpError extends Error { constructor(status: number, code: string, issues?: unknown) }`, `parse<T extends z.ZodType>(schema: T, data: unknown): z.infer<T>` (throws `HttpError(400, 'invalid_request', issues)`)
  - `createApp(deps: AppDeps): express.Express`
  - `ingestRouter(deps: AppDeps): Router` mounted at `/api/ingest`, `voiceRouter(deps: AppDeps): Router` mounted at `/api/voice`. Slice owners replace the bodies of these two functions and never edit `app.ts`.
  - Routes: `GET /api/health`, `GET /api/config`, `GET /api/buildings`, `GET /api/events`, `POST /api/events`, `PATCH /api/events/:id`

- [ ] **Step 1: Write the failing API tests**

`server/src/core/app.test.ts`:

```ts
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Express } from 'express';
import { createApp } from './app';
import { loadConfig } from './config';
import { loadSeed } from './seed';
import { MemoryStore } from './store';

let app: Express;
beforeEach(() => {
  const seed = loadSeed();
  app = createApp({
    config: loadConfig({ MOCK: '1', DEMO_NOW: '2026-10-10T19:30:00-04:00' }),
    store: new MemoryStore(seed.buildings, seed.events),
    pool: null,
  });
});

const body = {
  title: 'New Event', category: 'club', buildingId: 'scott-hall',
  start: '2026-10-10T12:00:00-04:00', end: '2026-10-10T13:00:00-04:00',
};

describe('core API', () => {
  it('reports health and config', async () => {
    expect((await request(app).get('/api/health')).body).toMatchObject({ ok: true, mock: true });
    expect((await request(app).get('/api/config')).body).toEqual({ now: '2026-10-10T23:30:00.000Z' });
  });

  it('lists buildings with footprints', async () => {
    const res = await request(app).get('/api/buildings');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(12);
    expect(res.body[0].footprint.length).toBeGreaterThanOrEqual(4);
  });

  it('lists published events and filters by window', async () => {
    const all = await request(app).get('/api/events');
    expect(all.body).toHaveLength(12);
    const win = await request(app)
      .get('/api/events')
      .query({ from: '2026-10-11T00:00:00-04:00', to: '2026-10-11T23:59:00-04:00' });
    expect(win.body.map((e: { id: string }) => e.id).sort()).toEqual(
      ['seed-brunch-social', 'seed-fall-concert', 'seed-writing-workshop'],
    );
  });

  it('rejects a malformed query', async () => {
    const res = await request(app).get('/api/events').query({ from: 'yesterday' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('invalid_request');
  });

  it('creates an event that then appears in the list', async () => {
    const created = await request(app).post('/api/events').send(body);
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ title: 'New Event', status: 'published', source: 'manual' });
    const list = await request(app).get('/api/events').query({ buildingId: 'scott-hall' });
    expect(list.body.map((e: { id: string }) => e.id)).toContain(created.body.id);
  });

  it('rejects an event whose end is not after its start', async () => {
    const res = await request(app).post('/api/events').send({ ...body, end: body.start });
    expect(res.status).toBe(400);
  });

  it('rejects an event in an unknown building', async () => {
    const res = await request(app).post('/api/events').send({ ...body, buildingId: 'nowhere' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('unknown_building');
  });

  it('rejects malformed JSON with 400', async () => {
    const res = await request(app).post('/api/events').set('Content-Type', 'application/json').send('{"title":');
    expect(res.status).toBe(400);
  });

  it('approves a needs_review event through PATCH', async () => {
    const draft = await request(app).post('/api/events').send({ ...body, status: 'needs_review', confidence: 0.4 });
    const res = await request(app).patch(`/api/events/${draft.body.id}`).send({ status: 'published' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('published');
    expect(res.body.title).toBe('New Event');
  });

  it('rejects a PATCH that moves the end before the stored start', async () => {
    const res = await request(app)
      .patch('/api/events/seed-robotics-info')
      .send({ end: '2026-10-10T18:00:00-04:00' });
    expect(res.status).toBe(400);
    const after = await request(app).get('/api/events').query({ buildingId: 'scott-hall' });
    expect(after.body[0].end).toBe('2026-10-10T20:30:00-04:00');
  });

  it('returns 404 for an unknown event and an unknown API path', async () => {
    expect((await request(app).patch('/api/events/missing').send({ title: 'x' })).status).toBe(404);
    const res = await request(app).get('/api/nope');
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('not_found');
  });

  it('answers 501 from slice routers that are not built yet', async () => {
    expect((await request(app).post('/api/ingest/runs')).status).toBe(501);
    expect((await request(app).get('/api/voice/session')).status).toBe(501);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run server/src/core/app.test.ts`
Expected: FAIL, `./app` does not exist.

- [ ] **Step 3: Write deps and HTTP helpers**

`server/src/core/deps.ts`:

```ts
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
```

`server/src/core/http.ts`:

```ts
import type { NextFunction, Request, Response } from 'express';
import type { z } from 'zod';

export class HttpError extends Error {
  constructor(readonly status: number, readonly code: string, readonly issues?: unknown) {
    super(code);
  }
}

/** Validates external input. Throws a 400 HttpError carrying zod's issues. */
export function parse<T extends z.ZodType>(schema: T, data: unknown): z.infer<T> {
  const result = schema.safeParse(data);
  if (!result.success) throw new HttpError(400, 'invalid_request', result.error.issues);
  return result.data;
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.code, issues: err.issues });
    return;
  }
  // body-parser and similar middleware attach a 4xx status to client errors
  const status = (err as { status?: unknown }).status;
  if (typeof status === 'number' && status >= 400 && status < 500) {
    res.status(status).json({ error: 'invalid_request' });
    return;
  }
  console.error(err);
  res.status(500).json({ error: 'internal' });
}
```

- [ ] **Step 4: Write the routes, slice router stubs, app, and entry point**

`server/src/core/routes.ts`:

```ts
import { Router } from 'express';
import { EventInputSchema, EventPatchSchema, EventQuerySchema, type AppConfig } from '@ruconnect/shared';
import type { AppDeps } from './deps';
import { HttpError, parse } from './http';
import type { Store } from './store';

async function assertBuilding(store: Store, buildingId: string): Promise<void> {
  const known = (await store.listBuildings()).some((b) => b.id === buildingId);
  if (!known) throw new HttpError(400, 'unknown_building', [{ path: ['buildingId'], message: buildingId }]);
}

export function coreRouter({ store, config }: AppDeps): Router {
  const r = Router();

  r.get('/health', (_req, res) => {
    res.json({ ok: true, mock: config.mock, schema: config.dbSchema });
  });

  r.get('/config', (_req, res) => {
    res.json({ now: config.demoNow } satisfies AppConfig);
  });

  r.get('/buildings', async (_req, res) => {
    res.json(await store.listBuildings());
  });

  r.get('/events', async (req, res) => {
    res.json(await store.listEvents(parse(EventQuerySchema, req.query)));
  });

  r.post('/events', async (req, res) => {
    const input = parse(EventInputSchema, req.body);
    await assertBuilding(store, input.buildingId);
    res.status(201).json(await store.createEvent(input));
  });

  r.patch('/events/:id', async (req, res) => {
    const patch = parse(EventPatchSchema, req.body);
    const current = await store.getEvent(req.params.id);
    if (!current) throw new HttpError(404, 'not_found');
    if (patch.buildingId) await assertBuilding(store, patch.buildingId);
    const merged = { ...current, ...patch };
    if (Date.parse(merged.end) <= Date.parse(merged.start)) {
      throw new HttpError(400, 'invalid_request', [{ path: ['end'], message: 'end must be after start' }]);
    }
    res.json(await store.updateEvent(req.params.id, patch));
  });

  return r;
}
```

`server/src/ingest/router.ts`:

```ts
import { Router } from 'express';
import type { AppDeps } from '../core/deps';

/** Slice B replaces this body. Mounted at /api/ingest by core/app.ts. */
export function ingestRouter(_deps: AppDeps): Router {
  const r = Router();
  r.use((_req, res) => {
    res.status(501).json({ error: 'not_implemented', slice: 'ingest' });
  });
  return r;
}
```

`server/src/voice/router.ts`:

```ts
import { Router } from 'express';
import type { AppDeps } from '../core/deps';

/** Slice C replaces this body. Mounted at /api/voice by core/app.ts. */
export function voiceRouter(_deps: AppDeps): Router {
  const r = Router();
  r.use((_req, res) => {
    res.status(501).json({ error: 'not_implemented', slice: 'voice' });
  });
  return r;
}
```

`server/src/core/app.ts`:

```ts
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import express, { type Express } from 'express';
import { ingestRouter } from '../ingest/router';
import { voiceRouter } from '../voice/router';
import { REPO_ROOT } from './config';
import type { AppDeps } from './deps';
import { errorHandler } from './http';
import { coreRouter } from './routes';

export function createApp(deps: AppDeps): Express {
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  app.use('/api/ingest', ingestRouter(deps));
  app.use('/api/voice', voiceRouter(deps));
  app.use('/api', coreRouter(deps));
  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'not_found' });
  });

  // In production the server also serves the built client.
  const dist = resolve(REPO_ROOT, 'client/dist');
  if (existsSync(dist)) {
    app.use(express.static(dist));
    app.use((req, res, next) => {
      if (req.method !== 'GET') return next();
      res.sendFile(resolve(dist, 'index.html'));
    });
  }

  app.use(errorHandler);
  return app;
}
```

`server/src/index.ts`:

```ts
import { createApp } from './core/app';
import { loadConfig, loadEnvFile } from './core/config';
import { createDeps } from './core/deps';

loadEnvFile();
const config = loadConfig();
const app = createApp(createDeps(config));

app.listen(config.port, () => {
  const mode = config.mock ? 'mock data' : `schema ${config.dbSchema}`;
  console.log(`RUConnect server on http://localhost:${config.port} (${mode})`);
});
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run server/src/core/app.test.ts`
Expected: PASS, 12 tests.

- [ ] **Step 6: Write the server slice rules**

`server/src/ingest/CLAUDE.md`:

```markdown
# Slice B: Ingest (server)

Owner: P2 (update this line at each rotation).

Owns `server/src/ingest/`, `client/src/ingest/`, and `data/captures/`. Design: spec section 5.

- Entry point: `ingestRouter(deps)` in `router.ts`, mounted at `/api/ingest`. Replace its body; do not edit `core/app.ts`.
- Routes to build: `POST /runs` (multipart upload or `{capture}`), `GET /runs/:id/stream` (Server-Sent Events of `SwarmStep` from `@ruconnect/shared`).
- Each worker (scout, reader, reconciler, locator, deduper, verifier) is one file exporting one function with typed input and output. Workers do not call each other; the orchestrator does.
- Save finished events through `deps.store.createEvent`. Query `raw_items` and `ingest_runs` through `deps.pool`, which is null when `MOCK=1`: in that case replay `data/extraction.cache.json`.
- Cap concurrent Gemini calls at `deps.config.swarmConcurrency`. One failed item never aborts a run.
- Validate every model response with a zod schema before using it.
- First task: the vertical slice. One uploaded flyer, Reader and Verifier only, event saved, building glows.
```

`server/src/voice/CLAUDE.md`:

```markdown
# Slice C: Voice (server)

Owner: P3 (update this line at each rotation).

Owns `server/src/voice/` and `client/src/voice/`. Design: spec section 7.

- Entry point: `voiceRouter(deps)` in `router.ts`, mounted at `/api/voice`. Replace its body; do not edit `core/app.ts`.
- Routes to build: `GET /session` (short-lived ElevenLabs conversation credential; the API key never leaves the server) and `POST /search` (`{query, from, to, freeFood, nearBuildingId}` to ranked events).
- The spec lists search at `/api/events/search`; it lives at `/api/voice/search` so this slice owns it without touching core.
- With `MOCK=1`, search filters `deps.store.listEvents` by time, flag, and keyword. With a database, add vector similarity on `events.embedding` through `deps.pool`.
```

- [ ] **Step 7: Verify the server runs**

Run: `MOCK=1 npm run start -w server` in one shell, then `curl -s localhost:3001/api/health` in another.
Expected: `{"ok":true,"mock":true,"schema":"dev_local"}`. Stop the server.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: core HTTP API and slice router stubs"
```

---

### Task 5: Client shell and map

**Files:**
- Create: `client/index.html`, `client/vite.config.ts`, `client/src/main.tsx`
- Create: `client/src/app/App.tsx`, `client/src/app/app.css`, `client/src/app/api.ts`, `client/src/app/eventsStore.ts`, `client/src/app/mapController.ts`
- Create: `client/src/map/index.tsx`, `client/src/map/geo.ts`, `client/src/map/time.ts`, `client/src/map/TimeSlider.tsx`, `client/src/map/CLAUDE.md`
- Create: `client/src/ingest/index.tsx`, `client/src/ingest/CLAUDE.md`, `client/src/voice/index.tsx`, `client/src/voice/CLAUDE.md`
- Test: `client/src/app/eventsStore.test.ts`, `client/src/app/mapController.test.ts`, `client/src/map/geo.test.ts`, `client/src/map/time.test.ts`

**Interfaces:**
- Consumes: `Building`, `CampusEvent`, `MapController`, `BuildingSchema`, `CampusEventSchema`, `AppConfigSchema`, `EventQuery`, `activeBuildingIds`, `parseSeedBuildings`, `parseSeedEvents` from `@ruconnect/shared`; the Task 4 routes.
- Produces:
  - `api.buildings(): Promise<Building[]>`, `api.events(q?: Partial<EventQuery>): Promise<CampusEvent[]>`, `api.config(): Promise<AppConfig>`
  - `useEventsStore` (zustand) with state `{ buildings: Building[]; events: CampusEvent[]; selectedTime: string; offline: boolean; load(): Promise<void>; setSelectedTime(iso: string): void; upsertEvent(e: CampusEvent): void }`
  - `mapController: MapController` (safe to call before the map exists) and `registerMapController(c: MapController | null): void`
  - Components `MapView`, `IngestPanel`, `VoicePanel`, each the default mount point of its slice
  - `buildingsToGeoJSON(buildings: Building[]): GeoJSON.FeatureCollection<GeoJSON.Polygon>`
  - `SLIDER_STEPS = 96`, `sliderIndex(iso: string): number`, `timeAtIndex(iso: string, index: number): string`

- [ ] **Step 1: Write the failing client tests**

`client/src/app/eventsStore.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useEventsStore } from './eventsStore';

afterEach(() => vi.unstubAllGlobals());

const json = (data: unknown) => Promise.resolve(new Response(JSON.stringify(data), { status: 200 }));

describe('useEventsStore.load', () => {
  it('falls back to bundled seed data when the API is unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    await useEventsStore.getState().load();
    const s = useEventsStore.getState();
    expect(s.offline).toBe(true);
    expect(s.buildings).toHaveLength(12);
    expect(s.events.length).toBeGreaterThanOrEqual(10);
  });

  it('falls back when the API answers with an error status', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{"error":"internal"}', { status: 500 })));
    await useEventsStore.getState().load();
    expect(useEventsStore.getState().offline).toBe(true);
  });

  it('uses API data and DEMO_NOW when the API responds', async () => {
    const building = {
      id: 'b1', name: 'B1', aliases: [], lng: -74.45, lat: 40.5, heightM: 10,
      footprint: [[0, 0], [1, 0], [1, 1], [0, 0]],
    };
    vi.stubGlobal('fetch', vi.fn((url: string) => {
      if (url.startsWith('/api/buildings')) return json([building]);
      if (url.startsWith('/api/events')) return json([]);
      return json({ now: '2026-10-10T23:30:00.000Z' });
    }));
    await useEventsStore.getState().load();
    const s = useEventsStore.getState();
    expect(s.offline).toBe(false);
    expect(s.buildings.map((b) => b.id)).toEqual(['b1']);
    expect(s.selectedTime).toBe('2026-10-10T23:30:00.000Z');
  });
});

describe('useEventsStore.upsertEvent', () => {
  it('adds a new event and replaces one with the same id', () => {
    const e = { id: 'x', title: 'One' } as never;
    useEventsStore.setState({ events: [] });
    useEventsStore.getState().upsertEvent(e);
    useEventsStore.getState().upsertEvent({ id: 'x', title: 'Two' } as never);
    expect(useEventsStore.getState().events).toEqual([{ id: 'x', title: 'Two' }]);
  });
});
```

`client/src/app/mapController.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { mapController, registerMapController } from './mapController';

describe('mapController', () => {
  it('does nothing before a map registers', () => {
    registerMapController(null);
    expect(() => mapController.flyTo('scott-hall')).not.toThrow();
    expect(() => mapController.highlight(['a'])).not.toThrow();
  });

  it('forwards calls to the registered controller and stops after unregistering', () => {
    const real = { flyTo: vi.fn(), highlight: vi.fn(), clearHighlight: vi.fn(), setTime: vi.fn() };
    registerMapController(real);
    mapController.flyTo('scott-hall');
    mapController.highlight(['a', 'b']);
    mapController.clearHighlight();
    mapController.setTime('2026-10-10T23:30:00.000Z');
    expect(real.flyTo).toHaveBeenCalledWith('scott-hall');
    expect(real.highlight).toHaveBeenCalledWith(['a', 'b']);
    expect(real.clearHighlight).toHaveBeenCalledOnce();
    expect(real.setTime).toHaveBeenCalledWith('2026-10-10T23:30:00.000Z');
    registerMapController(null);
    mapController.flyTo('x');
    expect(real.flyTo).toHaveBeenCalledOnce();
  });
});
```

`client/src/map/geo.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { buildingsToGeoJSON } from './geo';

describe('buildingsToGeoJSON', () => {
  it('makes one polygon feature per building, keyed by id', () => {
    const fc = buildingsToGeoJSON([
      { id: 'b1', name: 'B1', aliases: [], lng: 0, lat: 0, heightM: 12, footprint: [[0, 0], [1, 0], [1, 1], [0, 0]] },
    ]);
    expect(fc.type).toBe('FeatureCollection');
    expect(fc.features).toHaveLength(1);
    expect(fc.features[0].properties).toEqual({ id: 'b1', name: 'B1', heightM: 12 });
    expect(fc.features[0].geometry).toEqual({ type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] });
  });

  it('returns an empty collection for no buildings', () => {
    expect(buildingsToGeoJSON([]).features).toEqual([]);
  });
});
```

`client/src/map/time.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { SLIDER_STEPS, sliderIndex, timeAtIndex } from './time';

describe('time slider math', () => {
  const noon = '2026-10-10T16:07:00.000Z';

  it('round-trips every index on the same local day', () => {
    for (const i of [0, 1, 30, 78, SLIDER_STEPS - 1]) {
      expect(sliderIndex(timeAtIndex(noon, i))).toBe(i);
    }
  });

  it('moves in 15-minute steps', () => {
    const a = Date.parse(timeAtIndex(noon, 10));
    const b = Date.parse(timeAtIndex(noon, 11));
    expect(b - a).toBe(15 * 60 * 1000);
  });

  it('clamps out-of-range indexes', () => {
    expect(timeAtIndex(noon, -5)).toBe(timeAtIndex(noon, 0));
    expect(timeAtIndex(noon, 500)).toBe(timeAtIndex(noon, SLIDER_STEPS - 1));
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run client`
Expected: FAIL, the four modules under test do not exist.

- [ ] **Step 3: Write the app stores and API client**

`client/src/app/api.ts`:

```ts
import { z } from 'zod';
import {
  AppConfigSchema, BuildingSchema, CampusEventSchema,
  type AppConfig, type Building, type CampusEvent, type EventQuery,
} from '@ruconnect/shared';

async function get<T extends z.ZodType>(path: string, schema: T): Promise<z.infer<T>> {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`GET ${path} failed with ${res.status}`);
  return schema.parse(await res.json());
}

export const api = {
  buildings: (): Promise<Building[]> => get('/api/buildings', z.array(BuildingSchema)),
  events: (q: Partial<EventQuery> = {}): Promise<CampusEvent[]> => {
    // URLSearchParams encodes the "+" in UTC offsets, which a raw query string would turn into a space.
    const qs = new URLSearchParams(Object.entries(q).filter(([, v]) => v !== undefined) as [string, string][]);
    return get(`/api/events${qs.size ? `?${qs}` : ''}`, z.array(CampusEventSchema));
  },
  config: (): Promise<AppConfig> => get('/api/config', AppConfigSchema),
};
```

`client/src/app/eventsStore.ts`:

```ts
import { create } from 'zustand';
import { parseSeedBuildings, parseSeedEvents, type Building, type CampusEvent } from '@ruconnect/shared';
import seedBuildings from '../../../data/buildings.json';
import seedEvents from '../../../data/events.seed.json';
import { api } from './api';

interface EventsState {
  buildings: Building[];
  events: CampusEvent[];
  /** The instant the map is showing, as an ISO string. */
  selectedTime: string;
  /** True when the API could not be reached and bundled seed data is shown. */
  offline: boolean;
  load(): Promise<void>;
  setSelectedTime(iso: string): void;
  upsertEvent(event: CampusEvent): void;
}

export const useEventsStore = create<EventsState>((set) => ({
  buildings: [],
  events: [],
  selectedTime: new Date().toISOString(),
  offline: false,

  async load() {
    try {
      const [buildings, events, config] = await Promise.all([api.buildings(), api.events(), api.config()]);
      set({ buildings, events, offline: false, selectedTime: config.now ?? new Date().toISOString() });
    } catch {
      set({ buildings: parseSeedBuildings(seedBuildings), events: parseSeedEvents(seedEvents), offline: true });
    }
  },

  setSelectedTime(iso) {
    set({ selectedTime: iso });
  },

  upsertEvent(event) {
    set((s) => ({ events: [...s.events.filter((e) => e.id !== event.id), event] }));
  },
}));
```

`client/src/app/mapController.ts`:

```ts
import type { MapController } from '@ruconnect/shared';

let current: MapController | null = null;

/** Called by the map slice when the map is ready, and with null when it unmounts. */
export function registerMapController(controller: MapController | null): void {
  current = controller;
}

/** Other slices import this. Calls made before the map is ready are dropped. */
export const mapController: MapController = {
  flyTo: (buildingId) => current?.flyTo(buildingId),
  highlight: (buildingIds) => current?.highlight(buildingIds),
  clearHighlight: () => current?.clearHighlight(),
  setTime: (iso) => current?.setTime(iso),
};
```

- [ ] **Step 4: Write the map helpers**

`client/src/map/geo.ts`:

```ts
import type { Building } from '@ruconnect/shared';

export function buildingsToGeoJSON(buildings: Building[]): GeoJSON.FeatureCollection<GeoJSON.Polygon> {
  return {
    type: 'FeatureCollection',
    features: buildings.map((b) => ({
      type: 'Feature',
      properties: { id: b.id, name: b.name, heightM: b.heightM },
      geometry: { type: 'Polygon', coordinates: [b.footprint] },
    })),
  };
}
```

`client/src/map/time.ts`:

```ts
const STEP_MS = 15 * 60 * 1000;
export const SLIDER_STEPS = 96;

const localMidnight = (iso: string): number => {
  const d = new Date(iso);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

/** Which 15-minute step of its local day an instant falls in. */
export function sliderIndex(iso: string): number {
  const index = Math.floor((Date.parse(iso) - localMidnight(iso)) / STEP_MS);
  return Math.min(SLIDER_STEPS - 1, Math.max(0, index));
}

/** The instant at a step of the same local day as `iso`. */
export function timeAtIndex(iso: string, index: number): string {
  const clamped = Math.min(SLIDER_STEPS - 1, Math.max(0, index));
  return new Date(localMidnight(iso) + clamped * STEP_MS).toISOString();
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run client`
Expected: PASS, 11 tests. If `GeoJSON` is reported as an unknown namespace by `npm run typecheck`, run `npm install -w client -D @types/geojson` and rerun.

- [ ] **Step 6: Write the Vite entry files**

`client/index.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>RUConnect</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

`client/vite.config.ts`:

```ts
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  envDir: '..', // the repo-root .env; only VITE_-prefixed values reach the browser
  server: {
    port: 5173,
    proxy: { '/api': 'http://localhost:3001' },
  },
});
```

`client/src/main.tsx`:

```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import './app/app.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

- [ ] **Step 7: Write the map components**

`client/src/map/TimeSlider.tsx`:

```tsx
import { useEventsStore } from '../app/eventsStore';
import { SLIDER_STEPS, sliderIndex, timeAtIndex } from './time';

export function TimeSlider() {
  const selectedTime = useEventsStore((s) => s.selectedTime);
  const setSelectedTime = useEventsStore((s) => s.setSelectedTime);
  const label = new Date(selectedTime).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' });

  return (
    <label className="time-slider">
      <span>{label}</span>
      <input
        type="range"
        min={0}
        max={SLIDER_STEPS - 1}
        value={sliderIndex(selectedTime)}
        onChange={(e) => setSelectedTime(timeAtIndex(selectedTime, Number(e.target.value)))}
      />
    </label>
  );
}
```

`client/src/map/index.tsx`:

```tsx
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { useEffect, useRef, useState } from 'react';
import { activeBuildingIds, type MapController } from '@ruconnect/shared';
import { useEventsStore } from '../app/eventsStore';
import { registerMapController } from '../app/mapController';
import { buildingsToGeoJSON } from './geo';
import { TimeSlider } from './TimeSlider';

const TOKEN = import.meta.env.VITE_MAPBOX_TOKEN as string | undefined;
const SOURCE = 'ru-buildings';
const LAYER = 'ru-buildings-3d';
const CENTER: [number, number] = [-74.449, 40.5015];

export function MapView() {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const [ready, setReady] = useState(false);
  const buildings = useEventsStore((s) => s.buildings);
  const events = useEventsStore((s) => s.events);
  const selectedTime = useEventsStore((s) => s.selectedTime);

  useEffect(() => {
    if (!TOKEN || !container.current) return;
    mapboxgl.accessToken = TOKEN;
    const map = new mapboxgl.Map({
      container: container.current,
      style: 'mapbox://styles/mapbox/dark-v11',
      center: CENTER,
      zoom: 15.5,
      pitch: 60,
      bearing: -30,
      antialias: true,
    });
    mapRef.current = map;
    let highlighted: string[] = [];

    const controller: MapController = {
      flyTo(buildingId) {
        const b = useEventsStore.getState().buildings.find((x) => x.id === buildingId);
        if (b) map.flyTo({ center: [b.lng, b.lat], zoom: 17.5, pitch: 60, duration: 2000 });
      },
      highlight(buildingIds) {
        controller.clearHighlight();
        for (const id of buildingIds) map.setFeatureState({ source: SOURCE, id }, { highlight: true });
        highlighted = buildingIds;
      },
      clearHighlight() {
        for (const id of highlighted) map.setFeatureState({ source: SOURCE, id }, { highlight: false });
        highlighted = [];
      },
      setTime(iso) {
        useEventsStore.getState().setSelectedTime(iso);
      },
    };

    map.on('load', () => {
      map.addSource(SOURCE, { type: 'geojson', data: buildingsToGeoJSON([]), promoteId: 'id' });
      map.addLayer({
        id: LAYER,
        type: 'fill-extrusion',
        source: SOURCE,
        paint: {
          'fill-extrusion-height': ['get', 'heightM'],
          'fill-extrusion-opacity': 0.9,
          'fill-extrusion-color': [
            'case',
            ['boolean', ['feature-state', 'highlight'], false], '#ffd166',
            ['boolean', ['feature-state', 'active'], false], '#ff5d8f',
            '#3a4a6b',
          ],
        },
      });
      registerMapController(controller);
      setReady(true);
    });

    return () => {
      registerMapController(null);
      setReady(false);
      mapRef.current = null;
      map.remove();
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    (map.getSource(SOURCE) as mapboxgl.GeoJSONSource).setData(buildingsToGeoJSON(buildings));
  }, [ready, buildings]);

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    const active = activeBuildingIds(events, selectedTime);
    for (const b of buildings) map.setFeatureState({ source: SOURCE, id: b.id }, { active: active.has(b.id) });
  }, [ready, buildings, events, selectedTime]);

  if (!TOKEN) {
    return <div className="map-missing">Set VITE_MAPBOX_TOKEN in .env and restart to see the map.</div>;
  }
  return (
    <>
      <div ref={container} className="map" />
      <TimeSlider />
    </>
  );
}
```

- [ ] **Step 8: Write the slice stubs, app shell, and styles**

`client/src/ingest/index.tsx`:

```tsx
/** Slice B replaces this. Mounted by app/App.tsx in the right-hand column. */
export function IngestPanel() {
  return (
    <section className="panel">
      <h2>Add events</h2>
      <p>Flyer upload and the swarm panel go here.</p>
    </section>
  );
}
```

`client/src/voice/index.tsx`:

```tsx
/** Slice C replaces this. Mounted by app/App.tsx in the right-hand column. */
export function VoicePanel() {
  return (
    <section className="panel">
      <h2>Ask</h2>
      <p>The mic button and transcript go here.</p>
    </section>
  );
}
```

`client/src/app/App.tsx`:

```tsx
import { useEffect } from 'react';
import { IngestPanel } from '../ingest';
import { MapView } from '../map';
import { VoicePanel } from '../voice';
import { useEventsStore } from './eventsStore';

export function App() {
  const load = useEventsStore((s) => s.load);
  const offline = useEventsStore((s) => s.offline);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="app">
      <MapView />
      <header className="title">
        RUConnect
        {offline && <span className="offline">offline: showing saved events</span>}
      </header>
      <aside className="sidebar">
        <VoicePanel />
        <IngestPanel />
      </aside>
    </div>
  );
}
```

`client/src/app/app.css`:

```css
:root {
  color-scheme: dark;
  font-family: system-ui, sans-serif;
  color: #e8ecf4;
  background: #0d1220;
}
body { margin: 0; }
.app { position: fixed; inset: 0; }
.map, .map-missing { position: absolute; inset: 0; }
.map-missing { display: grid; place-items: center; padding: 16px; text-align: center; }
.title {
  position: absolute; top: 16px; left: 16px;
  font-size: 20px; font-weight: 700; display: flex; gap: 12px; align-items: baseline;
}
.offline { font-size: 12px; font-weight: 400; color: #ffd166; }
.sidebar {
  position: absolute; top: 16px; right: 16px; width: min(320px, calc(100vw - 32px));
  display: flex; flex-direction: column; gap: 12px;
}
.panel { background: rgba(20, 27, 45, 0.9); border-radius: 12px; padding: 12px 16px; }
.panel h2 { margin: 0 0 4px; font-size: 14px; }
.panel p { margin: 0; font-size: 13px; color: #a8b3c7; }
.time-slider {
  position: absolute; left: 16px; right: 16px; bottom: 24px; max-width: 640px; margin: 0 auto;
  display: flex; gap: 12px; align-items: center;
  background: rgba(20, 27, 45, 0.9); border-radius: 12px; padding: 10px 16px; font-size: 13px;
}
.time-slider span { min-width: 96px; }
.time-slider input { flex: 1; }
```

- [ ] **Step 9: Write the client slice rules**

`client/src/map/CLAUDE.md`:

```markdown
# Slice A: Map

Owner: P1 (update this line at each rotation).

Owns `client/src/map/`. Design: spec section 6.

- This is the only folder that may import `mapbox-gl`.
- `MapView` in `index.tsx` is mounted by `app/App.tsx`. It registers a `MapController` (type from `@ruconnect/shared`) through `registerMapController`. Other slices call `mapController` from `client/src/app/mapController.ts`; keep its four methods working.
- Read data from `useEventsStore` (`buildings`, `events`, `selectedTime`). Do not fetch events here.
- Building coordinates in `data/buildings.json` are approximate and footprints are rectangles. Correct them against the basemap and replace them with real footprints; that file is slice-owned data, but its schema (`BuildingSeedSchema`) is frozen.
- To build: category colors and pulsing glow, attendance beacons, play button on the slider, click-to-open building panel.
```

`client/src/ingest/CLAUDE.md`:

```markdown
# Slice B: Ingest (client)

Owner: P2 (update this line at each rotation). Server rules: `server/src/ingest/CLAUDE.md`.

- `IngestPanel` in `index.tsx` is mounted by `app/App.tsx`. Replace its body.
- When an event is published, call `useEventsStore.getState().upsertEvent(event)` so the map lights up, then `mapController.flyTo(event.buildingId)`.
- To build: file picker and mobile camera capture, live swarm panel fed by `SwarmStep` Server-Sent Events, confirm/edit form for `needs_review` events.
```

`client/src/voice/CLAUDE.md`:

```markdown
# Slice C: Voice (client)

Owner: P3 (update this line at each rotation). Server rules: `server/src/voice/CLAUDE.md`.

- `VoicePanel` in `index.tsx` is mounted by `app/App.tsx`. Replace its body.
- Drive the map only through `mapController` from `client/src/app/mapController.ts` (`highlight`, `flyTo`, `setTime`).
- To build: mic button and transcript with `@elevenlabs/react`, client tools `find_events` and `focus_event`, and the text fallback using `speechSynthesis`.
```

- [ ] **Step 10: Verify the whole app**

Run: `npm test && npm run typecheck && npm run build`
Expected: all tests pass (PgStore tests skipped), typecheck exits 0, and `client/dist/index.html` exists.

Run: `cp -n .env.example .env; npm run dev`, then open http://localhost:5173.
Expected without a Mapbox token: the title, both stub panels, and the message asking for `VITE_MAPBOX_TOKEN`. With a token in `.env`: a dark map of College Ave with 12 extruded buildings, and dragging the slider to Saturday 7:30 PM turns several buildings pink. Stop the server with Ctrl-C. If no token is available, say so in the final report rather than claiming the map was seen.

- [ ] **Step 11: Commit**

```bash
git add -A
git commit -m "feat: client shell, map with time slider, slice stubs"
```

---

### Task 6: Onboarding docs, pull request, and team access

**Files:**
- Modify: `README.md` (replace contents)
- Create: `docs/handoff/map.md`, `docs/handoff/ingest.md`, `docs/handoff/voice.md`

**Interfaces:**
- Consumes: everything above.
- Produces: `main` on GitHub containing the foundation, with CI passing.

- [ ] **Step 1: Replace `README.md`**

````markdown
# RUConnect

A 3D map of every event on Rutgers College Ave. An agent swarm turns flyers, Instagram posts, and event-board pages into events; buildings glow when something is happening; a voice assistant picks events and flies the camera to them.

Built at HackRU, Oct 10 to 11, 2026. Design: [`docs/superpowers/specs/2026-10-10-campus-events-design.md`](docs/superpowers/specs/2026-10-10-campus-events-design.md).

## Setup

Needs Node 22 or newer.

```bash
gh repo clone mlhv/RUConnect && cd RUConnect
cp .env.example .env     # set DB_SCHEMA=dev_<yourname> and paste the keys from team chat
npm install              # also installs the hook that blocks pushes to main
npm run dev              # server on :3001, client on http://localhost:5173
```

With `MOCK=1` (the default in `.env.example`) the app runs on built-in sample data with no database and no keys except `VITE_MAPBOX_TOKEN` for the map.

To use the shared Tiger database, set `DATABASE_URL` and `MOCK=0`, then run `npm run db:setup` once. Each person has a private schema named by `DB_SCHEMA`, so your data never touches anyone else's. `npm run db:reset` rebuilds your own schema.

## Commands

| Command | Does |
|---|---|
| `npm run dev` | Server and client with reload |
| `npm test` | All tests |
| `npm run typecheck` | TypeScript check |
| `npm run build` then `npm start` | Production: server also serves the client |
| `npm run db:setup` / `db:migrate` / `db:seed` / `db:reset` | Database, for your own schema |

## Who owns what

| Slice | Folders | Owner now |
|---|---|---|
| A: Map | `client/src/map/` | P1 |
| B: Ingest | `server/src/ingest/`, `client/src/ingest/`, `data/captures/` | P2 |
| C: Voice | `server/src/voice/`, `client/src/voice/` | P3 |

`shared/`, `server/src/core/`, `client/src/app/`, and root config are frozen: change them only in a pull request titled `contract:` that all three of us agree to first.

## Working with your agent

1. Tell your agent which slice you own. It reads `CLAUDE.md` and your slice's `CLAUDE.md` for the rules.
2. Work on a branch named `<yourname>/<topic>`. Open a pull request and merge when CI is green. No review needed.
3. Rebase on `main` about once an hour.
4. Before a rotation, update `docs/handoff/<slice>.md`.

## Data

`data/buildings.json` has approximate coordinates and rectangular footprints. `data/events.seed.json` is sample data. Both need replacing with real College Ave data.
````

- [ ] **Step 2: Write the handoff files**

`docs/handoff/map.md`:

```markdown
# Map handoff

## Works
- Mapbox map with 12 extruded buildings, colored when an event is active at the slider's time.
- `mapController` (`flyTo`, `highlight`, `clearHighlight`, `setTime`).

## Broken or missing
- Building coordinates are approximate; footprints are rectangles.
- No glow animation, beacons, play button, or building panel yet.

## Where things live
- `client/src/map/index.tsx`: map setup and controller. `time.ts`: slider math. `geo.ts`: GeoJSON conversion.
```

`docs/handoff/ingest.md`:

```markdown
# Ingest handoff

## Works
- Nothing yet. `POST /api/ingest/*` answers 501.

## Broken or missing
- Everything in spec section 5. Start with the vertical slice: one flyer, Reader and Verifier, event saved.

## Where things live
- `server/src/ingest/router.ts`: server entry point. `client/src/ingest/index.tsx`: panel.
- Tables `raw_items` and `ingest_runs` already exist (`server/migrations/202610101800_init.sql`).
```

`docs/handoff/voice.md`:

```markdown
# Voice handoff

## Works
- Nothing yet. `/api/voice/*` answers 501.

## Broken or missing
- Everything in spec section 7. The ElevenLabs agent has not been created in the dashboard.

## Where things live
- `server/src/voice/router.ts`: server entry point. `client/src/voice/index.tsx`: panel.
```

- [ ] **Step 3: Final local verification**

Run: `npm test && npm run typecheck && git status --short`
Expected: tests pass, typecheck exits 0, and `.env` does not appear in the status output.

- [ ] **Step 4: Commit, push the branch, and open the pull request**

```bash
git add -A
git commit -m "docs: onboarding README and handoff notes"
git push -u origin minh/foundation
gh pr create --title "Foundation: workspace, contracts, API, map shell" --body "Implements docs/superpowers/plans/2026-10-10-foundation.md. Runs end to end with MOCK=1."
```

- [ ] **Step 5: Wait for CI and merge**

```bash
gh pr checks --watch
gh pr merge --squash --delete-branch
git switch main && git pull
```

Expected: the `check` job passes before merging. If `npm ci` fails in CI on a missing optional Rollup or esbuild binary, delete `node_modules` and `package-lock.json` locally, run `npm install`, commit the new lockfile, and push again.

- [ ] **Step 6: Invite teammates**

This needs the two GitHub usernames from the repo owner. For each:

```bash
gh api -X PUT repos/mlhv/RUConnect/collaborators/<username> -f permission=push
```

Expected: a JSON invitation object. If the usernames have not been provided, skip this step and report that invites are still pending.

- [ ] **Step 7: Report**

State what was verified (test counts, CI result, whether the map was seen with a real token, whether the Postgres integration test ran) and what was not, and list what the team still has to supply: Tiger `DATABASE_URL`, Mapbox token, Gemini key, ElevenLabs key and agent id, real building coordinates, real events.
