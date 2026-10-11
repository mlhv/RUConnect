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
- Attendance beacons: a thin column stands on the roof of each active building, in its category color, taller for a bigger expected crowd (`beaconHeightM` in `activity.ts`, square-root scale from 10 m to 100 m). The column stands at the building's center, which for a U-shaped building (The Yard, Honors College) is over the courtyard.
- The slider has a play button: it moves the clock 3 minutes about 11 times a second, so the label and thumb glide, and stops at the end of the day or when the slider is dragged. Pressed at the end of the day, it restarts from 8 AM. Dragging still snaps to 15 minutes.
- Nothing switches abruptly: a building's color, glow, label, and beacon height ease towards their targets over a few tenths of a second (`approach` in `fade.ts`, `FADE_TAU_MS` in `index.tsx`). One frame loop in `index.tsx` owns every feature state; the React effects only set targets.
- Roof labels have their own source (`ru-labels`). A source with a text layer is not drawn until the map's fonts load, and when the labels shared the buildings' source the buildings appeared several seconds late on a cold load.
- On load the camera eases in to its opening view over about 4 seconds.
- `flyTo` pads the camera so the target lands clear of the sidebar (`cameraPadding` in `geo.ts`). The padding assumes the sidebar size in `client/src/app/app.css`; change both together.
- A typed voice question highlights its results, moves the slider, flies to the top pick, and opens its panel.
- `data/buildings.json` has real outlines and centers from OpenStreetMap for every building, and they line up with the basemap. With `MOCK=0` buildings come from the database: run `npm run db:seed` on your own schema to pick them up (it updates building rows and keeps your events), or `npm run db:reset` for a clean slate.
- The layer and controller are set up on `style.load`, not `load`, so the controller does not wait for basemap tiles.

Seen on Oct 11 in headless Chrome, with `MOCK=1` and with `MOCK=0` on `dev_mlhv`:
- Four campuses: College Ave, Busch, Livingston, Cook/Douglass. `data/buildings.json` has 41 buildings (12, 10, 9, 10), all with OpenStreetMap outlines. A building's campus is the nearest campus centre (`campus.ts`); the schema has no campus field.
- Campus chips above the slider (`CampusSwitcher.tsx`). Each shows how many events are under way on that campus at the slider's time. A click flies to that campus's opening view. The selected chip follows the camera, so a voice result on another campus selects it.
- Flights take 3.2 seconds within a campus and up to 6 seconds between campuses (`flightMs` in `campus.ts`).
- Fifteen seed events with ids starting `map-busch-`, `map-livi-`, and `map-cd-` light three buildings on each new campus at `DEMO_NOW`. They all end by 4:30 PM and avoid robotics and free food, so the three suggested voice questions still answer with College Ave events only. Keep every new-campus event's expected attendance under 150: a typed question with no interest words ("What's on tonight?") ranks by attendance alone and ignores the time of day.

## Unverified
- The four campuses in a real browser window: headless rendering is too slow to judge how the flights between campuses feel.
- Playback on the new campuses, and the chips on a narrow screen.
- A flyer upload moving the map, and a spoken (not typed) voice question.
- Narrow screens: the panel is meant to sit above the slider below 720px wide.

## Known behaviour and gaps
- Three seed events with ids starting `map-` (Zimmerli, Scott Hall, The Yard) overlap `DEMO_NOW` (1:30 PM) so the app opens with lit buildings. They have no free food and sit away from the library, so the scripted voice answers are unchanged. Run `npm run db:seed` to load them.
- The app respects the system's "reduce motion" setting: with it on there is no pulse and flights jump. Turn it off on the machine that presents.
- The console warns once about `symbol-z-elevate` and `symbol-z-order`. It is harmless.
- "Academic Building" uses the West Wing outline only; the building has two wings and the schema holds one ring.
- "Hill Center" uses the larger of its two outlines, for the same reason.
- The database port (30503) is blocked on networks that only allow web traffic. If `db:seed` or `/api/buildings` hangs, change network or use `MOCK=1`.
- The other campuses are dark after 4:30 PM: their seed events were kept out of the evening so "What's on tonight?" stays on script.
- Ingest still rejects events that are not on College Ave (`server/src/ingest/verifier.ts`), and the voice agent's prompt still says "College Avenue campus". Both belong to other slices.
- New aliases never use a bare "Student Center" or "library", so those names still resolve to the College Ave buildings.
- SHI Stadium is not on the map: OpenStreetMap has no named building outline for it.
- "The Yard" uses the outline OpenStreetMap names Sojourner Truth Apartments (40 College Ave).
- Everything animated must stay a feature state. Changing a layer's paint expression every frame reloads the building tiles and the colors disappear.
- The sidebar (voice above ingest) can run past the bottom of a short screen. It lives in frozen `client/src/app/`.

## Where things live
`client/src/map/`:
- `index.tsx`: map setup, controller, click handling, the frame loop.
- `BuildingPanel.tsx`, `map.css`: the panel. `panel.ts`: which events it lists.
- `activity.ts`: category colors, which category a building shows, and beacon heights. `fade.ts`: the easing step.
- `campus.ts`: the four campuses, which campus a building is on, live counts, flight time. `CampusSwitcher.tsx`: the chips.
- `geo.ts`: GeoJSON conversion and camera padding. `time.ts`, `TimeSlider.tsx`: the slider.
- `testEvent.ts`: event builder for this slice's tests.
