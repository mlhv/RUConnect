# Slice C: Voice (server)

Owner: mlhv (update this line at each rotation).

Owns `server/src/voice/` and `client/src/voice/`. Design: `server/src/voice/docs/2026-10-10-voice-design.md`.

- Entry point: `voiceRouter(deps)` in `router.ts`, mounted at `/api/voice`. Do not edit `core/app.ts`.
- Routes: `POST /search`, body `{ query, from, to, category, freeFood: "prefer" | "require", nearBuildingId }`, returning `{ matches, later }`; and `GET /session`, returning `{ signedUrl, now }` (the API key never leaves the server).
- The spec lists search at `/api/events/search`; it lives at `/api/voice/search` so this slice owns it without touching core.
- Search filters `deps.store.listEvents` by publication, time window, and required food; query words only rank. The path is the same with or without `MOCK=1`. Vector similarity on `events.embedding` is not built.
