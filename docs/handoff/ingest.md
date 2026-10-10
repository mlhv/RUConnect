# Ingest handoff

## Works
- Vertical slice: upload flyer photos, Scout (hash and store), Reader (Gemini vision, structured JSON), Verifier, event saved, building glows and the camera flies to it.
- `POST /api/ingest/runs`: multipart field `files` (jpeg, png, webp, heic; up to 10 files, 10 MB each), optional `caption`. Returns `202 {runId, items: [{itemId, name}]}`.
- `GET /api/ingest/runs/:id/stream`: Server-Sent Events. `event: step` carries a `SwarmStep`, `event: event` carries `{itemId, event}` for each saved event, and `event: done` carries the run summary. The stream ends after `done`. Joining late replays everything sent so far.
- Confidence of at least 0.8 publishes; anything lower is saved as `needs_review`. The panel has a "Publish anyway" button for those.
- Demo fallback: `MOCK=1`, or no Gemini key, replays `data/extraction.cache.json` by image hash. A Gemini error on a cached image also replays.
- Each Gemini call logs its token counts to the server console.

## Broken or missing
- `data/extraction.cache.json` is empty. Fill it with `npx tsx server/src/ingest/cli.ts <images> --save`, then check the entries by hand.
- Not built yet: the Reader's second read for low-confidence photos, Reconciler, Locator, Deduper, embeddings, Instagram and board captures (`{capture}` answers 501), and a full edit form for `needs_review`.
- `events.embedding` is not written yet, so these events won't show up in vector search.

## Where things live
- `server/src/ingest/`: `router.ts` (routes), `swarm.ts` (orchestrator and run stream), `reader.ts`, `verifier.ts`, `gemini.ts` (client, backoff, token log), `cache.ts`, `cli.ts` (test real flyers, fill the cache).
- `client/src/ingest/index.tsx`: upload buttons, swarm rows, review button.
- Tables `raw_items` and `ingest_runs` already exist (`server/migrations/202610101800_init.sql`).
