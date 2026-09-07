# Whetstone

A single-user macOS learning environment. Read `PLAN.md` for the design, `CONTEXT.md` for
the vocabulary, `docs/adr/` for why each structural decision was made, and
`docs/design-reference.html` for the visual contract.

Use the words in `CONTEXT.md` exactly. Page, Lesson, Test, Task, Try, Depth, Check, Tick,
Harness, Toolkit and the rest all mean something specific here.

## Layout

```
src/shared/    format.ts (zod schemas), parseCourse.ts (folder -> Course), grade.ts,
               verdict.ts (what a Grader may come back with), guard.ts (a course put back),
               snapshot.ts (what the reader is doing), prompts.ts (what each role is told),
               again.ts (the missed list and a review draw), environment.ts (a login shell),
               miniapp.ts (the sealed frame), courseFile.ts (paths a Course points at),
               samples.ts (keeping the shipped Courses current in a library),
               harness.ts (what a Harness is, and the Moment union), claude.ts (the CLI
               adapter), staging.ts (the gate into the library), remove.ts (deleting)
src/main/      Electron main process. Node lives here and nowhere else. harness.ts spawns,
               build.ts runs a build, newCourse.ts holds one Brief, tutor.ts and grader.ts
               are the other two roles, answering.ts routes a Task to whichever judges it,
               workspace.ts owns the folders a run is given
src/preload/   the only bridge into the renderer, one namespace per feature
src/renderer/  React. No Node access
toolkit/       the toolkit this build ships. See docs/toolkit.md
agent/         what the app hands a Harness: harnesses.json, roles/ (the instruction file
               per role), skills/ (copied into the run's own folder, never a plugin)
scripts/       things run by hand. prove-refusal.mjs spawns a real harness and spends money
fixtures/courses/        hand-written Courses the tests run against, and the sample the
                         app seeds a fresh library with
fixtures/courses-sealed/ the hostile Course test 7 runs. Never shipped
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
- **Free text is only as good as the list behind it.** `accepted-answers` compares a string
  against a set, and normalising folds case, spacing and punctuation away, so an answer that
  is punctuation ("-") survives only because the Course listed it. A question whose answer
  set is not closed belongs in `multiple-choice` or `check: model`, not here. Do not try to
  fix a marked-wrong right answer by loosening `normalise`; the trouble is not spelling.
- **The toolkit carries no subject.** It is the same in every Course, so nothing in it may
  know about chess, or circuits, or music. What one Course is about goes in that Course's
  library: files under `lib/`, listed in `course.json`, inlined into that Course's Mini-apps
  after the toolkit and before the app. `fixtures/courses/forks-and-pins/lib/` is the worked
  example. `docs/adr/0019`.
- **The host answers a Mini-app nothing.** A frame reports an answer and that is all. Do not
  add a channel for a Mini-app to ask the main process for something; that was tried in
  `docs/adr/0018` and removed, because a sealed frame can carry the code itself and running
  it in the frame freezes one widget rather than the whole window.
- **A path from a Course is checked against the disk, not against a string.** `resolve` and
  `relative` never touch the filesystem, so a symlink inside a Course passes a check written
  that way. `fileInCourse` calls `realpathSync` first.
- **A Mini-app reports; it never decides.** `grade.ts` compares what the frame sent with what
  the Constructor wrote. An `assertions-pass` Task passes only on the assertions it declares.
- **A role is shaped by what it denies, not by what it allows.** Measured, not assumed:
  `--allowedTools` changed nothing about the tool list in a recorded run, and
  `--disallowedTools` removed exactly what it named. So `denied()` in `src/shared/claude.ts`
  has to name every writer and every outward-facing tool, and a writer it misses survives.
  `fixtures/streams/README.md` and `tests/refusal.test.ts` carry the evidence. `PLAN.md` 3.14.
- **A profile names an ability, never a tool.** `AgentProfile.can` is `read`, `write`, `web`,
  and the adapter maps those to its own CLI's tool names. A tool name in a profile makes
  every role Claude-shaped, which is what a registry of harnesses exists to avoid. This was
  got wrong first time: the profiles carried `allowedTools: ['Read', 'Glob', ...]` directly.
- **The missed list is derived, never stored.** A Task is missed when its most recent Attempt
  that was not voided is a fail. `PLAN.md` 3.4 gave it a table and it does not need one: two
  records of one fact drift, and the drift here is the app accusing somebody of getting a
  question wrong that they have since got right. Voiding rewrites an Attempt's outcome; it
  never adds a row saying it was voided.
- **A harness gets the environment it would have had in a terminal.** An app launched from
  Finder has almost none of it, and `~/.zshrc` is read by an interactive shell only, so a key
  a harness expects in the environment is simply absent and the harness says it is not
  authenticated. `loginEnvironment()` asks the login shell once. This is the same problem the
  PATH widening solves and it was the half that was missed.
- **Trouble is not an outcome.** A Grader that ran out of budget, returned half an object, or
  scored a criterion the Task never declared has not judged the work. `readVerdict` returns
  trouble, nothing is recorded, and the Attempt stays open. Never widen a schema in
  `verdict.ts` to make a partial answer usable: recording a guess as a fail is not
  recoverable and the person will believe it. `PLAN.md` 3.15.
- **A Course is copied before a Tutor spawn and put back after it.** That is the third layer
  of 3.14 and the only one that reports to the app: a refused write reaches the run and never
  reaches the result event. A hash alone would say a Course changed and be unable to undo it.
- **Nothing spawns on navigation, and the `runs` table is the proof.** A row is written before
  a process starts. `tests/sandbox.test.ts` opens a Course, a Lesson, a Test, answers a Task
  and opens the Tutor panel in the real app, and asserts the table is empty.
- **`kit` in a message from a frame is data, not a credential.** A Mini-app can post anything,
  and the hostile fixture posts a review nobody pressed for. The host checks the sending
  window, and holds a review until a person presses, because a review costs money.
- **A skill is a file the prompt names.** The app copies a role's skills into
  `.whetstone/skills/` in the run's working folder and lists their paths in the first
  instruction, rather than loading a plugin. A plugin format belongs to one harness, and
  these skills carry the Course format itself, so a harness that could not load them would
  author against nothing. Reading a file is the floor every harness has. `docs/adr/0021`.
- **Everything under `.whetstone/` is the app's and never ships.** It is removed at the gate
  with the Brief's tray. Do not seed into `.claude/skills/`: the Constructor is told to write
  the Course's own skills there for the Tutor, and the app must not tidy away what it asked
  for. `PLAN.md` 3.7.
- **The app writes `builtBy`, not the Constructor.** The app knows the harness and the model,
  so it stamps `course.json` before the folder is checked rather than asking a Run to record
  something it might forget. `PLAN.md` 3.12.
- **An empty `permission_denials` proves nothing.** A read-only run told to write called
  `Write`, was refused, and the result event still said `success` with an empty denial list.
  The refusal reached the run and never reached the app. Do not write a check that reads that
  field as evidence; the content hash of 3.14 is the layer that reports one to the app.
- **The harness is invisible.** Only a `Moment` crosses the bridge: the app's own words, with
  no tool name, no ANSI, no path and no exit code. An adapter that cannot phrase a tool call
  emits nothing rather than its name. The technical log holds Moments, never the raw stream,
  because a second channel carrying the stream would be a hole in the first one.
- **Asking to write is not writing.** A tool call and its result are two events. A file is
  reported only once its result says the tool worked, which is why reading a stream is a
  reader with memory rather than a pure function of a line. The first version got this wrong
  and would have told the reader that two refused files had appeared.
- **A Course is built in staging, and the parser is the only gate.** A Run writes outside the
  library, and a folder the parser accepts is renamed into place in one step. A folder it
  refuses goes back to the same session at most three times. The app writes `toolkit/` into
  staging itself, because an agent writing its own copy would break the pin. `docs/adr/0020`.
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
WHETSTONE_STAGING=<dir>   # build a Course somewhere other than userData
```

`node scripts/prove-refusal.mjs` spawns a real harness and **spends real money**, about five
cents on haiku. It asks a read-only role to write a file and records what came back into
`fixtures/streams/`, which is what `tests/refusal.test.ts` then runs against, free and
offline. Re-run it when the tool flags change, and say in the commit which CLI version
produced it. Nothing in `npm test` spawns anything.

To check the real window without a person at the keyboard, set `WHETSTONE_CAPTURE` to a
png path and optionally `WHETSTONE_THEME=light|dark`. The app renders once, writes the png
and a `.txt` of the visible text beside it, and exits.

**Look at the png.** Capture both themes for any change that touches colour. A computed-
style contrast audit was written and then removed: it reported "all text passes" on a
build whose screenshot plainly showed black-on-black text, and a check that misses the bug
in front of it is worse than no check. A real one needs to sample painted pixels rather
than trust `getComputedStyle`, and system colours such as `buttontext` are where it went
wrong. Until that exists, the screenshot is the check.

Two rules that both look reasonable can leave a button invisible. `.acts button` sets a
transparent ground and beats `.btn` on specificity, so the filled amber button came out as an
empty box with white text on white. It looked right in the screenshot only because it was
disabled at the time. Capture the enabled state too.

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

`WHETSTONE_CAPTURE_SIZE`, as `2100x1150`, opens the window at that size. The reading column
is centred and the margin takes the extra width, so a change to it looks right at the default
1180 and can still be wrong on a wide screen. The screen caps the size it actually gets.

A capture also writes `<png>.json`, holding whatever a step left on `window.__probe`. That is
how the sandbox check reads what a sealed frame managed to reach: a message posted out of a
frame is delivered to the page and nowhere else, so the listener has to live in the page.

Set `WHETSTONE_DB` and `WHETSTONE_STAGING` on any capture run. Without them the run writes
ticks into the real Progress DB and leaves a staging folder in the real data directory.

`WHETSTONE_CAPTURE_LIMIT` is the hard exit, 30 seconds by default. A capture that waits on a
spawned harness needs more, and it needs the waiting to happen after the last step: the pause
runs after every step, so a trailing `"0"` step is how a capture waits.

`document.hasFocus()` is false in a capture, and Chromium does not match `:focus` in an
unfocused document. A `:focus` rule therefore cannot be checked this way. Simulate the state
with an injected stylesheet instead, and measure the box rather than trusting the picture.

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

The courses root is seeded with the sample Courses from `fixtures/courses/`, which ship in
the bundle under `Contents/Resources/samples/`. `src/shared/samples.ts` holds the rule and
`tests/samples.test.ts` pins it: **a sample is the app's content until the user touches it.**
Each seeded folder carries a `.whetstone-sample` note holding the digest of what was written.
A folder whose digest still matches its note has not been edited and is replaced when the app
ships a newer one. A folder that differs from its note, or has no note at all, is the user's
and is never written to.

Do not go back to seeding the whole root once. That made a sample added in a later version
invisible to anyone who had already run the app, and it froze an early sample at its early
state until it stopped parsing and drew as an error nobody could act on.
