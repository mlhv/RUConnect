# Slice C: Voice (client)

Owner: mlhv (update this line at each rotation). Server rules: `server/src/voice/CLAUDE.md`.

- `VoicePanel` in `index.tsx` is mounted by `app/App.tsx`. Replace its body.
- Drive the map only through `mapController` from `client/src/app/mapController.ts` (`highlight`, `flyTo`, `openBuilding`, `setTime`). `focus_event` calls `flyTo` then `openBuilding`.
- Search is at `POST /api/voice/search`.
- To build: mic button and transcript with `@elevenlabs/react`, client tools `find_events` and `focus_event`, and the text fallback using `speechSynthesis`.
