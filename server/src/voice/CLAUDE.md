# Slice C: Voice (server)

Owner: mlhv (update this line at each rotation).

Owns `server/src/voice/` and `client/src/voice/`. Design: `server/src/voice/docs/2026-10-10-voice-design.md`.

- Entry point: `voiceRouter(deps)` in `router.ts`, mounted at `/api/voice`. Do not edit `core/app.ts`.
- Routes: `POST /search`, body `{ query, from, to, category, freeFood: "prefer" | "require", nearBuildingId }`, returning `{ matches, later }`; and `GET /session`, returning `{ signedUrl, now }` (the API key never leaves the server).
- The spec lists search at `/api/events/search`; it lives at `/api/voice/search` so this slice owns it without touching core.
- Search filters `deps.store.listEvents` by publication, time window, and required food; query words only rank.
- Semantic search (`semantic.ts`, `embed.ts`) runs when there is a database, `GEMINI_API_KEY`, `GEMINI_EMBED_MODEL`, and a query: pgvector on the Tiger service compares the query's embedding with `events.embedding`, and `rankEvents` adds the similarity as the `semantic` weight and sets `semantic: true` on a hit found by similarity alone. Search itself embeds and stores any candidate event whose `embedding` is null. With `MOCK=1`, a missing key, an error, or a 2 second timeout, words rank alone.
