# Whetstone

A single-user macOS learning environment. Read `PLAN.md` for the design, `CONTEXT.md` for
the vocabulary, `docs/adr/` for why each structural decision was made, and
`docs/design-reference.html` for the visual contract.

Use the words in `CONTEXT.md` exactly. Page, Lesson, Test, Task, Try, Depth, Check, Tick,
Harness, Toolkit and the rest all mean something specific here.

## Layout

```
src/shared/    format.ts (zod schemas), parseCourse.ts (folder -> Course), grade.ts
src/main/      Electron main process. Node lives here and nowhere else
src/preload/   the only bridge into the renderer, one namespace per feature
src/renderer/  React. No Node access
fixtures/      hand-written Courses the tests run against
tests/         vitest, run against the fixtures
```

## Invariants worth failing a build over

- **Depth and Check are independent.** Never correlate them, in a schema, a prompt, or the
  UI. `depth: transfer` with `check: deterministic` is a good Task. Offline, cost, and the
  marker derive from `check` alone. `docs/adr/0002`.
- **A Lesson records nothing.** Recorded Tasks live in a Test. A Lesson's `try` blocks are
  a different thing and never become an Attempt. `docs/adr/0013`.
- **Most study needs no model.** Nothing spawns on navigation. A harness starts only when
  the user builds a Course, sends a chat message, submits work, or presses Review.
  `docs/adr/0012`.
- **The app counts, it never scores.** Pages done out of pages total is the only progress
  figure. No ability estimate, no streaks, no spend on screen.
- **The parser never throws.** A malformed Course produces errors naming the file and the
  field. It is the only thing standing between an agent's output and the reader.

## Toolchain, and three things that will waste your afternoon

- **Vite is pinned to the 7 line on purpose.** `electron-vite@5` peers on
  `vite ^5 || ^6 || ^7`, while `@vitejs/plugin-react@6` peers on `vite ^8`. Those two
  cannot both be satisfied. `@vitejs/plugin-react@5.1` supports vite 7, so the set is
  vite 7 + electron-vite 5 + plugin-react 5.1 + vitest 4.1. Do not bump one alone.
- **Tests set `NODE_OPTIONS=--no-experimental-webstorage`.** On Node 26 the experimental
  global `localStorage` is unusable in a test runner and fails tests for reasons that have
  nothing to do with the code. `.nvmrc` pins Node 22 for the same reason.
- **npm gates install scripts.** Electron and esbuild need theirs. Run
  `npm approve-scripts esbuild` and let Electron download its binary on first launch, or
  the app will not start and the error will not say why.

## Running it

```
npm test                  # vitest
npm run typecheck         # tsc --noEmit, strict
npm run dev               # electron-vite dev
WHETSTONE_COURSES=<dir>   # read Courses from somewhere other than userData
```

To check the real window without a person at the keyboard, set `WHETSTONE_CAPTURE` to a
png path and optionally `WHETSTONE_THEME=light|dark`. The app renders once, writes the png
and a `.txt` of the visible text beside it, and exits.

```
WHETSTONE_COURSES=$PWD/fixtures/courses WHETSTONE_THEME=light \
  WHETSTONE_CAPTURE=/tmp/shot.png npx electron .
```
