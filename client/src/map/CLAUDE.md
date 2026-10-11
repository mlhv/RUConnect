# Slice A: Map

Owner: mlhv (update this line at each rotation).

Owns `client/src/map/`. Design: spec section 6.

- This is the only folder that may import `mapbox-gl`.
- `MapView` in `index.tsx` is mounted by `app/App.tsx`. It registers a `MapController` (type from `@ruconnect/shared`) through `registerMapController`. Other slices call `mapController` from `client/src/app/mapController.ts`; keep its five methods working. The building panel must open from `openBuilding(buildingId)`.
- Read data from `useEventsStore` (`buildings`, `events`, `selectedTime`). Do not fetch events here.
- `data/buildings.json` holds real OpenStreetMap outlines and centers. That file is owned by this slice, but its schema (`BuildingSeedSchema`) is frozen.
- Per-building activity is derived here from the events already in `useEventsStore`; the spec's `GET /api/events/activity` route is not built.
- Built: category colors, the pulse and ground glow, roof labels, dim context buildings, attendance beacons, the slider's play button, the click-to-open building panel.
- Animate lit buildings through feature state only. Calling `setPaintProperty` with a new data-driven expression reloads the building tiles and drops their colors.
