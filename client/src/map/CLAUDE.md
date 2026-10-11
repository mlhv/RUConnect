# Slice A: Map

Owner: mlhv (update this line at each rotation).

Owns `client/src/map/`. Design: spec section 6.

- This is the only folder that may import `mapbox-gl`.
- `MapView` in `index.tsx` is mounted by `app/App.tsx`. It registers a `MapController` (type from `@ruconnect/shared`) through `registerMapController`. Other slices call `mapController` from `client/src/app/mapController.ts`; keep its five methods working. The building panel must open from `openBuilding(buildingId)`.
- Read data from `useEventsStore` (`buildings`, `events`, `selectedTime`). Do not fetch events here.
- Building coordinates in `data/buildings.json` are approximate and footprints are rectangles. Correct them against the basemap and replace them with real footprints; that file is owned by this slice, but its schema (`BuildingSeedSchema`) is frozen.
- Per-building activity is derived here from the events already in `useEventsStore`; the spec's `GET /api/events/activity` route is not built.
- Built: category colors, the pulse, the click-to-open building panel. To build: attendance beacons, play button on the slider.
- Animate lit buildings through feature state only. Calling `setPaintProperty` with a new data-driven expression reloads the building tiles and drops their colors.
