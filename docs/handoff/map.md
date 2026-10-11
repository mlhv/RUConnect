# Map handoff

Owner: `mlhv`. Updated Oct 11, 2026.

## Works
Seen in Chrome on Oct 11 with a real `VITE_MAPBOX_TOKEN`, `MOCK=0`, and the typed voice fallback:
- The Mapbox map renders with our buildings extruded on the `dark-v11` basemap.
- An active building takes the color of its best-attended event's category (`activity.ts`). Highlighted buildings (voice results) are gold, which wins over the category color. Lit buildings pulse.
- Building panel: `openBuilding(id)` or a click on a building opens it at the top left; a click on empty map or its close button dismisses it. It lists "Happening now" and "Later today" for the slider's time (`panel.ts`).
- Lit buildings also get a soft ring of their color on the ground (the `ru-buildings-glow` line layer) and their name floating over the roof. Edges are slightly rounded.
- The basemap's own buildings are drawn as dim 3D context (`ru-context-3d`). A `distance` filter hides the basemap's copy of each of our 12, so the two never overlap.
- `flyTo` eases in and out over about 3 seconds while swinging the camera round, then circles the building slowly. Any map input, or another flight, stops the circling.
- `flyTo` pads the camera so the target lands clear of the sidebar (`cameraPadding` in `geo.ts`). The padding assumes the sidebar size in `client/src/app/app.css`; change both together.
- A typed voice question highlights its results, moves the slider, flies to the top pick, and opens its panel.
- `data/buildings.json` has real outlines and centers from OpenStreetMap for all 12 buildings, and they line up with the basemap. With `MOCK=0` buildings come from the database: run `npm run db:seed` on your own schema to pick them up (it updates building rows and keeps your events), or `npm run db:reset` for a clean slate.
- The layer and controller are set up on `style.load`, not `load`, so the controller does not wait for basemap tiles.

## Unverified
- A flyer upload moving the map, and a spoken (not typed) voice question.
- Narrow screens: the panel is meant to sit above the slider below 720px wide.

## Known behaviour and gaps
- Three seed events with ids starting `map-` (Zimmerli, Scott Hall, The Yard) overlap `DEMO_NOW` (1:30 PM) so the app opens with lit buildings. They have no free food and sit away from the library, so the scripted voice answers are unchanged. Run `npm run db:seed` to load them.
- The app respects the system's "reduce motion" setting: with it on there is no pulse and flights jump. Turn it off on the machine that presents.
- The console warns once about `symbol-z-elevate` and `symbol-z-order`. It is harmless.
- "Academic Building" uses the West Wing outline only; the building has two wings and the schema holds one ring.
- "The Yard" uses the outline OpenStreetMap names Sojourner Truth Apartments (40 College Ave).
- The pulse must stay a feature state. Changing the layer's paint expression every frame reloads the building tiles and the colors disappear.
- Not built: attendance beacons, the slider's play button.
- The sidebar (voice above ingest) can run past the bottom of a short screen. It lives in frozen `client/src/app/`.

## Where things live
`client/src/map/`:
- `index.tsx`: map setup, controller, click handling, the pulse loop.
- `BuildingPanel.tsx`, `map.css`: the panel. `panel.ts`: which events it lists.
- `activity.ts`: category colors and which category a building shows.
- `geo.ts`: GeoJSON conversion and camera padding. `time.ts`, `TimeSlider.tsx`: the slider.
- `testEvent.ts`: event builder for this slice's tests.
