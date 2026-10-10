# Campus Events 3D: Hackathon Brainstorm & Build Brief

> Hand this file to a Claude Code session to scaffold the project. It captures what the team has settled on. Where something is marked **OPEN**, ask the team or pick the stated default and move on.

## 1. One-line pitch

A 3D campus map that aggregates every event on campus. Students snap a photo of any flyer and Gemini turns it into a structured event. Buildings glow when something is happening inside, a time slider shows activity rippling across campus through the day, and a voice assistant answers questions like "I'm free until 4, I like robotics and free food, what's near the library?" and flies the camera to the results.

## 2. Problem statement

Campus events are scattered across flyers, club Instagram posts, email blasts, PDFs, and group chats. Students miss events they would have loved. Existing aggregators are crowded and half-maintained because data entry is painful. Our answer: make ingestion effortless (photo of a flyer) and make discovery visual and conversational (3D map + voice).

## 3. Team and constraints

- Team of 3, all want to touch everything (3D, Gemini, voice).
- **18 hours** from about 6:15 PM Saturday Oct 10, 2026. Submit by about 11:30 AM Sunday Oct 11 (feature freeze 9:00 AM).
- Timezone: America/New_York.
- Hackathon judging: a tight 2-minute live demo matters most. One polished feature beats five half-built ones.

## 4. Tech stack (defaults, change only if there is a strong reason)

- **Frontend:** React + Vite, Three.js (via React Three Fiber + drei is fine; pick one approach and stay consistent).
- **Backend:** small Node (Express) server. **OPEN:** Python/FastAPI if the team prefers; default to Node so the whole repo is JavaScript.
- **Storage:** start with a JSON file or in-memory store seeded from `data/events.seed.json`. Move to Firebase/Supabase only if time allows. Do not spend setup time on a database.
- **AI:** Gemini API
  - Multimodal (image input) for flyer extraction, with structured JSON output.
  - Live API for the voice assistant. Fallback: push-to-talk with a standard Gemini call plus browser speech synthesis.
- API key lives in `.env` (never committed). Provide `.env.example`.
- **Campus:** **OPEN.** Default to a generic, schematic campus of 10-15 named buildings laid out on a grid. The team will swap in real building names and approximate positions later via `data/buildings.json`.

## 5. The three feature slices

Each person owns one slice end to end (UI + backend + data), then the team rotates (see section 8).

### Slice A: Map
- Stylized 3D campus: simple extruded boxes, good lighting, ground plane, soft shadows. **Do not model detailed buildings.**
- Building labels, click to select, event detail panel for the selected building.
- Buildings glow/pulse when an event is active at the currently selected time.
- Beacon height above a building reflects expected crowd size.
- Time slider (scrub through the day, buildings update live).
- Camera fly-to animation (exposed as a function so the voice slice can call it).

### Slice B: Flyer
- Upload UI (file picker, and camera capture on mobile).
- `POST /extract`: image in, Gemini returns `{title, start, end, building, category, description, expectedAttendance}` as strict JSON.
- Confirm/edit screen so the user can fix fields before saving.
- Save to events store, new event appears on the map immediately.
- Must work on messy photos (angled, dim, crumpled). Test early. This is a key demo moment.
- Cache a few known-good extraction results as a demo fallback.

### Slice C: Voice
- Mic button and transcript UI.
- Gemini Live API session. Gemini gets the current events list as context and can call a tool like `show_events({buildingIds, startTime, endTime})`.
- The tool call triggers the map's fly-to and highlights matching buildings.
- Spoken response back to the user.
- Fallback if Live is fiddly: push-to-talk, standard Gemini call, browser `speechSynthesis`.

## 6. Shared contracts

### Event schema (lock this in the first hour; changes need all 3 people to agree)

```json
{
  "id": "string",
  "title": "string",
  "description": "string",
  "category": "academic | social | career | sports | arts | club | food | other",
  "buildingId": "string",
  "room": "string | null",
  "start": "ISO 8601 datetime",
  "end": "ISO 8601 datetime",
  "expectedAttendance": "number | null",
  "tags": ["string"],
  "freeFood": "boolean",
  "source": "flyer | manual | seed",
  "imageUrl": "string | null"
}
```

### Building schema (`data/buildings.json`)

```json
{
  "id": "string",
  "name": "string",
  "position": { "x": 0, "z": 0 },
  "size": { "w": 1, "d": 1, "h": 1 }
}
```

### API
- `GET /events`: list events (optional `?from=&to=&buildingId=`)
- `POST /events`: create an event
- `POST /extract`: multipart image upload, returns an extracted event draft (not yet saved)
- Voice: the Live API session is opened from the frontend using an ephemeral token or a thin backend proxy. **OPEN:** use whichever is faster to get working; do not expose the raw API key in the browser in the final deploy.

## 7. Suggested repo structure

```
/
  brainstorm.md
  README.md              # includes handoff notes section (see section 8)
  .env.example
  data/
    buildings.json
    events.seed.json     # 25+ realistic events, filled by hand
    extraction.cache.json
  server/
    index.js
    routes/events.js
    routes/extract.js
    gemini.js
  client/
    src/
      map/               # Slice A, owns the scene
      flyer/             # Slice B
      voice/             # Slice C
      shared/            # event store, types, API client
      App.jsx
```

Keep each slice in its own folder to avoid merge conflicts. The scene file is the most likely conflict point, so expose a small interface (for example `flyTo(buildingId)`, `highlight(buildingIds)`) and have other slices call it instead of editing the scene.

## 8. Team workflow (rotation)

| Time (approx.) | Block | Plan |
|---|---|---|
| 6:15-7:30 PM | Together: foundation | Repo, stack, schema, building list. Each person makes one working Gemini call. |
| 7:30-11:45 PM | Block 1: own a slice | P1 = Map, P2 = Flyer, P3 = Voice. Everyone also hand-enters 8 real events (about 25 total). |
| 11:45 PM-1:00 AM | Together: integrate | **Milestone 1:** flyer in, event saved, building glows, all in one app. |
| 1:00-5:00 AM | Block 2: swap | P1 to Flyer, P2 to Voice, P3 to Map. Spend the first 30 min pairing with the previous owner. |
| 5:00-9:00 AM | Block 3: wow features | Back to original slice for polish. Cross-cutting jobs: P1 performance, P2 deploy, P3 demo data and fallback. |
| 9:00 AM | Feature freeze | |
| 9:00-10:30 AM | Cross-testing | Each person bug-tests someone else's slice. |
| 10:30-11:30 AM | Rehearse and submit | Run the demo 5 times, record a backup video, submit with buffer. |

**Sleep (staggered, two people always awake):** P1 1:30-4:30 AM, P2 3:00-6:00 AM, P3 4:30-7:30 AM.

**Handoff notes:** before each swap, the outgoing owner writes a short section in `README.md`: what works, what is broken, where things live.

## 9. Priorities

- **Must have:** 3D map with glowing buildings, time slider, flyer-to-event extraction.
- **Should have:** voice query with map fly-to, event detail panel.
- **Cut first if behind:** audio "energy" signal, personalization, accessibility routes, user accounts, notifications. Mention these as the roadmap in the pitch.
- **Cut order:** audio energy, personalization, accessibility routes, then time slider. **Never cut** the glowing map or the flyer scan.

## 10. Stretch ideas (only after Milestone 2)

- Sound-based crowd signal: sample ambient audio, send only volume/activity levels (never recordings) to produce a live "energy" value per building.
- "Vibe" matching and "go with a friend" schedule/interest overlap.
- Accessibility layer: wheelchair-accessible routes, plain-language summaries, audio descriptions.

## 11. Demo story (build only what this shows)

1. New student opens the app. The 3D campus shows glowing buildings for the current time.
2. They scrub the time slider and watch activity ripple across campus.
3. They snap a photo of a crumpled flyer. Gemini extracts the event, they confirm it, and a building lights up.
4. They ask by voice: "What's happening near the library tonight with free food?" The camera flies to the results and the assistant answers out loud.
5. Closing line: problem statistic, then the roadmap (energy signal, accessibility, personalization).

## 12. Rules that save hackathons

1. **Hardcode a fallback.** If Gemini or Wi-Fi fails during judging, the demo must still run from cached data (`extraction.cache.json`, seeded events).
2. Commit small and often. Pull before every swap.
3. Lock the schema after the first hour.
4. Use simple geometry with good lighting and glow. Polish beats detail.
5. Test flyer extraction on messy photos early.
6. Seed with real events from the team's actual campus. Fake data looks hollow.

## 13. First tasks for the Claude Code session

Please set up the project so the team can start building immediately:

1. Scaffold the repo structure from section 7 (Vite + React client, Express server, shared `data/` folder).
2. Add `.env.example` with `GEMINI_API_KEY=`, and a `.gitignore` that excludes `.env` and `node_modules`.
3. Create `data/buildings.json` with 12 placeholder buildings on a grid, and `data/events.seed.json` with 10 sample events matching the schema (the team will replace these with real ones).
4. Implement the server endpoints `GET /events`, `POST /events`, and a working `POST /extract` that sends an uploaded image to Gemini and returns schema-valid JSON.
5. Build a minimal Three.js scene: ground, extruded building boxes from `buildings.json`, labels, click to select, and a `flyTo(buildingId)` / `highlight(buildingIds)` interface. Include a time slider that makes buildings with active events glow.
6. Add stubs (folder, component, and a README note) for the voice slice so P3 can start there.
7. Write a `README.md` with setup and run instructions (`npm install`, `npm run dev`), the slice ownership table, and an empty "Handoff notes" section.
8. Ensure one command starts both client and server for development.

Ask the team if the campus name, real building list, or backend language preference (Node vs Python) has not been provided. Otherwise use the defaults above and keep moving.
