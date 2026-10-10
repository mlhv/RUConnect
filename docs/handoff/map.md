# Map handoff

## Works
- Mapbox map with 12 extruded buildings, colored when an event is active at the slider's time.
- `mapController` (`flyTo`, `highlight`, `clearHighlight`, `setTime`).

## Broken or missing
- Building coordinates are approximate; footprints are rectangles.
- No glow animation, beacons, play button, or building panel yet.

## Where things live
- `client/src/map/index.tsx`: map setup and controller. `time.ts`: slider math. `geo.ts`: GeoJSON conversion.
