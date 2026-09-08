# Whetstone

A single-user macOS learning environment. Read `PLAN.md` for the design, `CONTEXT.md` for
the vocabulary, `docs/adr/` for why each structural decision was made, and
`docs/design-reference.html` for the visual contract.

Read `NEXT.md` before starting work. It holds the open bug list and the settled design for
the next phase.

Use the words in `CONTEXT.md` exactly. Page, Lesson, Test, Task, Try, Depth, Check, Tick,
Harness, Toolkit and the rest all mean something specific here.

## Layout

```
src/shared/    format.ts (zod schemas), parseCourse.ts (folder -> Course), grade.ts,
               verdict.ts (what a Grader may come back with), guard.ts (a course put back),
               snapshot.ts (what the reader is doing), prompts.ts (what each role is told),
               again.ts (the missed list and a review draw), environment.ts (a login shell),
               claude.ts and pi.ts (one adapter per harness, each holding that CLI's own
               vocabulary and nothing else),
               miniapp.ts (the sealed frame), courseFile.ts (paths a Course points at),
               samples.ts (keeping the shipped Courses current in a library),
               substance.ts (the second gate: is there enough here to learn from),
               harness.ts (what a Harness is, and the Moment union), claude.ts (the CLI
               adapter), staging.ts (the gate into the library), remove.ts (deleting)
src/main/      Electron main process. Node lives here and nowhere else. harness.ts spawns,
               build.ts runs a build, newCourse.ts holds one Brief, tutor.ts, grader.ts,
               reviewer.ts (a Project) and defect.ts (a report) are the other roles,
               answering.ts routes a Task to whichever judges it and holds the sitting,
               study.ts owns the sitting and the tick rules, revise.ts changes a Course,
               workspace.ts owns the folders a run is given, update.ts replaces the app
src/preload/   the only bridge into the renderer, one namespace per feature
src/renderer/  React. No Node access
toolkit/       the toolkit this build ships. See docs/toolkit.md
agent/         what the app hands a Harness: harnesses.json, roles/ (the instruction file
               per role, and one per way the Constructor is spawned: brief, build, defect),
               skills/ (copied into the run's own folder, never a plugin)
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
- **A Test holds its results.** A checked question shows nothing until every question in
  the Test has been checked. Immediate feedback belongs to a Try. `docs/adr/0022`. The
  renderer is not trusted to keep the secret: `sittingFor` leaves `results` out of the view
  until the last question is checked, so the window cannot show early what it never held.
  A held answer is written down as the reader types, and a retake writes fresh Attempts
  under a new `sittingId` with both sittings left in the record.
- **A defect report is answered, never filed away.** Reporting a Task as broken starts a run
  that reads the Task and the note and either agrees or names what was missed. It settles
  nothing: the reader upholds the report or drops it, and overriding a Constructor that
  disagrees is theirs. Upholding is the only call that touches the record, and what it does
  is void the Attempts against that question. `docs/adr/0024`.
- **A Project is read once and answered in prose.** One written response, in the register of
  a senior colleague, organised around criteria the reader had before they started. No mark,
  no thread, no tutor panel, and nowhere in the database for a score. Projects are a
  top-level array rather than a Page type, so they reach neither the rail nor the tick rules.
  A removal that would empty a Test is refused; a replacement is written instead.
  `docs/adr/0023`.
- **A build outlives the screen that started it.** It runs in the main process and takes
  minutes, so the reader is free to navigate away and come back; the bar at the foot of the
  window is how they get back. Only Stop ends one. Leaving the New Course screen used to
  call `discardBrief`, which deletes the staging folder the run is writing into, and that
  destroyed two real builds before it was found. A Brief that is building refuses to be
  discarded, and `tests/staging.test.ts` fails if that guard is removed.
- **The update check is the only thing that touches the network on its own.** Once a launch,
  to `api.github.com`, and it only ever tells: the version sits at the foot of the rail and
  becomes a button when a release is newer. Nothing downloads and nothing is replaced
  without a press, and a failed check is silent, because no network is the ordinary state on
  a train. `electron-updater` is not usable here: macOS applies an update through Squirrel,
  which requires a valid signature, and this build is unsigned. `src/main/update.ts` does
  what `scripts/install.sh` does, from inside the app.
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
- **How a role is restricted is per CLI, and both directions are real.** `pi`'s `--tools`
  allowlist genuinely filters; `claude`'s does not, and its disallow list is what works. Both
  measured by telling a read-only run to write a file. Never carry one CLI's mechanism to
  another: run it and see. The same goes for a spend cap and for structured output, which
  `claude` has and `pi` does not; those are `capsSpend` and `validatesOutput` in the registry.
- **A role is shaped by what it denies, not by what it allows.** For `claude`, that is: Measured, not assumed:
  `--allowedTools` changed nothing about the tool list in a recorded run, and
  `--disallowedTools` removed exactly what it named. So `denied()` in `src/shared/claude.ts`
  has to name every writer and every outward-facing tool, and a writer it misses survives.
  `fixtures/streams/README.md` and `tests/refusal.test.ts` carry the evidence. `PLAN.md` 3.14.
- **The model list is a starting point, not the set of models.** A registry entry names a
  handful by hand, which is a guess made the day it was written. A CLI that can say what it
  reaches is asked once per session and its answer is added, and the field is typed rather
  than picked, so a provider connected this morning is usable this morning. `pi` answers
  `--list-models`; `claude` and `codex` have no such flag and keep their handful. The ask
  is asynchronous and warmed at startup, because it takes seconds and the main process
  holds the window.
- **A model may name its own provider.** `pi --model opencode-go/muse-spark-1.3-contributor`
  needs no `--provider`, and sending the registry's provider with it asks the wrong service.
  The registry's own entries are `~` patterns, which name no provider and still need the
  flag, so the test is a slash in a model that does not begin `~`.
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
- **There are two gates, and only one of them refuses.** The parser says whether a Course is
  well formed; `src/shared/substance.ts` says whether there is enough there to learn from,
  which is a different question and the one both real builds failed. It measures words per
  lesson, questions per objective, whether an idea is ever asked again after its own Test,
  whether every question is one to pick from a list, and whether a long Module has one Test
  at the end of it. A thin Course goes back to the same session with the numbers, twice, and
  then goes into the library anyway: thinness is a matter of degree and a Course somebody
  waited minutes for beats a Course that met a threshold. A Course marked `small` is exempt,
  because it is short on purpose.
- **A Course is built in staging, and the parser is the only gate.** A Run writes outside the
  library, and a folder the parser accepts is renamed into place in one step. A folder it
  refuses goes back to the same session at most three times. The app writes `toolkit/` into
  staging itself, because an agent writing its own copy would break the pin. `docs/adr/0020`.
- **Lesson prose becomes data, never markup.** `src/shared/markdown.ts` returns a tree and
  the renderer builds elements from it. Nothing in a Course may become HTML in the host
  window, which is the window holding the preload bridge.
  Maths is the one exception and it is a narrow one: a Lesson holds the *expression* as a
  string, and `src/renderer/Maths.tsx` hands that to KaTeX, whose output grammar is its own
  and not the Course's. `trust: false` is load-bearing, `katex.render` writes into a node so
  there is no `dangerouslySetInnerHTML` anywhere in the app, and `tests/markdown.test.ts`
  checks that no expression can produce an anchor, an `href=`, an `<img>` or an `on…=`.
- **Course text is prose everywhere it appears, not only in a Lesson body.** A callout, a
  figure's caption, a Task's prompt, a multiple-choice option, a Rubric criterion and an
  explanation all go through `parseInline`. They did not, for three phases, so a callout
  could hold neither bold nor code nor a link; maths is what finally made it visible.

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

The png is taken before the `.txt`, and both are the same moment: the capture turns
background throttling off and calls `webContents.invalidate()` first. Without that the
compositor hands back the frame it still holds for a window that is not in front, and the
png showed the library while the text beside it showed a Test three steps later. A
screenshot check that reads a page which stopped existing seconds ago is worse than none.

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

A step that begins `until:` is a condition, not an action: the run polls it and goes on as
soon as it is true. Wait on a condition wherever a fixed pause is really a guess about how
long something takes. A sealed frame loads, draws and reports on its own schedule, and on a
busy machine that passes 1500ms, so `tests/sandbox.test.ts` waits for the frame's own
message instead. `WHETSTONE_CAPTURE_UNTIL` is how long one condition gets, 20 minutes by
default. Set it lower than `WHETSTONE_CAPTURE_LIMIT` in a test, so a condition that never
goes true still writes the png and the json and fails on what it measured.

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

`npm run dist:mac` writes `dist/mac-arm64/Whetstone.app`, a dmg and a zip. Apple Silicon
only, and deliberately unsigned: signing for other people's machines needs a Developer ID
certificate, which needs a paid Apple Developer Program membership, and this is a personal
build. An **Apple Development** certificate is not a substitute; it covers your own
registered devices and Gatekeeper still refuses the app everywhere else.

So a copy that arrives by browser, AirDrop or Messages is quarantined, and macOS refuses it
until somebody opens System Settings and says to open it anyway. The Control-click bypass
that used to do this was removed in macOS 15.

**Giving it to somebody is therefore the zip and `scripts/install.sh`, not the dmg.**

```
curl -fsSL https://github.com/vic-cio/whetstone/releases/latest/download/install.sh | bash
```

There is no dialog to click through because there is nothing quarantined: `curl` sets no
quarantine attribute, unlike a browser, so the app is never marked in the first place. The
script clears the attribute anyway for a copy that arrived some other way. Publish a release
with the zip and the script beside each other:

```
npm run dist:mac
gh release create v0.1.0 dist/Whetstone-mac-arm64.zip scripts/install.sh \
  --title "Whetstone 0.1.0" --notes "..."
```

On your own machine, where the build never left the disk, nothing is quarantined either. A
copy you have moved around can be cleared by hand:

```
xattr -dr com.apple.quarantine /Applications/Whetstone.app
```

The courses root is seeded with one sample Course, `using-whetstone`, which ships in the
bundle under `Contents/Resources/samples/`. It is a hand-written course about the app
itself, so a first run opens with something that explains what the reader is looking at, and
every question in it is one the app answers by itself: it works with no harness installed.
`gradients-by-hand` and `forks-and-pins` stay in `fixtures/` as what the tests run against. `src/shared/samples.ts` holds the rule and
`tests/samples.test.ts` pins it: **a sample is the app's content until the user touches it.**
Each seeded folder carries a `.whetstone-sample` note holding the digest of what was written.
A folder whose digest still matches its note has not been edited and is replaced when the app
ships a newer one. A folder that differs from its note, or has no note at all, is the user's
and is never written to.

Do not go back to seeding the whole root once. That made a sample added in a later version
invisible to anyone who had already run the app, and it froze an early sample at its early
state until it stopped parsing and drew as an error nobody could act on.
