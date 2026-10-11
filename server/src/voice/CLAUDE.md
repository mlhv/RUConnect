# Slice C: Voice (server)

Owner: mlhv (update this line at each rotation).

Owns `server/src/voice/` and `client/src/voice/`. Design: spec section 7.

- Entry point: `voiceRouter(deps)` in `router.ts`, mounted at `/api/voice`. Do not edit `core/app.ts`.
- Routes: `POST /search`, body `{ query, from, to, category, freeFood: "prefer" | "require", nearBuildingId }`, returning `{ matches, later }`; and `GET /session`, returning `{ signedUrl, now }` (the API key never leaves the server).
- The spec lists search at `/api/events/search`; it lives at `/api/voice/search` so this slice owns it without touching core.
- With `MOCK=1`, search filters `deps.store.listEvents` by time, flag, and keyword. With a database, add vector similarity on `events.embedding` through `deps.pool`.
