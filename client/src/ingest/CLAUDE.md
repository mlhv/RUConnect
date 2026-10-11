# Slice B: Ingest (client)

Owner: Ben (update this line at each rotation). Server rules: `server/src/ingest/CLAUDE.md`.

- `IngestPanel` in `index.tsx` is mounted by `app/App.tsx`. Replace its body.
- When an event is published, call `useEventsStore.getState().upsertEvent(event)` so the map lights up, then `mapController.flyTo(event.buildingId)`.
- To build: file picker and mobile camera capture, live swarm panel fed by `SwarmStep` Server-Sent Events, confirm/edit form for `needs_review` events.
