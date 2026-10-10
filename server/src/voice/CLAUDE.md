# Slice C: Voice (server)

Owner: mlhv (update this line at each rotation).

Owns `server/src/voice/` and `client/src/voice/`. Design: spec section 7.

- Entry point: `voiceRouter(deps)` in `router.ts`, mounted at `/api/voice`. Replace its body; do not edit `core/app.ts`.
- Routes to build: `GET /session` (short-lived ElevenLabs conversation credential; the API key never leaves the server) and `POST /search` (`{query, from, to, freeFood, nearBuildingId}` to ranked events).
- The spec lists search at `/api/events/search`; it lives at `/api/voice/search` so this slice owns it without touching core.
- With `MOCK=1`, search filters `deps.store.listEvents` by time, flag, and keyword. With a database, add vector similarity on `events.embedding` through `deps.pool`.
