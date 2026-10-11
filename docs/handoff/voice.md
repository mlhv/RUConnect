# Voice handoff

For a fresh session picking up Slice C (voice). Owner: `mlhv`. Written Oct 10, 2026, before any voice code exists.

To start a new session, open Claude Code in this repo and say:

> I own Slice C (voice). Read `docs/handoff/voice.md` and build it in the order it gives.

## Goal

A user presses a mic button and asks something like "I'm free until 4, I like robotics and free food, what's near the library?". An ElevenLabs Conversational AI agent searches our events, answers out loud, and the map flies to the building it recommends. Design: spec section 7 (`docs/superpowers/specs/2026-10-10-campus-events-design.md`).

Feature freeze is 9:00 AM Sunday Oct 11. The demo needs one reliable question-to-fly-to exchange more than it needs breadth.

## State right now

- No voice code exists yet. The design and the task-by-task plan are written: `server/src/voice/docs/2026-10-10-voice-design.md` and `server/src/voice/docs/2026-10-10-voice-plan.md`. Follow the plan; where it differs from "Build order" below, the plan wins.
- `/api/voice/*` answers 501 (`server/src/voice/router.ts`). `VoicePanel` is a placeholder (`client/src/voice/index.tsx`).
- The session endpoint needs a `contract:` pull request first: the frozen `server/src/core/app.test.ts` asserts that `GET /api/voice/session` answers 501.
- The ingest slice merged its flyer reader (pull request 4). Events it saves are searchable as soon as they are `published`. It does not write `events.embedding` and has no deduper, so one flyer uploaded twice is two events; the voice ranking collapses those.
- The ElevenLabs agent has not been created in the dashboard. No `ELEVENLABS_API_KEY` or `ELEVENLABS_AGENT_ID` is in anyone's `.env` yet.
- `@elevenlabs/react` is already installed in `client/`. No ElevenLabs server SDK is installed; the one server call needed is a plain `fetch`.
- The app runs with `MOCK=1` on 12 sample events dated Oct 10 to 11, 2026. Set `DEMO_NOW` (for example `2026-10-10T19:30:00-04:00`) so "tonight" means something.

## What you own and what you may touch

- Yours: `server/src/voice/`, `client/src/voice/`, this file, `docs/showcase/`.
- Frozen (needs a `contract:` pull request agreed by all three): `shared/`, `server/src/core/`, `client/src/app/`, root config, all `package.json` files. Read them freely; do not edit them.
- `main` is protected on GitHub: no direct pushes, a pull request with the `check` CI job passing is required. Work on `mlhv/<topic>` branches, `gh pr create`, merge when green. Full rules: root `CLAUDE.md`.

## What already exists for you to use

Server, passed to `voiceRouter(deps)`:
- `deps.store.listEvents({ from, to, buildingId, status })` returns `CampusEvent[]` overlapping the window, sorted by start. `deps.store.listBuildings()` returns `Building[]` with `id`, `name`, `aliases`, `lng`, `lat`.
- `deps.config.elevenLabsApiKey`, `deps.config.elevenLabsAgentId`, `deps.config.geminiApiKey`, `deps.config.geminiEmbedModel`, `deps.config.demoNow`, `deps.config.mock`.
- `deps.pool` is a `pg.Pool`, or `null` in mock mode. Table `events` has an `embedding vector(768)` column that is empty until the ingest slice fills it.
- `parse(schema, data)` and `HttpError` from `server/src/core/http.ts` for validated input and 4xx responses.
- `testFixture()` from `server/src/core/testFixture.ts` gives a small fixed dataset for tests; see `server/src/core/app.test.ts` for the supertest pattern.

Client:
- `mapController` from `client/src/app/mapController.ts`: `flyTo(buildingId)`, `openBuilding(buildingId)`, `highlight(buildingIds)`, `clearHighlight()`, `setTime(iso)`. Safe to call before the map exists.
- `useEventsStore` from `client/src/app/eventsStore.ts`: `buildings`, `events`, `selectedTime`.
- Types and schemas from `@ruconnect/shared`: `CampusEvent`, `CampusEventSchema`, `Building`.

## Build order

Each step is usable without the next, so stop wherever time runs out.

1. **Search endpoint.** `POST /api/voice/search` with body `{ query, from?, to?, freeFood?, nearBuildingId? }`, validated by a zod schema defined inside `server/src/voice/`. Returns `CampusEvent[]`, best first, at most 5. Put the ranking in a pure function in its own file with unit tests: filter by time window and `freeFood`, score by query words found in title, description, tags, and category, and boost events in or close to `nearBuildingId` (distance from building `lng`/`lat`). Only `published` events.
2. **Text fallback UI.** In `VoicePanel`: a text box that posts to search, then calls `mapController.highlight` on the result buildings, `setTime` to the earliest result's start, `flyTo` and `openBuilding` on the top result, and reads a one-sentence answer with `speechSynthesis`. This is the spec's fallback and it proves the whole map reaction without ElevenLabs.
3. **Tool functions.** Extract what step 2 does into two plain functions in `client/src/voice/`, unit tested with a mocked `fetch` and `mapController`:
   - `findEvents({ query, from, to, freeFood, nearBuildingName })`: resolve `nearBuildingName` to a building id by matching `name` and `aliases` case-insensitively against `useEventsStore.getState().buildings`, call search, highlight and set the time, and return a compact string or list (title, building name, start and end time, free food) for the agent to speak from. Include each event's `id`.
   - `focusEvent({ eventId })`: look the event up, then `flyTo` and `openBuilding` its building. Return a short confirmation.
4. **Session endpoint.** `GET /api/voice/session` returns a short-lived credential for the browser. The API key stays on the server. Answer 503 with a clear error when the key or agent id is missing, so the client can fall back to step 2.
5. **Agent in the dashboard** (a person does this, see below), then **the mic UI**: connect with `@elevenlabs/react`, register `find_events` and `focus_event` as client tools, show connection status and a live transcript, and fall back to the text box if the session request or connection fails.
6. **Semantic search**, only if the ingest slice has filled `events.embedding` and time allows: embed the query with Gemini and order by vector distance through `deps.pool`, keeping the keyword path for mock mode.

## ElevenLabs specifics

These are from memory and were not checked against current documentation. Verify each against the ElevenLabs docs before relying on it.

- Signed URL for a private agent: `GET https://api.elevenlabs.io/v1/convai/conversation/get-signed-url?agent_id=<id>` with header `xi-api-key`, returning `{ "signed_url": "wss://..." }`.
- Browser: the `useConversation` hook from `@elevenlabs/react`, with `startSession({ signedUrl })`, a `clientTools` object mapping tool names to async functions that return a string, and callbacks such as `onMessage`, `onConnect`, `onDisconnect`, `onError`. It also exposes `status` and `isSpeaking`. The installed version is `^1.17.0`; check its README in `node_modules/@elevenlabs/react` for the exact shape.
- Microphone permission must be requested before starting a session, and it only works on `localhost` or HTTPS.
- Client tools must also be declared on the agent in the dashboard, with the same names and parameter schemas, and set to wait for the tool's response so the agent can read the returned events.
- The current time can be passed per session as a dynamic variable rather than hardcoded in the prompt.

## Dashboard setup (needs a person with the ElevenLabs account)

1. Create a Conversational AI agent. Copy its id into `.env` as `ELEVENLABS_AGENT_ID`, and an API key as `ELEVENLABS_API_KEY`. Share both with teammates outside git.
2. Add two client tools:
   - `find_events`: `query` (string, required), `from` and `to` (ISO 8601 datetime with offset, optional), `freeFood` (boolean, optional), `nearBuildingName` (string, optional).
   - `focus_event`: `eventId` (string, required).
3. System prompt, as a starting point:

   > You are RUConnect, a friendly guide to events on the Rutgers College Avenue campus. The current time is {{current_time}} in America/New_York. Always call find_events before recommending anything; never invent events. Turn what the student says into a short search query, a time window, and a nearby building if they mention one. Recommend one or two events in a sentence or two each: what, where, when, and whether there is free food. Then call focus_event with the id of your top pick so the map flies there. If nothing matches, say so and suggest widening the time or interests. Buildings: Rutgers Student Center, Alexander Library, Scott Hall, Academic Building, College Avenue Gym, Voorhees Hall, Zimmerli Art Museum, The Yard, Murray Hall, Brower Commons, Honors College, Kirkpatrick Chapel.

## Known gaps outside this slice

- `mapController.openBuilding` is a no-op until the map owner builds the building panel. Call it anyway.
- The map has not been seen rendering in a browser yet. Check it with a Mapbox token before debugging voice-to-map behavior.
- Building coordinates are approximate, so "near" is rough until the map owner corrects `data/buildings.json`.
- The seed events are samples and will be replaced; do not write tests against `data/events.seed.json`, use `testFixture()`.

## Conventions that will bite

- Tests are logic tests in `*.test.ts` under vitest; `.test.tsx` files are not run and there is no DOM test environment. Keep logic in plain `.ts` files and components thin.
- Slice styles go in a `.css` file inside `client/src/voice/`, not in `client/src/app/app.css`.
- Compare times as instants (`Date.parse`), never as strings: mock mode returns `-04:00` strings and Postgres returns `Z` strings.
- Adding a dependency touches frozen `package.json` files: announce it in team chat first.

## Before the hackathon submission

The ElevenLabs prize requires a pull request to `elevenlabs/showcase`. Drafts and a checklist are in `docs/showcase/README.md`. It needs a working voice demo, a demo or video link, a cover image, and each author's details.

## Update this file

Before a rotation or at the end of a session, replace "State right now" with what works, what is broken, and where things live.
