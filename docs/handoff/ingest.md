# Ingest handoff

## Works
- Vertical slice: upload or photograph a flyer, Scout (hash and store), Reader (Gemini vision, structured JSON), Verifier, event saved, building glows and the camera flies to it.
- `POST /api/ingest/runs`: multipart field `files` (jpeg, png, webp, heic; up to 10 files, 10 MB each), optional `caption`. Returns `202 {runId, items: [{itemId, name}]}`.
- `GET /api/ingest/runs/:id/stream`: Server-Sent Events. `event: step` carries a `SwarmStep`, `event: event` carries `{itemId, event}` for each saved event, and `event: done` carries the run summary. The stream ends after `done`. Joining late replays everything sent so far.
- Confidence of at least 0.8 publishes; anything lower is saved as `needs_review`. The panel has a "Publish anyway" button for those. A flyer with only a start time gets end = start + 1 hour and is not sent to review for that alone.
- Only College Ave buildings in `data/buildings.json` are accepted; anything else (e.g. Busch) is rejected.
- Demo fallback: `MOCK=1`, or no Gemini key, replays `data/extraction.cache.json` by image hash. A Gemini error on a cached image also replays.
- Gemini calls time out after 30 s and retry up to 3 times on rate limits, server errors, and dropped connections. Each call logs its token counts (about 1,650 in and 220 out per flyer, about $0.002).

## Test flyers
- `data/captures/test-flyers/` has 5 synthetic flyers: clean, tilted, dim, blurry and creased, and off-campus (Busch). Real Gemini (`gemini-3.8-flash`) reads all four College Ave ones correctly and rejects Busch. Their results are in the cache, so `MOCK=1` users can upload them and watch buildings light up.
- Rerun them after any prompt change: `npx tsx server/src/ingest/cli.ts data/captures/test-flyers/*.png`

## TODO before the demo: billing on the Gemini key
A free-tier key allows only 20 flyer reads per day per model (`gemini-3.8-flash`) and gets 504s under load. Ben's key hit the limit on Oct 10. Link the key's project to a billing account in AI Studio before the demo, or live reads will fail and only cached flyers will work.

## TODO before the demo: real flyer photos
1. Take 5 to 10 phone photos of real flyers on College Ave, including some messy ones (glare, angles, crumpled, partly covered).
2. Put them in `data/captures/demo-flyers/`.
3. Run `npx tsx server/src/ingest/cli.ts data/captures/demo-flyers/* --save` with `GEMINI_API_KEY` set. This reads each one and saves the good results to `data/extraction.cache.json`.
4. Open the cache file and fix any wrong field by hand. Commit the photos and the cache.
5. In the live demo, upload one of these exact photos. If Gemini or the Wi-Fi fails, the cache replays it and the demo still works. A new photo taken on stage has no fallback.

## Broken or missing
- Not built yet: the Reader's second read for low-confidence photos, Reconciler, Locator, Deduper, embeddings, Instagram and board captures (`{capture}` answers 501), and a full edit form for `needs_review`.
- `events.embedding` is not written yet, so these events won't show up in vector search.
- Branch `ben/site-scraping` holds a parked version that scrapes public Rutgers event pages. It's not merged; ask Ben before using it.

## Where things live
- `server/src/ingest/`: `router.ts` (routes), `swarm.ts` (orchestrator and run stream), `reader.ts`, `verifier.ts`, `gemini.ts` (client, timeout, backoff, token log), `cache.ts`, `cli.ts` (test real flyers, fill the cache).
- `client/src/ingest/index.tsx`: Upload and Take photo buttons, swarm rows, review button.
- Tables `raw_items` and `ingest_runs` already exist (`server/migrations/202610101800_init.sql`).
