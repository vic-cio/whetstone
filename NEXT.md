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

### 1. Mini-apps have no real gate. This is the important one.

Everything the app checks about a Mini-app is three things: that `apps/<id>/index.html`
exists, that it holds no external reference, and that the Course's toolkit version matches
the manifest. Nothing checks that the JavaScript parses, that it draws, that pressing Answer
sends anything, or that it throws on line one. **The most complex artefact in a Course is
the only one with no gate**, and it is the only one that is arbitrary code.

What that produced, twice, in courses that parsed perfectly:

- a drum grid whose expected answer was its own initial state, so pressing Answer passed
  without doing anything
- an editor whose four `assertions-pass` checks were `indexOf` on the raw text, so prose
  containing `bd*4` passed and correct code with `bd*8` failed
- controls built from bare `<button>` elements, which inherit the frame's ink on the user
  agent's light button face and are invisible in the dark theme. `AGENTS.md` documents that
  exact trap for the app's own UI and nothing carries it into `writing-a-mini-app`
- all six `app-result` tasks stating their expected values in the prompt, which makes them
  instruction-following rather than questions

**Victor's proposal, and the one to build:** the Constructor declares the common activities
as data against a schema, rather than writing code. The toolkit already draws every shape
those activities needed — `Kit.steps`, `Kit.order`, `Kit.pieces`, `Kit.slider`, `Kit.plot`,
`Kit.editor`, `Kit.hotspot`, `Kit.sim` — so a declaration is thin, and five of the six
activities in the Strudel course were a step grid, three slider sets and an ordering.

That makes today's bugs unrepresentable: the model never writes a button, so it cannot write
an invisible one, and a declared activity states its initial state, so the parser can refuse
a task whose expected answer equals it.

Keep code Mini-apps for the bespoke case, because `docs/adr/0016` says the sealed frame may
run the reader's own code and a template set that tried to cover a Strudel REPL would become
a bad programming language in JSON. For those, add an execution gate: the app already boots
a Mini-app in a sealed frame for its own tests, so the same machinery can load each activity
at build time and require that it reports `ready`, throws nothing, and sends something when
its action is pressed. Failures go back to the run with the file named, like a parse error.

Cheap static checks worth having either way: the JavaScript parses; it calls
`Kit.bridge.ready()`; it calls `Kit.bridge.action` when a Task answers through it; it uses
toolkit widgets rather than raw `document.createElement('button')`.

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
