# Whetstone

A single-user macOS learning environment. Read `PLAN.md` for the design, `CONTEXT.md` for
the vocabulary, `docs/adr/` for why each structural decision was made, and
`docs/design-reference.html` for the visual contract.

Use the words in `CONTEXT.md` exactly. Page, Lesson, Test, Task, Try, Depth, Check, Tick,
Harness, Toolkit and the rest all mean something specific here.

## Layout

```
src/shared/    format.ts (zod schemas), parseCourse.ts (folder -> Course), grade.ts,
               miniapp.ts (the sealed frame)
src/main/      Electron main process. Node lives here and nowhere else
src/preload/   the only bridge into the renderer, one namespace per feature
src/renderer/  React. No Node access
toolkit/       the toolkit this build ships. See docs/toolkit.md
fixtures/courses/        hand-written Courses the tests run against, and the sample the
                         app seeds a fresh library with
fixtures/courses-sealed/ the hostile Course test 7 attacks. Never shipped
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
- **An answer never crosses the bridge.** `courses:open` strips `answer`, `accepted` and
  `answerGuide` from every Task and Try. The renderer sends what the user did and gets an
  outcome back, so the window showing a question does not hold its answer and cannot skip
  recording the Attempt.
- **A Mini-app reaches nothing.** One sealed frame, `sandbox="allow-scripts"` and nothing
  else, an opaque origin, and a policy denying every external resource and every connection.
  `Kit.bridge` is the only way out, and every message that records something starts with the
  user pressing `Kit.bridge.action`. `docs/adr/0005`, `docs/adr/0016`, `docs/adr/0017`.
- **The toolkit is pinned per Course.** The host injects the copy in the Course folder, never
  the one this build ships, so a Course keeps behaving the way it was built. Change
  `toolkit/` and its version together, never a one-off inside a Course. `docs/adr/0014`.
- **A Mini-app reports; it never decides.** `grade.ts` compares what the frame sent with what
  the Constructor wrote. An `assertions-pass` Task passes only on the assertions it declares.
- **Lesson prose becomes data, never markup.** `src/shared/markdown.ts` returns a tree and
  the renderer builds elements from it. Nothing in a Course may become HTML in the host
  window, which is the window holding the preload bridge.

## Toolchain, and four things that will waste your afternoon

- **Vite is pinned to the 7 line on purpose.** `electron-vite@5` peers on
  `vite ^5 || ^6 || ^7`, while `@vitejs/plugin-react@6` peers on `vite ^8`. Those two
  cannot both be satisfied. `@vitejs/plugin-react@5.1` supports vite 7, so the set is
  vite 7 + electron-vite 5 + plugin-react 5.1 + vitest 4.1. Do not bump one alone.
- **Tests set `NODE_OPTIONS=--no-experimental-webstorage`.** On Node 26 the experimental
  global `localStorage` is unusable in a test runner and fails tests for reasons that have
  nothing to do with the code.
- **SQLite comes from `node:sqlite`, not `better-sqlite3`.** No native module, so no
  rebuild against the Electron ABI. `.nvmrc` is Node 24 because the tests import the same
  module outside Electron, and a Node below 22.5 does not have it. `docs/adr/0015`.
- **A frame written with `srcdoc` inherits the host page's policy.** The host window denies
  inline scripts, so a Mini-app delivered that way is silently dead: no error, no script, an
  empty rectangle. That is why the frame is served over `whetstone-app://` with a policy of
  its own. `docs/adr/0017`.
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

**Look at the png.** Capture both themes for any change that touches colour. A computed-
style contrast audit was written and then removed: it reported "all text passes" on a
build whose screenshot plainly showed black-on-black text, and a check that misses the bug
in front of it is worse than no check. A real one needs to sample painted pixels rather
than trust `getComputedStyle`, and system colours such as `buttontext` are where it went
wrong. Until that exists, the screenshot is the check.

A `<button>` does not inherit `color`. Without an explicit colour it falls back to the
user-agent default, which is legible in one theme and invisible in the other. `theme.css`
sets `color: inherit` on buttons globally for this reason; do not remove it.

`WHETSTONE_CAPTURE_STEPS` is a JSON array of expressions run in the page between the load
and the shot, so a capture can reach a Lesson or a Test. A step that throws is logged and
skipped, and the run exits after 30 seconds whatever happens.

```
WHETSTONE_COURSES=$PWD/fixtures/courses WHETSTONE_DB=/tmp/probe.db WHETSTONE_THEME=light \
  WHETSTONE_CAPTURE_STEPS='["document.querySelectorAll(\".crow\")[0].click()"]' \
  WHETSTONE_CAPTURE=/tmp/shot.png npx electron .
```

`WHETSTONE_CAPTURE_WAIT` sets the pause between steps, in milliseconds, default 600. A page
holding a Mini-app needs longer, because the frame has to load, draw and report.

A capture also writes `<png>.json`, holding whatever a step left on `window.__probe`. That is
how the sandbox check reads what a sealed frame managed to reach: a message posted out of a
frame is delivered to the page and nowhere else, so the listener has to live in the page.

Set `WHETSTONE_DB` on any capture run. Without it the run writes ticks into the real
Progress DB.

Class names are global in `theme.css`. `.end` on a lesson footer once also matched
`class="prow end"` on a course row and drew a stray rule there; check a new utility name
against the whole file before adding it.

## Packaging

`npm run dist:mac` writes `dist/mac-arm64/Whetstone.app` and a dmg beside it. Apple
Silicon only, and deliberately unsigned, so Gatekeeper quarantines a copy that has been
moved or downloaded. Clear it with:

```
xattr -dr com.apple.quarantine /Applications/Whetstone.app
```

A brand-new courses root is seeded with the sample Course from `fixtures/`, which ships in
the bundle under `Contents/Resources/sample-course`. Seeding runs once, only on a root
that did not exist, and never touches a root the user already has.
