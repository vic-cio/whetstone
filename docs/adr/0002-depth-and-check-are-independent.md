---
status: accepted
---

# Task Depth and Task Check are independent axes

The first design assumed that harder Tasks need a model to grade them, so one "tier" field controlled both difficulty and grading method. Victor rejected this: a complicated concept can often be tested cheaply, and a well-written multiple choice question can probe deep understanding while still grading instantly and offline. So a Task carries two independent fields, `depth` (`recall`, `apply`, `construct`, `transfer`, `project`) and `check` (`deterministic`, `model`, `rubric`), and any combination of the two is legal.

## Consequences

Offline availability, cost, and the "needs a model" marker in the UI all derive from `check` alone, never from `depth`. The constructor must be told explicitly that the two are independent, because a naive prompt will correlate them. A test asserting that `depth: transfer` with `check: deterministic` is valid and grades offline should exist before implementation, because this is the property most likely to be quietly broken later.

## Related

The Depth scale itself is fixed at five points, while a Course's Ladder is any subset of them. That keeps ladders fluid per Course, as Victor asked, while leaving progress comparable across Courses. Victor accepted this on 2026-09-05 with one condition: the Depth belongs to the Task, never to the Module, so a late Module may still hold `recall` Tasks with a `deterministic` Check.
