# RUConnect

3D map of Rutgers College Ave events. Three people work in this repo at once, each with their own agent. These rules keep that work from colliding. Design: `docs/superpowers/specs/2026-10-10-campus-events-design.md`.

## Commands

- `npm run dev`: server on 3001, client on 5173
- `npm test`: all tests. `npx vitest run <path>`: one file
- `npm run typecheck`
- `npm run db:setup`: create your schema, migrate, seed. `npm run db:reset`: rebuild your own schema

## Ownership

| Slice | Folders | Rules file |
|---|---|---|
| A: Map | `client/src/map/`, `data/buildings.json` | `client/src/map/CLAUDE.md` |
| B: Ingest | `server/src/ingest/`, `client/src/ingest/`, `data/captures/`, `data/extraction.cache.json` | `server/src/ingest/CLAUDE.md` |
| C: Voice | `server/src/voice/`, `client/src/voice/` | `server/src/voice/CLAUDE.md` |

`data/events.seed.json` is shared data: anyone may add events to it. Add your own entries; do not edit or delete someone else's, and on a merge conflict keep both sides. The schemas of the data files (`BuildingSeedSchema`, `SeedEventSchema`) are frozen.

Ask the person you are working for which slice they own right now if they have not said. Ownership rotates.

Frozen: `shared/`, `server/src/core/`, `client/src/app/`, existing files in `server/migrations/`, and root config (`package.json`, `server/package.json`, `client/package.json`, `shared/package.json`, `package-lock.json`, `tsconfig.json`, `vitest.config.ts`, `.github/`, `.githooks/`, `.claude/`, this file).

## Rules

1. Edit only inside the slice your person currently owns.
2. Frozen areas change only in a separate pull request whose title starts with `contract:`, opened after all three people agree in team chat. If a task seems to need a frozen change, stop and tell your person.
3. Never push to `main`. Work on `<name>/<topic>`, open a pull request with `gh pr create`, merge when CI is green. Rebase on `origin/main` before opening and about once an hour. After rebasing a branch you already pushed, update it with `git push --force-with-lease`, and only ever on your own branch.
4. Reach other slices only through `@ruconnect/shared` types, the HTTP API, and `client/src/app/` stores. Never import from another slice's folder.
5. Use your own `DB_SCHEMA`. Never run `db:reset` against `prod`.
6. A new migration for your own slice's tables is allowed: name it with the current time, `YYYYMMDDHHMM_description.sql`. Never edit a merged migration or change the structure (DDL) of a core table (`buildings`, `events`) outside a `contract:` pull request. Reading and writing rows in them is allowed.
7. Do not add dependencies without your person announcing it in team chat. If `package-lock.json` conflicts, take `main`'s version and run `npm install`.
8. Develop with `MOCK=1` until the slice you depend on has merged.
9. Handoff notes go in `docs/handoff/<slice>.md`, not in `README.md`.
10. Never read, print, or commit `.env`.

## Conventions

- TypeScript, ESM, extensionless imports.
- Validate every external input (HTTP bodies, model output, files) with a zod schema from `shared/`.
- Tests sit next to the code as `*.test.ts` and run under vitest. They are logic tests: the vitest include does not pick up `.test.tsx` and no DOM environment is installed.
- Slice styles go in a `.css` file inside the slice folder, imported by the slice's component. Do not edit `client/src/app/app.css`.
