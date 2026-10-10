# Slice C: Voice (client)

Owner: P3 (update this line at each rotation). Server rules: `server/src/voice/CLAUDE.md`.

- `VoicePanel` in `index.tsx` is mounted by `app/App.tsx`. Replace its body.
- Drive the map only through `mapController` from `client/src/app/mapController.ts` (`highlight`, `flyTo`, `setTime`).
- To build: mic button and transcript with `@elevenlabs/react`, client tools `find_events` and `focus_event`, and the text fallback using `speechSynthesis`.
