# Map handoff

## Works
- `mapController` (`flyTo`, `openBuilding` (no-op until the panel exists), `highlight`, `clearHighlight`, `setTime`), covered by tests.

## Unverified
- The Mapbox map (extruded buildings colored when an event is active at the slider's time) compiles and typechecks but has never been seen rendering in a browser. It needs a first look with a real `VITE_MAPBOX_TOKEN`.

## Broken or missing
- Building coordinates are approximate; footprints are rectangles.
- No glow animation, beacons, play button, or building panel yet (`openBuilding` does nothing).

## Where things live
- `client/src/map/index.tsx`: map setup and controller. `time.ts`: slider math. `geo.ts`: GeoJSON conversion.
