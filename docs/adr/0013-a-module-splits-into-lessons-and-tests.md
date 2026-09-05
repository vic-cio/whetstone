---
status: accepted
---

# A Module splits into Lessons and Tests, and only a Test records anything

An earlier draft interleaved recorded Tasks through a Lesson's prose, so reading and being assessed happened in the same breath and a single tick had to mean both "I read this" and "I could do it". Victor asked for the two to be separate Pages and invited pushback; the request is right, with one sharpening. The line between the Page types is not interactivity, because a Lesson should stay lively and carry Mini-apps and questions. The line is whether an answer is recorded. A Lesson may ask anything and records none of it. A Test holds the Tasks whose Attempts go into the database.

This keeps the testing effect inside a Lesson, where answering right after reading is one of the strongest things a learner can do, while making a tick honest and giving the Ladder somewhere legible to live: a Test declares its Depths up front, so the user knows what kind of thinking is about to be asked of them.

## Consequences

A Module carries an ordered `pages` array of typed entries rather than a list of Lessons, and the folder gains `tests/`. A Lesson's inline question is a `try` block, distinct from a Task, and a test asserts that a `try` records no Attempt while the same question inside a Test does. The `tests-pass` Task kind was renamed `assertions-pass`, because three different things in this project were about to be called a test. The Constructor is free to shape a Module as it sees fit, including a Lesson with no Test or a Course of Tests alone.
