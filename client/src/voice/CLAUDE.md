# Slice C: Voice (client)

Owner: mlhv (update this line at each rotation). Server rules: `server/src/voice/CLAUDE.md`.

- `VoicePanel` in `index.tsx` is mounted by `app/App.tsx`.
- Drive the map only through `mapController` from `client/src/app/mapController.ts` (`highlight`, `flyTo`, `openBuilding`, `setTime`). `focus_event` calls `flyTo` then `openBuilding`.
- Search is at `POST /api/voice/search`.
- The agent prompt and tool definitions live in `agent/`. Changing a tool means changing `agent/tools.json`, `toolSchemas.ts`, and the dashboard together; changing the prompt means pasting `agent/prompt.md` into the dashboard and publishing.
