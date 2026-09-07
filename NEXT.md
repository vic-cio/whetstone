# Whetstone: what to do next

**Written:** 2026-09-07
**Written by:** Claude Opus 5, after building part B.
**Written for:** the next session, starting cold.
**Status:** part A and part B are both done. What is left is listed in section 3, and none
of it is designed yet.

---

## 0. How to read this

The bug sweep (part A) and the phase after it (part B) are both finished and in `main`.
Section 1 says what part B turned out to be, section 2 says what was found while building
it, and section 3 is the open list.

Read `PLAN.md` for the design and `CONTEXT.md` for the vocabulary. Use those words exactly.
`docs/adr/0022`, `0023` and `0024` hold the reasoning for the three decisions part B rests
on, and they say what was rejected, which is the part that matters when one of them looks
awkward to build against. `HANDOFF.md` is the original design handoff and is historical.

---

## 1. What part B built

**The format.** `course.json` gained `tags`, `small` and `projects`. A Task gained
`follows`, and a Test gained `minutes`. The schema, the parser, the authoring skills and the
Constructor's instructions moved in one commit, because a skill describing a format the
parser refuses is worse than no skill. Every field defaults, so a Course written before this
still parses.

**A Test is a sitting.** Answer, press Check, and the run happens then. The result is held
until every question in the Test is checked, and the reveal is a list of ticks and crosses
with no number on it. Feedback shows what you gave and the Course's own explanation. Retake
starts a fresh sitting, and both sittings stay in the record. `docs/adr/0022`.

**A defect report brings the Constructor in.** It reads the Task and the note and either
agrees or names what was missed. The reader upholds the report or drops it, and overriding a
Constructor that disagrees is theirs to do. Upholding voids the Attempts and sends the
question back to be mended or removed. `docs/adr/0024`.

**Revision reaches a module.** `revise.ts` has six work kinds now. `rebuild-module` and
`remove-module` are offered from the Course page, and `add-project` from a revision run.

**Projects and the Reviewer.** Open-ended work done outside the app, submitted as a folder
and some links, answered with one written response and no mark. A fourth role with its own
row in Settings. `docs/adr/0023`.

**Tags.** The library filters on one at a time, and the Constructor is shown the tags already
in the library before it invents another.

---

## 2. Two things found by running it

**A minted id is not stable enough to be a key.** `sittingFor` minted a fresh id whenever
there were no rows yet, so the id changed between the read that opened a Test and the write
that held the first answer, and two answers landed in two different sittings. The first
sitting is now a fixed string. Anything else that mints an id on read will have this bug.

**Every screenshot check in this repository was reading a stale page.** `capturePage()`
hands back the frame the compositor still holds for a window that is not in front, so the
png showed the library while the `.txt` beside it showed a Test three steps later. The
capture now turns background throttling off and calls `invalidate()` before the shot. If a
screenshot ever looks like it is showing the wrong screen again, that is where to look.

---

## 3. What is open

Nothing here is designed. Each would need a decision from Victor before it is built.

1. **A live harness has never run part B's new roles.** The Reviewer, the defect evaluation
   and the four new revision kinds are all covered by offline tests, and none of them has
   spawned a real model. `scripts/prove-refusal.mjs` is the pattern for doing that
   deliberately and cheaply. The prompts are the part most likely to be wrong.
2. **A signed build.** Still the only thing left from phase 7, and it needs an Apple
   developer identity, which is Victor's to provide.
3. **The spend cap still does not fire for `pi`,** which reports its cost once, after the run
   is over. Victor handles limits at the provider portals, so this is deliberate. If it is
   ever picked up, the fix is a per-turn cost moment from the harness and a cap that kills on
   a running total.
4. **Findings 6 and 7 of the old sweep are closed.** A defect report is read now, and
   `add-rung` has a button in the same place the module controls are. Nothing is left of
   part A.

---

## 4. What this deliberately does not do

Unchanged from the phase that was just built, and worth re-reading before adding anything
that measures the reader.

- No score, no percentage, no average, no history of marks. The reveal screen is where this
  will be tempting: a list of nine ticks and crosses wants a "7 of 9" above it more than
  anything else in the app. Revisit only by rewriting PLAN 3.4, deliberately.
- No timer on a Test. `minutes` is indicative and nothing counts down.
- No thread on a project review, and no tutor panel on a project page.
- No shelf life on a small course.
- No fixed tag vocabulary.
- No spend cap work.
