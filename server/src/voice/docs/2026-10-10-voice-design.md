# Voice slice design

Slice C. Owner: `mlhv`. Written Oct 10, 2026. Extends section 7 of `docs/superpowers/specs/2026-10-10-campus-events-design.md` and supersedes the build order in `docs/handoff/voice.md` where they differ.

## 1. Goal

A student says "I'm free until 4, I like robotics and free food, what's near the library?", hears a spoken recommendation, and watches the map highlight the matches and fly to the top pick. The conversation stays open for follow-ups such as "anything after 4?" or "take me to the second one".

Success by the feature freeze (9:00 AM Sunday Oct 11): the three-line demo script in section 8 works reliably, and the same map reaction works by typing when ElevenLabs is unavailable.

### Decisions

| Decision | Choice |
|---|---|
| Conversation shape | Short multi-turn. The session stays open; mute and end buttons are always visible. |
| Who understands the sentence | The ElevenLabs agent extracts optional structured arguments. Server code filters and ranks. The agent chooses among the returned candidates. |
| Free food | A ranking boost by default, a filter only when the user insists. |
| Interest words | Rank only, never filter. |
| Agent configuration | By hand in the ElevenLabs dashboard, from files in this repo. |
| Text box | Always present. Goes to the agent when connected, to the local fallback when not. |

### Out of scope

- Parsing times in the fallback path.
- A script that creates or updates the agent through the ElevenLabs API. A prompt-only push script is a stretch goal after the mic flow works.
- Semantic search, until the ingest slice fills `events.embedding` (section 9, step 6).
- Any change to `shared/`, `server/src/core/`, `client/src/app/`, or a `package.json`.

## 2. Architecture

```
mic / text box
   │
ElevenLabs agent (dashboard)          text fallback (no agent)
   │  client tools                        │
   ▼                                      ▼
find_events, focus_event   (client/src/voice/tools.ts)
   │                          │
   │ POST /api/voice/search   └── mapController: highlight, setTime, flyTo, openBuilding
   ▼
rankEvents (server/src/voice/rank.ts)  ←  deps.store
```

Code enforces facts (time window, publication status, distance). The model applies taste (which candidate sounds best, how to phrase it).

## 3. Search endpoint

`POST /api/voice/search`. Every field is optional.

| Field | Type | Default |
|---|---|---|
| `query` | string | none |
| `from` | ISO datetime with offset | now |
| `to` | ISO datetime with offset | `from` + 12 hours |
| `category` | `CategorySchema` value | none |
| `freeFood` | `"prefer"` or `"require"` | none |
| `nearBuildingId` | string | none |

"Now" is `deps.config.demoNow` when set, otherwise the real clock. A `from` earlier than now is treated as now. A `to` that is not after `from` is `400 invalid_window`, and an unknown `nearBuildingId` is `400 unknown_building`.

Response:

```ts
{ matches: Hit[], later: Hit[] }
Hit = { event: CampusEvent, distanceM: number | null, endsAfterWindow: boolean }
```

`distanceM` is the distance from the event's building to the anchor building, or `null` with no anchor.

### Filters

An event is a candidate when all of these hold:

- Its status is `published`.
- Its overlap with `[from, to]` is at least 30 minutes, or its whole duration or the whole window when either is shorter than 30 minutes.
- It has free food, when `freeFood` is `"require"`.

`endsAfterWindow` is true when the event ends after `to`.

### Ranking

Scores are summed. Weights are named constants at the top of `rank.ts`.

| Signal | Points |
|---|---|
| A query word appears in the title | 3 per word |
| A query word appears in the tags | 3 per word |
| A query word appears in the category | 2 per word |
| A query word appears in the description | 1 per word |
| `category` argument equals the event's category | 4 |
| Event has free food and `freeFood` is `"prefer"` | 2 |
| Near the anchor | `3 × max(0, 1 − distanceM / 400)` |
| `endsAfterWindow` | −2 |
| Expected attendance | `0.5 × min(attendance, 500) / 500` |

Ties are broken by earlier start.

Words: text is lowercased and split on non-alphanumeric characters. A trailing `s` is removed from words longer than three letters. Query words in the filler list are dropped: `free`, `food`, `event`, `events`, `like`, `something`, `anything`, `near`, `cool`, `fun`, `campus`, `today`, `tonight`, and common articles, pronouns and prepositions. Matching is whole word against the same normalization of each field, and a word counts at most once per field.

Variety: when the request has neither `query` nor `category`, at most two events per category are kept.

`matches` holds at most 8 hits.

### `later`

Filled only when `matches` has fewer than two hits. It holds up to three published events that start in `[to, to + 3 hours]` and are not already in `matches`, with the `freeFood: "require"` filter applied, ranked by the same scores.

### Times

All comparisons use `Date.parse` instants. Mock mode returns `-04:00` strings and Postgres returns `Z` strings.

## 4. Client tools

Both live in `client/src/voice/tools.ts`, created by `createTools({ search, map, getBuildings, getEvents, now })` so tests pass fakes.

### `find_events`

Arguments: `query`, `from`, `to`, `category`, `freeFood`, `nearBuildingName`. All optional.

1. Validate the arguments with a zod schema. On failure, return a sentence describing the problem; do not throw.
2. Resolve `nearBuildingName` (section 4.1). When it does not resolve, search without an anchor and say so in the result.
3. Call the search endpoint and validate the response with a schema in `client/src/voice/searchApi.ts` built on the shared `CampusEventSchema`.
4. With matches: `map.highlight(buildingIds)` and `map.setTime(t)`, where `t` is the earliest match start, or now if that is later. Without matches: `map.clearHighlight()`.
5. Remember the returned hits for `focus_event`.
6. Return text with times in America/New_York:

```
Now Sat 1:30 PM. Window: until 4:00 PM. Near: Alexander Library.
2 matches, best first:
1. [id voice-robotics-build] Robotics Club Build Session. Rutgers Student Center, 2:00 PM to 3:30 PM. Free food. 217 m from Alexander Library. <description>
2. ...
Later, outside the window:
- [id voice-robotics-demo] Robotics Team Demo and Scrimmage. College Avenue Gym, 4:00 PM to 5:30 PM. Free food.
```

A hit with `endsAfterWindow` carries "Runs past the window." With nothing in either list the text says so and suggests widening the time or interests.

### 4.1 Resolving a building name

Input is lowercased and a leading "the" is removed. In order: exact match on `name` or an alias; then a building whose name or alias contains the input as whole words; then a building whose name or alias is contained in the input. The first stage with exactly one building wins; a stage with several picks the one whose name is shortest. No match returns `null`.

"The library" must resolve to `alexander-library` through the name, since no alias says "library".

### `focus_event`

Argument: `eventId`, required.

Look the event up in the remembered hits, then in `getEvents()`. Found: `map.flyTo(buildingId)`, `map.openBuilding(buildingId)`, `map.setTime(t)` with `t` the event start or now if later, and return "The map is now showing <building name>." Not found: return "No event with that id. Call find_events first."

## 5. Session endpoint

`GET /api/voice/session` returns `{ signedUrl, now }`. `now` is `demoNow` or the real clock, as an ISO string.

- Key or agent id missing: `503 { error: "voice_unavailable" }`.
- ElevenLabs answers non-2xx, times out after 5 seconds, or returns an unexpected body: `502 { error: "voice_upstream" }`.

The handler is `server/src/voice/session.ts` and uses plain `fetch`. Expected upstream call, to be verified against current ElevenLabs documentation before implementation: `GET https://api.elevenlabs.io/v1/convai/conversation/get-signed-url?agent_id=<id>` with header `xi-api-key`, returning `{ "signed_url": "wss://..." }`.

## 6. Agent

Source of truth, in `client/src/voice/agent/`:

- `prompt.md`: the system prompt, pasted whole into the dashboard.
- `tools.json`: the two client tool definitions with parameter types, descriptions, and required flags. Entered once, then frozen.
- `toolContract.test.ts`: fails when the tool names, parameter names, or required flags in `tools.json` differ from the zod argument schemas and the names the client registers.

Dynamic variables sent at session start: `current_time` (for example "Saturday, October 10, 2026, 1:30 PM, UTC offset -04:00") and `buildings` (comma-separated names from the events store).

The prompt instructs the agent to:

- Call `find_events` before recommending anything, and never invent an event.
- Fill only the arguments the student gave. Interest words go in `query`. Food goes in `freeFood` (`"prefer"`, or `"require"` when the student insists), never in `query`. A time limit becomes `to`, as an ISO datetime with the offset from `current_time`. A kind of event becomes `category`.
- Call `focus_event` with the id of the top pick, then describe one or two events in one or two sentences each: what, where, when, free food.
- When only the later list has entries, say nothing fits the window and offer those.
- On "the second one" or similar, call `focus_event` with that id rather than searching again.

Both tools are set to wait for the response. After the agent works end to end, the owner duplicates it in the dashboard and leaves the copy untouched; rolling back is a change of `ELEVENLABS_AGENT_ID`.

## 7. Panel

`VoicePanel` in `client/src/voice/index.tsx`, wrapping itself in the SDK's `ConversationProvider`. The installed SDK is `@elevenlabs/react` 1.17.0; exact hook and option names come from its type definitions.

| State | Shown |
|---|---|
| Idle | Mic button, text box |
| Connecting | "Connecting…" |
| Listening or speaking | Status label, mute button, end button, transcript |
| Text mode | One-line reason, text box, transcript |

Starting a session: request microphone permission, `GET /api/voice/session`, then start the session with the signed URL, the client tools, and the dynamic variables. A denied microphone, a non-200 session response, a connection error, or an unexpected disconnect switches to text mode and keeps the transcript.

The transcript lists user and agent messages and a line while a tool runs. It is a pure reducer in `transcript.ts`.

Text box: connected, the text is sent to the agent as a user message. Otherwise it runs the fallback.

### Fallback

`fallback.ts`, a plain function over the same tools:

1. Find a mentioned building and use its name as `nearBuildingName`. A building is mentioned when the sentence contains, as whole words, its full name, one of its aliases, or a word of its name that is at least three letters long, appears in no other building's name, and is not one of `rutgers`, `college`, `avenue`, `hall`, `center`, `student`, `building`, `art`. Aliases shorter than three letters are ignored. So "library" finds Alexander Library and "gym" finds the College Avenue Gym. With several mentions, the first in the sentence wins.
2. If it contains "free food", set `freeFood: "prefer"`.
3. Pass the sentence as `query`. The window is the default.
4. Call `findEvents`, then `focusEvent` on the top match.
5. Speak one sentence with `speechSynthesis`, for example "Robotics Club Build Session at Rutgers Student Center, 2:00 PM to 3:30 PM, with free food." With no match, say so.

The fallback gets "now" from `GET /api/config`.

## 8. Demo data and script

`DEMO_NOW=2026-10-10T13:30:00-04:00`, agreed with the other two owners because it moves the map's clock.

New entries in `data/events.seed.json`, all on Oct 10, 2026:

| Id | Title | Building | Time | Food | Tags |
|---|---|---|---|---|---|
| `voice-robotics-build` | Robotics Club Build Session | `student-center` | 2:00–3:30 PM | yes | robotics, engineering |
| `voice-study-break` | Study Break: Snacks and Board Games | `alexander-library` | 2:30–3:30 PM | yes | study, games |
| `voice-drones-lab` | Intro to Drones Open Lab | `scott-hall` | 2:00–3:00 PM | no | robotics, drones |
| `voice-robotics-demo` | Robotics Team Demo and Scrimmage | `college-ave-gym` | 4:00–5:30 PM | yes | robotics, competition |

Distances from Alexander Library by current coordinates: Student Center about 215 m, College Ave Gym about 140 m, Scott Hall about 670 m.

Script and expected result:

1. "I'm free until 4, I like robotics and free food, what's near the library?" Matches in order: Build Session, Study Break, Drones Lab. The Demo and Scrimmage is excluded. The map flies to the Student Center.
2. "Anything after 4?" The Demo and Scrimmage; the map flies to the gym.
3. "What's cool on campus tonight?" A varied list from the evening events.

## 9. Build order

One branch and pull request per step. Each leaves the app working.

1. Agent files (`prompt.md`, `tools.json`) and the seed events, so the dashboard can be set up in parallel.
2. Search endpoint and ranking.
3. Client tools, fallback, and the text panel.
4. Session endpoint, mic, and transcript. This needs a `contract:` pull request first: the frozen `server/src/core/app.test.ts` asserts that `GET /api/voice/session` answers 501. The tool contract test ships with step 3.
5. Tuning with the real agent; update `docs/handoff/voice.md`; showcase submission.
6. Semantic search, if `events.embedding` is filled and time allows: embed the query with Gemini, order by vector distance through `deps.pool`, and keep the keyword path for mock mode.

## 10. Testing

Logic tests in `*.test.ts` under vitest, next to the code.

- `rank.test.ts`: the section 8 scenario built inline; the vague request (no query) with the variety cap; an empty window filling `later`; `freeFood` prefer versus require; the 30-minute overlap edge; `Z` against `-04:00`; "free food" not matching a `food trucks` tag.
- `router.test.ts` and `session.test.ts`: supertest over `testFixture()`; 400 on bad input; 503 without credentials; 502 on upstream failure, with `fetch` stubbed.
- `resolveBuilding.test.ts`: "the library", "Alex", an alias, an ambiguous input, an unknown name.
- `formatResults.test.ts`, `tools.test.ts`, `fallback.test.ts`, `transcript.test.ts`: fake search and fake map controller.
- `toolContract.test.ts`: section 6.

The panel component has no automated test, since no DOM environment is installed. It is checked by running the app in a browser against the demo script.

## 11. Risks and dependencies on others

- ElevenLabs details (signed URL endpoint, client tool registration, dynamic variable syntax) are unverified and are checked against documentation at step 4. Steps 1 to 3 do not depend on them.
- Hall noise: mitigated by the mute button and typed input to the agent.
- The map has not been confirmed rendering. `openBuilding` is a no-op until the map owner builds the panel. Whether `mapController.setTime` also moves the time slider is the map owner's implementation.
- Building coordinates are approximate, so distances may change when the map owner corrects `data/buildings.json`; the seed scenario should be rechecked then.
- Step 4 is blocked until all three owners agree to the `contract:` change above.
- The owner supplies `ELEVENLABS_API_KEY` and `ELEVENLABS_AGENT_ID` in `.env`. Agents do not read `.env`.
