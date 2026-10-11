# Voice handoff

For a fresh session picking up Slice C (voice). Owner: `mlhv`. First written Oct 10, 2026; updated Oct 11 after the slice was built.

To start a new session, open Claude Code in this repo and say:

> I own Slice C (voice). Read `docs/handoff/voice.md` first.

## Goal

A user presses a mic button and asks something like "I'm free until 4, I like robotics and free food, what's near the library?". An ElevenLabs Conversational AI agent searches our events, answers out loud, and the map flies to the building it recommends. Design: spec section 7 (`docs/superpowers/specs/2026-10-10-campus-events-design.md`).

Feature freeze is 11:30 AM Sunday Oct 11 (moved from 9:00 AM). The demo needs one reliable question-to-fly-to exchange more than it needs breadth.

## State right now

Updated Oct 11, 2026. All ten tasks of the plan are done.

What works:
- `POST /api/voice/search`: body `{ query, from, to, category, freeFood: "prefer" | "require", nearBuildingId }`, all optional, returns `{ matches, later }`. Each hit is `{ event, distanceM, endsAfterWindow, matchesQuery }`. Ranking is the pure `rankEvents` in `server/src/voice/rank.ts`; weights are named constants at the top.
- Semantic search on the Tiger Data service, for the Tiger sponsor prize. With `MOCK=0`, `GEMINI_API_KEY`, and `GEMINI_EMBED_MODEL` set, `/search` embeds the query, pgvector compares it with `events.embedding` (`1 - (embedding <=> query)`), and the similarity joins the ranking as `WEIGHTS.semantic`. An event at or above `SEMANTIC_MATCH` counts as matching the query even with no shared word. Search embeds and stores any candidate event that has no embedding, so it does not wait on the ingest slice. The response shape is unchanged. The SQL and the embedding call are covered by fakes in the tests and were run by hand against the Tiger service on Oct 11.
- `GET /api/voice/session`: returns `{ signedUrl, now }`, or `503 voice_unavailable` without credentials, or `502 voice_upstream` when ElevenLabs refuses. The API key never leaves the server.
- The panel (`client/src/voice/index.tsx`): Talk, Mute, End, a live transcript, typed input sent to the agent while connected, and text mode with a typed fallback when voice is unavailable.
- The live agent, run by the owner against the demo script on Oct 11: it searches, moves the map, recommends only returned events, and finds an event read from an uploaded flyer.

Where things live (`client/src/voice/` unless noted):
- `agent/prompt.md`, `agent/tools.json`: the source of truth for the dashboard agent. `agent/toolContract.test.ts` ties `tools.json` to `toolSchemas.ts`.
- `tools.ts`: `find_events` and `focus_event`. Neither can throw. `formatResults.ts`: the text the agent reads. `demoClock.ts`: the date correction below.
- `fallback.ts`, `resolveBuilding.ts`: the typed path. `transcript.ts`: the transcript reducer; it strips the agent's `[excited]`-style delivery tags.
- `searchApi.ts`, `sessionApi.ts`: the two HTTP calls. Server: `server/src/voice/{schema,rank,router,session}.ts`, plus `semantic.ts` (the SQL) and `embed.ts` (the Gemini embedding call).

Demo setup:
- `.env`: `ELEVENLABS_API_KEY` (scope: ElevenAgents write), `ELEVENLABS_AGENT_ID`, `DEMO_NOW=2026-10-10T13:30:00-04:00`. `MOCK=1` is enough, including the flyer line. Restart `npm run dev` after editing `.env`; check with `curl -s localhost:3001/api/config`.
- Script: (1) "I'm free until 4, I like robotics and free food, what's near the library?" gives the Robotics Club Build Session at the Student Center. (2) "Anything after 4?" gives the Robotics Team Demo and Scrimmage. (3) "What's cool on campus tonight?" gives a varied evening pick. (4) Upload `data/captures/test-flyers/1-clean-robotics.png`, then "Any robotics events later this week?" gives the Robotics Club Interest Meeting, Thursday 7 PM, Scott Hall.

Dashboard lessons from the first setup:
- Dashboard edits are a draft until **Publish** is pressed (orange dot on the button). An unpublished agent answers with no tools and no prompt.
- Create the client tools from the agent's own Tools page so they are attached to it; "Wait for response" on; raise the response timeout from the 1 second default.
- Changing the prompt means pasting all of `agent/prompt.md` and publishing. Changing a tool means changing `agent/tools.json`, `toolSchemas.ts`, and the dashboard together.
- Rollback: once the script passes, duplicate the agent and leave the copy untouched. Rolling back is setting `ELEVENLABS_AGENT_ID` to the copy's id and restarting the server.

Known behaviour and gaps:
- With `DEMO_NOW` set, the agent's model writes dates from the real day, not the demo day. `demoClock.ts` moves those dates onto the demo day inside `find_events`. Side effect: with a one-day gap a correct demo date and a real-clock date cannot be told apart, so every correctly dated time on or after the real today is moved back a day ("what's on Thursday?" can search Wednesday). A window whose end would land before its start keeps its original end, so "tonight until midnight" still works.
- The typed fallback does not understand times. When the top pick shares no interest word with the question it says "Nothing matches that exactly. The top pick coming up is …".
- If the agent ends a call itself the panel returns to Talk with no message; only an error disconnect switches to text mode.
- Not verified by an agent session: the map highlight and fly-to on screen (no Mapbox token on the machine that ran the checks), whether `openBuilding` opens a panel, whether `setTime` moves the slider, and the browser's read-aloud in text mode.
- Semantic search: `SEMANTIC_FLOOR`, `SEMANTIC_FULL`, `SEMANTIC_MATCH`, and `WEIGHTS.semantic` in `rank.ts` were set on Oct 11 from `gemini-embedding-001` scores over the 16 seed events on the Tiger service; a different embedding model needs them measured again. A search takes about 0.4 seconds longer. The first search after a seed embeds every event in the window (about 1.8 seconds for 16) and may pass the 2 second limit; that search ranks on words and the next one is semantic. A query made only of filler words ("something cool") skips the embedding.
- Deferred review notes are listed in the description of the pull request titled "voice: live tuning and handoff".

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

The build followed `server/src/voice/docs/2026-10-10-voice-plan.md` (design: `server/src/voice/docs/2026-10-10-voice-design.md`). Tasks 1 to 10 are done. Semantic search (design section 9, step 6) was built on Oct 11 outside that plan. What remains is the showcase submission.

## ElevenLabs specifics

Checked against the ElevenLabs documentation and the installed `@elevenlabs/react` 1.17.0 types on Oct 10 to 11, 2026.

- Signed URL: `GET https://api.elevenlabs.io/v1/convai/conversation/get-signed-url?agent_id=<id>` with header `xi-api-key`, returning `{ "signed_url": "wss://..." }`.
- Browser: `ConversationProvider` with `useConversationControls` (`startSession`, `endSession`, `sendUserMessage`), `useConversationStatus`, `useConversationMode`, `useConversationInput`. `startSession` takes `signedUrl`, `dynamicVariables`, `clientTools`, `onMessage`, `onError`, `onDisconnect`, and returns nothing.
- Client tool handlers receive the parameters object; the string they return goes back to the agent. Tool and parameter names are case-sensitive.
- Dynamic variables sent at session start: `current_time`, `current_iso`, `buildings`. The dashboard's own test call does not supply them and cannot run client tools; test through the app.
- Microphone permission only works on `localhost` or HTTPS.

## Dashboard setup (needs a person with the ElevenLabs account)

1. Create an agent. System prompt: the whole of `client/src/voice/agent/prompt.md`. First message: something short, such as "Hey, I'm RUConnect. What are you looking for?".
2. On the agent's Tools page add two client tools exactly as in `client/src/voice/agent/tools.json`, with "Wait for response" on.
3. Publish. Put the agent id and an API key in `.env` and share both with teammates outside git.

## Known gaps outside this slice

- `mapController.openBuilding` is a no-op until the map owner builds the building panel. Call it anyway.
- The map needs `VITE_MAPBOX_TOKEN` to render. The owner has run the voice demo with it; the agent sessions that built this slice never saw the map on screen.
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
