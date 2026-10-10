# Slice A: Map

Owner: P1 (update this line at each rotation).

Owns `client/src/map/`. Design: spec section 6.

- This is the only folder that may import `mapbox-gl`.
- `MapView` in `index.tsx` is mounted by `app/App.tsx`. It registers a `MapController` (type from `@ruconnect/shared`) through `registerMapController`. Other slices call `mapController` from `client/src/app/mapController.ts`; keep its four methods working.
- Read data from `useEventsStore` (`buildings`, `events`, `selectedTime`). Do not fetch events here.
- Building coordinates in `data/buildings.json` are approximate and footprints are rectangles. Correct them against the basemap and replace them with real footprints; that file is slice-owned data, but its schema (`BuildingSeedSchema`) is frozen.
- To build: category colors and pulsing glow, attendance beacons, play button on the slider, click-to-open building panel.
