# Ingest handoff

## Works
- Nothing yet. `POST /api/ingest/*` answers 501.

## Broken or missing
- Everything in spec section 5. Start with the vertical slice: one flyer, Reader and Verifier, event saved.

## Where things live
- `server/src/ingest/router.ts`: server entry point. `client/src/ingest/index.tsx`: panel.
- Tables `raw_items` and `ingest_runs` already exist (`server/migrations/202610101800_init.sql`).
