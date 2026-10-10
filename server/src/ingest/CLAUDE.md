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
