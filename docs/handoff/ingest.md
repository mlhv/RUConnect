# Ingest handoff

## Works
- **Multi-agent ingest.** Each item goes through a team of Gemini agents, shown live as chips in the swarm panel:
  - **Scout** (`scout.ts`): for a Rutgers events site, reads the listing and decides which event detail pages to open, using an `open_event_page` tool (same site only, at most 4 pages). For a flyer, it just hashes the image.
  - **Reader** (`reader.ts`): extracts zero or more events from a flyer, listing, or detail page, tagging each with its campus.
  - **Critic** (`critic.ts`, the `verifier` chip): checks each read against the source and sends concrete mistakes or missed events back to the Reader for one second read (the `reconciler` chip). It only runs on pieces with College Ave events.
  - **Verifier rules** (`verifier.ts`): keep College Ave events with a known building and time, and publish at confidence ≥ 0.8.
  - **Deduper** (`deduper.ts`): drops events already on the map. An identical title in the same building within 2 hours is a duplicate; for different titles, Gemini decides.
- **Sources:** flyer upload or photo, and `POST /api/ingest/runs` with `{"capture": "board"}` to scrape the public Rutgers event sites in `sites.ts`. Unchanged listings are skipped without any model calls. An optional schedule is `INGEST_SCRAPE_EVERY_MIN` (off by default).
- Real run on Oct 10 (`gemini-3.1-flash-lite`, Zimmerli plus 2 test flyers): the Scout opened 2 detail pages for events whose listing lacked a building, which picked up a room ("Lower Dodge Gallery"). The Critic approved 23 reads and flagged 1. The Deduper caught 2 duplicates. 28 events were saved.
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
- Cost: a flyer is 2 to 3 calls (Reader, Critic, sometimes Deduper), about $0.005. A site scrape is about 10 to 20 calls. A free-tier key (20 calls a day per model) runs out after roughly one site, so the demo key needs billing.
- `newbrunswick.rutgers.edu/events` and `masongross.rutgers.edu` are behind a Cloudflare bot check. They're left out on purpose; don't try to get around it.
- Instagram: planned via the Apify Instagram Scraper, after the app works end to end.

## Where things live
- `server/src/ingest/`: `router.ts` (routes, schedule), `swarm.ts` (orchestrator: runs the agents and streams their steps), the agents `scout.ts`, `reader.ts`, `critic.ts`, `deduper.ts`, plus `verifier.ts` (rules), `sites.ts` and `html.ts` (fetching and HTML to text), `gemini.ts` (JSON calls, the tool loop, timeout, backoff, token log), `cache.ts`, `cli.ts` (run the team on real flyers or `--sites`, `--save` to cache flyers).
- Tests use `testGemini.ts`, a scripted fake Gemini that tells agents apart by their prompts.
- `client/src/ingest/index.tsx`: Upload, Take photo, and Scrape buttons; one row per item with agent chips and the newest agent message; review buttons.
- Tables `raw_items` and `ingest_runs` already exist (`server/migrations/202610101800_init.sql`).
