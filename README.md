# RUConnect

A 3D map of every event on Rutgers College Ave. An agent swarm turns flyers, Instagram posts, and event-board pages into events; buildings glow when something is happening; a voice assistant picks events and flies the camera to them.

Built at HackRU, Oct 10 to 11, 2026. Design: [`docs/superpowers/specs/2026-10-10-campus-events-design.md`](docs/superpowers/specs/2026-10-10-campus-events-design.md).

## Setup

Needs Node 22.12 or newer.

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
| A: Map | `client/src/map/`, `data/buildings.json` | P1 |
| B: Ingest | `server/src/ingest/`, `client/src/ingest/`, `data/captures/`, `data/extraction.cache.json` | P2 |
| C: Voice | `server/src/voice/`, `client/src/voice/` | P3 |

`shared/`, `server/src/core/`, `client/src/app/`, and root config are frozen: change them only in a pull request titled `contract:` that all three of us agree to first.

## Working with your agent

1. Tell your agent which slice you own. It reads `CLAUDE.md` and your slice's `CLAUDE.md` for the rules.
2. Work on a branch named `<yourname>/<topic>`. Open a pull request and merge when CI is green. No review needed.
3. Rebase on `main` about once an hour.
4. Before a rotation, update `docs/handoff/<slice>.md`.

## Data

`data/buildings.json` has approximate coordinates and rectangular footprints. `data/events.seed.json` is sample data. Both need replacing with real College Ave data. `data/events.seed.json` is shared: anyone may add events to it (add your own entries, do not edit or delete someone else's; on a merge conflict keep both sides). The schemas of both files (`BuildingSeedSchema`, `SeedEventSchema`) are frozen.
