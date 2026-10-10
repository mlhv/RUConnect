# RUConnect: Design Spec

Date: 2026-10-10. Event: HackRU, 18 hours from 6:15 PM Oct 10, feature freeze 9:00 AM Oct 11, submit by 11:30 AM.
Source brief: `brainstorm.md` (copied into the repo root). Where this spec and the brief disagree, this spec wins.

## 1. Goal

A web app that shows every event on Rutgers College Ave on a 3D map. An agent swarm turns flyers, Instagram posts, and event-board pages into structured events. Buildings glow when something is happening, a time slider scrubs through the day, and a voice assistant answers "what should I do?" by picking events and flying the camera to them.

Success is a 2-minute live demo that shows, in order: glowing map, time slider, a crumpled flyer photo becoming a glowing building while the swarm works on screen, and a voice question that ends with a camera fly-to and a spoken answer.

### Changes from the brief

| Brief | This spec |
|---|---|
| React Three Fiber scene, schematic grid campus | Mapbox GL JS, real College Ave buildings |
| Gemini Live voice | ElevenLabs Conversational AI agent with client tools |
| Single `/extract` call per flyer | Multi-worker ingestion swarm over three source types |
| JSON file store | Tiger Data Postgres with `pgvector` |
| JavaScript | TypeScript |

### Out of scope

Live scraping of Instagram or the event board, user accounts, notifications, the ambient-audio "energy" signal, accessibility routes, personalization, campuses other than College Ave. These are the pitch roadmap.

## 2. Architecture

One repo, npm workspaces, three packages:

- `shared/`: zod schemas, inferred TypeScript types, API route types, the map controller interface. No runtime dependencies beyond zod.
- `server/`: Express. Owns the database, the Gemini and ElevenLabs keys, the swarm orchestrator, and in production serves the built client.
- `client/`: React, Vite, Mapbox GL JS, zustand for state, `@elevenlabs/react` for voice.

Tests use vitest. `npm run dev` at the root starts server and client together.

Deployment is one web service (build client, start server) plus the Tiger database. Keys for Gemini, ElevenLabs, and the database stay on the server. Only the Mapbox public token is sent to the browser.

### Environment variables (`.env.example`)

```
GEMINI_API_KEY=
GEMINI_VISION_MODEL=        # set during foundation hour
GEMINI_EMBED_MODEL=         # 768-dimension output
ELEVENLABS_API_KEY=
ELEVENLABS_AGENT_ID=
DATABASE_URL=               # shared Tiger service
DB_SCHEMA=dev_yourname      # unique per person; production uses "prod"
VITE_MAPBOX_TOKEN=
MOCK=0                      # 1 = fixtures instead of Gemini, ElevenLabs, and Postgres
SWARM_CONCURRENCY=4
DEMO_NOW=                   # optional ISO time the app treats as "now"
```

## 3. Data model

One Tiger service on the free tier. Each developer and production get a separate Postgres schema named by `DB_SCHEMA`; the server sets `search_path` to `<DB_SCHEMA>, public` on every connection. The `vector` extension is installed once in `public`. Free-tier limits have not been verified; if separate services or forks turn out to be available, only `DATABASE_URL` changes.

Migrations are plain SQL files in `server/migrations/`, named `YYYYMMDDHHMM_description.sql`, applied in name order by `npm run db:migrate` and recorded in a `_migrations` table. `npm run db:setup` creates the schema, migrates, and loads seeds. `npm run db:reset` drops and rebuilds the caller's own schema only, and refuses to run when `DB_SCHEMA=prod`.

**`buildings`**: `id` (slug), `name`, `aliases text[]`, `lng`, `lat`, `footprint jsonb` (GeoJSON polygon), `height_m`. Seeded from `data/buildings.json`, about 12 College Ave buildings.

**`raw_items`**: `id`, `run_id`, `source_type` (`upload | instagram | board`), `source_ref` (filename, post URL, or page URL), `content_hash` (unique), `mime`, `bytes bytea`, `caption text`, `status` (`queued | processing | done | failed`), `error`, `created_at`. Image bytes live in Postgres so the deployed service needs no disk.

**`events`**: the brief's fields (`id`, `title`, `description`, `category`, `building_id`, `room`, `start_at`, `end_at`, `expected_attendance`, `tags text[]`, `free_food`) plus `source` (`flyer | instagram | board | manual | seed`), `status` (`published | needs_review`), `confidence real`, `embedding vector(768)`, `raw_item_ids uuid[]`, `created_at`. Indexed on `(start_at, end_at)` and on `building_id`. The API maps columns to the camelCase event schema in `shared/`.

**`ingest_runs`**: `id`, `status`, `started_at`, `finished_at`, counts of items, events created, duplicates merged, sent to review.

Seeds: `data/events.seed.json` holds 25 or more real College Ave events dated Oct 10 to 12, 2026, hand-entered by the team.

## 4. HTTP API

All routes are under `/api`. Request and response shapes are zod schemas in `shared/`.

| Route | Purpose |
|---|---|
| `GET /buildings` | All buildings with footprints |
| `GET /events?from=&to=&buildingId=&status=` | List events; default `status=published` |
| `POST /events` | Create a manual event |
| `PATCH /events/:id` | Edit or approve a `needs_review` event |
| `GET /events/activity?from=&to=&bucket=30m` | Per-building active-event counts per time bucket, using `time_bucket` |
| `POST /events/search` | `{query, from, to, freeFood, nearBuildingId}` to ranked events: time and flag filters, then vector similarity on the query embedding |
| `POST /ingest/runs` | Start a run from multipart image uploads, or `{capture: "instagram" \| "board"}` |
| `GET /ingest/runs/:id/stream` | Server-Sent Events of worker steps |
| `GET /voice/session` | Short-lived ElevenLabs conversation credential for the browser |

## 5. Ingestion swarm

The orchestrator is an in-process job queue in `server/src/ingest/`. Each worker is a function with one job, typed input and output, and no knowledge of other workers. At most `SWARM_CONCURRENCY` Gemini calls run at once; rate-limit errors retry with backoff up to three times, then the item is marked `failed` and the run continues.

| Worker | Input to output | Model use |
|---|---|---|
| Scout | A source (upload batch, `data/captures/instagram/`, `data/captures/board/`) to `raw_items` rows, skipping known `content_hash` values | None |
| Reader | One raw item to a draft event with per-field confidence. Images that the first read marks low-confidence get a second read with a prompt tuned for damaged, angled, or dim photos | Gemini vision, structured JSON output |
| Reconciler | Two drafts to one, keeping agreeing fields and lowering confidence on disagreements | Gemini text, only when two reads exist |
| Locator | Free-text location to `building_id` and `room`, matching building names and aliases first | Gemini text only when no alias matches |
| Deduper | Draft to "new" or "merge into event X". Candidates are events in the same building starting within 2 hours with cosine similarity of at least 0.85 | Gemini embedding, plus Gemini text to confirm a candidate |
| Verifier | Checks the schema, that `end_at` is after `start_at`, and that the date is plausible. Overall confidence of at least 0.8 publishes; anything lower is saved as `needs_review` | None |

Every worker start, finish, and failure emits an SSE event `{runId, itemId, worker, state, summary}`. The client renders these as a live swarm panel, with one row per item and a chip per worker. A published event appears on the map as soon as it is saved.

`needs_review` events open in a confirm/edit form; saving publishes them.

**Captured feeds.** Instagram posts are saved by hand as `data/captures/instagram/<handle>/<n>.jpg` with a sibling `<n>.json` holding the caption and post URL. Event-board pages are saved as HTML in `data/captures/board/`; the Scout splits a page into one raw item per listing. The swarm processes these for real when triggered; nothing fetches Instagram or the board over the network.

**Demo fallback.** `data/extraction.cache.json` maps `content_hash` to a known-good final event. With `MOCK=1`, or when Gemini fails for an item present in the cache, the orchestrator replays the cached result through the same SSE steps.

## 6. Map

`client/src/map/` owns the Mapbox instance. Nothing outside that folder imports `mapbox-gl`.

- Base style with 3D terrain off and the stock building layer dimmed. Our buildings are drawn from `/api/buildings` footprints as a separate `fill-extrusion` layer, so each has a stable id that we control.
- A building is active when a published event overlaps the selected time. Active buildings take a category color and a pulsing emissive effect driven by feature state.
- A beacon column above each active building scales with total expected attendance.
- The time slider covers the current day in 15-minute steps and has a play button. "Now" is `DEMO_NOW` when set.
- Clicking a building opens a panel listing its events at the selected time.

Other slices reach the map only through the controller interface defined in `shared/` and exposed from a zustand store:

```ts
interface MapController {
  flyTo(buildingId: string): void;
  highlight(buildingIds: string[]): void;
  clearHighlight(): void;
  setTime(iso: string): void;
}
```

## 7. Voice

An ElevenLabs Conversational AI agent, configured once in the ElevenLabs dashboard, holds the conversation. The browser gets a session credential from `GET /api/voice/session` and connects with `@elevenlabs/react`. The UI is a mic button and a live transcript.

The agent has two client tools, implemented in `client/src/voice/`:

- `find_events({query, from, to, freeFood, nearBuildingName})` calls `POST /api/events/search`, highlights the matching buildings, sets the slider to the earliest result, and returns a compact list (title, building, time, free food) for the agent to speak from.
- `focus_event({eventId})` flies the camera to that event's building and opens its panel.

The agent prompt tells it the current date and time, the building names, and to always call `find_events` before recommending anything.

Fallback if the agent connection fails: a text box sends the same query to `/api/events/search`, the map reacts the same way, and the top result is read with the browser's `speechSynthesis`.

## 8. Repo layout and ownership

```
/
  brainstorm.md
  README.md
  CLAUDE.md                      # team rules for every agent
  .env.example
  .claude/settings.json          # shared permission allowlist
  .githooks/pre-push             # blocks direct pushes to main
  .github/workflows/ci.yml       # typecheck + test
  data/
    buildings.json  events.seed.json  extraction.cache.json
    captures/instagram/  captures/board/
  docs/
    superpowers/specs/  superpowers/plans/
    handoff/map.md  handoff/ingest.md  handoff/voice.md
  shared/src/                    # FROZEN: schemas, API types, MapController
  server/
    migrations/
    src/core/                    # FROZEN: db, config, app wiring, events routes
    src/ingest/  CLAUDE.md       # Slice B
    src/voice/   CLAUDE.md       # Slice C (session + search)
  client/src/
    app/                         # FROZEN: shell, layout, stores
    map/     CLAUDE.md           # Slice A
    ingest/  CLAUDE.md           # Slice B
    voice/   CLAUDE.md           # Slice C
```

| Slice | Owns | Starting owner |
|---|---|---|
| A: Map | `client/src/map/` | P1 |
| B: Ingest | `server/src/ingest/`, `client/src/ingest/`, `data/captures/` | P2 |
| C: Voice | `server/src/voice/`, `client/src/voice/` | P3 |

Ownership follows the brief's rotation: at each swap the outgoing owner updates `docs/handoff/<slice>.md` (what works, what is broken, where things live), and the slice's `CLAUDE.md` owner line changes.

### Rules that keep agents from clashing (written into `CLAUDE.md`)

1. Edit only inside the slice you currently own. Frozen areas (`shared/`, `server/src/core/`, `client/src/app/`, `server/migrations/`, root config) change only in a dedicated pull request titled `contract:` that all three people approve in chat before it merges.
2. Never push to `main`. Work on `<name>/<topic>` branches, open a pull request, and merge when CI is green. No review is required. Rebase on `main` before opening and at least once an hour.
3. Call other slices only through `shared/` types and the `MapController`. Never import from another slice's folder.
4. Use your own `DB_SCHEMA`. Never run `db:reset` against `prod`.
5. New migrations use the current timestamp in the filename. Never edit a merged migration.
6. Do not add dependencies without saying so in team chat. If `package-lock.json` conflicts, take `main`'s version and rerun `npm install`.
7. Develop with `MOCK=1` until the slice you depend on has merged.
8. Handoff notes go in your slice's file under `docs/handoff/`, never in the shared `README.md`.

## 9. Repository setup and inviting teammates

Done once by the repo owner (`mlhv`), as the first task of the implementation plan.

1. `git init` in the project folder; the spec is the first commit.
2. Scaffold the layout in section 8, including a foundation that runs end to end in `MOCK=1`: map renders seeded buildings, `/api/events` returns seeds, each slice folder has a stub and its `CLAUDE.md`.
3. Create the GitHub repo: `gh repo create mlhv/RUConnect --private --source . --push`. The name can be changed before this step.
4. Invite each teammate with write access: `gh api -X PUT repos/mlhv/RUConnect/collaborators/<username> -f permission=push`. This needs the two teammates' GitHub usernames. They accept from the email or from github.com/notifications.
5. Protect `main`. GitHub does not enforce branch protection on private repos under a free personal plan, so the baseline is the `pre-push` hook (enabled for everyone by an npm `prepare` script that sets `core.hooksPath`) plus CI on every pull request. If the repo is made public for submission, also add a ruleset requiring a pull request and a passing CI check.
6. Create the shared services and send the values to teammates outside git: one Tiger service (`DATABASE_URL`), one ElevenLabs agent (`ELEVENLABS_AGENT_ID` and API key), the Gemini key or one key each, and a Mapbox public token.
7. Run `npm run db:setup` once with `DB_SCHEMA=prod` for the deployed app.

Teammate onboarding, also in `README.md`:

```
gh repo clone mlhv/RUConnect && cd RUConnect
cp .env.example .env        # paste shared keys, set DB_SCHEMA=dev_<yourname>
npm install                 # also installs the pre-push hook
npm run db:setup
npm run dev
```

Then start Claude Code in the repo; it reads the root `CLAUDE.md` and the `CLAUDE.md` of whichever slice it is working in.

## 10. Error handling

- Gemini failure on an item: retry with backoff, then cache replay if available, otherwise the item is `failed` and shown as such in the swarm panel. A run never aborts because of one item.
- Invalid model output: zod validation failure counts as a failed attempt and is retried once with the validation error appended to the prompt.
- Database unreachable at client load: the client falls back to a bundled copy of the seed events and buildings, so the map and slider still work.
- Voice connection failure: the text fallback in section 7.

## 11. Testing

- Unit tests (vitest) for each swarm worker using fixture inputs and a stubbed Gemini client, the orchestrator's concurrency cap and failure isolation, the active-building calculation for a given time, and the zod schemas against the seed files.
- One integration test runs the full swarm in `MOCK=1` over a fixture flyer and asserts a published event.
- CI runs typecheck and tests on every pull request.
- A manual set of messy flyer photos (crumpled, angled, dim) in `data/captures/test-flyers/`, run against real Gemini during the first block; the results that pass go into `extraction.cache.json`.

## 12. Build order

1. Foundation: repo, scaffold, contracts, database, mock mode, GitHub, invites.
2. Vertical slice: upload one flyer, Reader and Verifier only, event saved, building glows.
3. In parallel by slice: remaining workers and swarm panel (B); glow, beacons, slider, building panel (A); ElevenLabs agent and tools (C).
4. Captured Instagram and board feeds, dedupe across sources.
5. Deploy, demo data, cached fallbacks, rehearsal.

Cut order if behind: board source, Instagram source, beacons, Reconciler second read. Never cut the glowing map, the live flyer upload, or the voice fly-to.
