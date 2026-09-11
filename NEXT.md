# Whetstone: what to do next

**Written:** 2026-09-08
**Written by:** Claude Opus 5, at the end of the session that shipped part B and 0.2.2.
**Written for:** the next session, starting cold.
**Status:** part A, part B and shipping are done. Section 3 is the open list, and the first
item in it is the one that matters.

---

## 0. How to read this

Read `AGENTS.md` for the invariants and `CONTEXT.md` for the vocabulary; use those words
exactly. `PLAN.md` holds the design and what each phase turned out to be. `docs/adr/` holds
why each structural decision was made **and what was rejected**, which is the half that
matters when one of them looks awkward to build against. `README.md` is for a person
installing the app rather than working on it.

---

## 1. Where things stand

**Part B is done** and is described in `PLAN.md` phase 8: a Test is a sitting, Projects and
the Reviewer, defect reports the Constructor answers and the reader can override, revision
at module scale, tags and the library filter.

**Shipping is done** (phase 9). One `curl` line installs it, the app updates itself from the
foot of the rail, and a build survives navigation, a stopped run and a usage limit.

**The Constructor knows much more than it did.** Size in numbers, the staging skill drawn
from a TEFL course, repetition and spacing, and what a sealed frame can actually do. The
gate measures prose and questions and sends a thin course back twice before accepting it.

---

## 2. What two real builds taught, with numbers

Both parsed on the first attempt and both were bad, in ways nothing was checking.

| | First build | Second build | Asked for |
|---|---|---|---|
| Pages | 17 | 40 | 30–60 |
| Prose words | 2,959 | 13,347 | |
| Words per lesson | 174 | 393 | 600–1200 |
| Tries per lesson | 1.0 | 0.94 | varied |
| Questions of one kind | — | 31 of 42 multiple choice | mixed |

The instructions moved the structural things (a JavaScript module exists, an engine exists in
`lib/`) and barely moved the quantitative ones, which is why the second gate exists. What is
still unmeasured is the activities, and that is item 1 below.

---

## 3. What is open

### 1. Mini-apps have a real gate now. Shipped in v0.3.0.

The Constructor declares the common activities as data against a schema
(`compileDeclaredActivities`, `src/shared/declaredActivity.ts`) rather than writing code for
them — a declaration compiles to an ordinary `apps/<id>/index.html` before the parser ever
sees it, so the parser's own `apps/` checks, the execution gate, and `frameSource` at
runtime all treat it exactly like a hand-written Mini-app. A declared activity states its
initial state, so a task whose expected answer equals it is refused structurally, closing
that specific bug for good rather than only catching it after the fact.

For the bespoke case (code Mini-apps stay, per `docs/adr/0016` — the sealed frame may run
the reader's own code, and a template set covering something like a Strudel REPL would
become a bad programming language in JSON), `checkMiniApp`/`checkAllMiniApps`
(`src/main/executionGate.ts`) boot every Mini-app for real in a sealed frame at build time
and require that it reports `ready`, throws nothing, sends something when its action is
pressed, and is legible in both themes. Failures go back to the run with the file named,
like a parse error (`build.ts`).

### 2. A live harness has never run several of the newer roles

The Reviewer, the defect evaluation and the four newer revision kinds are covered by offline
tests and have never spawned a real model. The prompts are the part most likely to be wrong.
`scripts/prove-refusal.mjs` is the pattern for doing that deliberately and cheaply.

### 3. Strudel-style live code, if that course is revisited

`lib/strudel-engine.js` gives instruments (kick, hat, clap, tone, note names) and no
language: no mini-notation parser, no cycle clock, no scheduler. A "press play and hear this
line" widget needs a clock and a pattern-to-time mapping on top of what is there, perhaps
eighty lines. An editable "fix the syntax" activity needs a real parser for a subset, and
then `assertions-pass` assertions that run the parse and assert on the events rather than on
the characters.

### 3b. Codeblocks run any language the toolkit has a runtime for. Done, for `python`.

`Kit.run` (toolkit/kit.js, toolkit 1.3.0) is a language-dispatch core: `js` is built in,
anything else comes from `window.__whetstoneRuntimes[lang]`, wired into the frame by
`runtimeBootstrapScript` (`src/shared/runtimeBootstrap.ts`) once a Course pins it in
`manifest.runtimes`. `Kit.editor` and `Kit.codeblock` are both built on it. `docs/adr/0026`
is the design record, updated with what actually shipped and the sandboxed-frame obstacles
found while building it (opaque-origin `sessionStorage` throwing, Pyodide's glue file
loading via dynamic `import()` rather than `fetch`, `Kit.bridge.ready()` needing to wait on
the runtime before firing since `Kit.run` is synchronous but loading Pyodide cannot be).

`fetchRuntime(lang, cacheRoot, io)` (`src/main/runtimeFetch.ts`) fetches every asset
`ALLOWED_RUNTIMES[lang]` names (five for `python`: the loader, its Emscripten glue, the
wasm, the stdlib zip, and the package-index JSON — not just the loader, which is all the
first pass here had checked), refuses anything off the allowlist, and never caches a
runtime that doesn't boot-verify against a known-good snippet that specifically exercises
the stdlib's own import machinery. The shared cache (`src/shared/runtimeCache.ts`) lives
outside any Course folder, reference-counted by re-deriving which Courses' `runtimes`
pointers still name it rather than a live counter — garbage-collected on every Course
delete. `build.ts` now actually calls `fetchRuntime` for everything a Course's manifest
pins, as a gate step alongside the Mini-app execution gate; `openCourse()`
(`courseStore.ts`) does the same, best-effort, so a Course whose folder was placed into the
library some other way than a build (a restored backup, a folder copied in by hand — there
is no dedicated import feature) still gets its runtime fetched the first time it opens.

A Lesson-level, ungraded codeblock also exists: `:::codeblock{lang=js label=... height=...}`
(`writing-a-lesson/SKILL.md`), a `LessonBlock` variant (`src/shared/format.ts`), parsed in
`parseCourse.ts` (which rejects a non-`js` `lang` the Course never pinned in
`manifest.runtimes`), served over `whetstone-app://<slug>/__codeblock__/<lessonId>/<index>`
(`codeblockFrameSource` in `src/shared/miniapp.ts`, `codeblockFrame` in `courseStore.ts`,
routed in `src/main/index.ts`'s `serveMiniApp`), and rendered by `Codeblock.tsx` the same
way `MiniApp.tsx` renders an `app` block.

This supersedes most of item 3 above for any language `assertions-pass` needs beyond raw
string/pattern checks on Strudel specifically — a `Kit.codeblock`/`Kit.editor` with a real
Python runtime is the general answer that item was a special case of. The Strudel
mini-notation parser itself is still unbuilt regardless, and adding a second language beyond
`python` is still one entry in `ALLOWED_RUNTIMES` plus that language's own loader-specific
wiring in `runtimeBootstrapScript` — the quirks found here (storage stubs, non-`fetch`
loading paths) are not something a fully generic shape could have hidden.

### 4. Smaller things

- **A signed build.** Still the only thing left from phase 7, and it needs a paid Apple
  Developer membership, which Victor has decided against. The install script and the in-app
  updater exist because of that decision.
- **The spend cap never fires for `pi`,** which reports its cost once, after the run. Victor
  handles limits at the provider portals. If it is ever picked up, the fix is a per-turn cost
  moment from the harness and a cap that kills on a running total.
- **The Brief has no stop condition.** It asks clarifying questions until the reader presses
  a button; the role file never tells it to say when it has enough.

---

## 4. Things that are deliberately absent

Re-read before adding anything that measures the reader.

- No score, no percentage, no average, no history of marks. The reveal screen is where this
  will be tempting: a list of nine ticks and crosses wants a "7 of 9" above it more than
  anything else in the app. Revisit only by rewriting PLAN 3.4, deliberately.
- No timer on a Test. `minutes` is indicative and nothing counts down.
- No thread on a project review, and no tutor panel on a project page.
- No spaced-repetition scheduler. Missed is a plain list with no due date.
- No fixed tag vocabulary, and no shelf life on a small course.
- No telemetry. The update check is the only thing that touches the network unasked, it
  runs once a launch, and it only ever tells.
