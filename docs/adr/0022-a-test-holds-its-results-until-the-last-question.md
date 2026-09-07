---
status: accepted
---

# A Test holds its results until the last question is checked

`docs/adr/0013` split a Module into Lessons and Tests, and drew the line at whether an answer is recorded. A Lesson may ask anything and records none of it. A Test holds the Tasks whose Attempts go into the database.

The build did not carry that line all the way to the screen. A Task in a Test answers exactly like a Try in a Lesson: you press, the verdict appears at once, and a wrong answer offers another go. So the two Page types were separate in the record and identical in the hand. The distinction 0013 made was real and invisible.

A Test now runs as a sitting. You answer a question and press Check. The run happens then, in the background, and the result is held. When the last question in the Test has been checked, every result is revealed together. The reveal is a list of the questions with a tick or a cross beside each, and no number. Two things follow it: feedback, which shows what you gave and the Task's own explanation per question, and a retake, which starts a fresh sitting with nothing shown.

The argument that settled it is that the app already has a place for immediate feedback, and it is the Lesson. Answering right after reading is one of the strongest things a learner can do, which is why 0013 kept questions inside a Lesson rather than moving them all into a Test. Holding a Test's results does not lose that. It leaves it where the design already put it, and lets a Test be the other thing: the one place that finds out what you can do unaided.

## Considered options

**Show each result the moment it is checked.** Rejected, and it is what the app does today, so it is the option somebody will re-propose the first time the reveal screen is awkward to build. It is free, it puts the correction at the moment of most attention, and it lets a reader catch a misunderstanding before it spoils the next question. It loses the sitting. Every answer after the first is informed by how the last one went, and with another go offered a multiple-choice question becomes a guessing loop rather than a question. A cross on question two also changes how somebody answers question three, which is a worse measurement and a worse hour. Its real merit, immediate feedback, is already delivered by a Try.

**Withhold the checking as well, and mark everything on one Finish press.** Rejected. It reaches the same screen, and it puts every model-marked question's run at the end, so a Test with three of them ends in a wait while three models think. Checking as you go spreads the runs across the sitting and makes the reveal instant. It also matches what a person is doing anyway, which is finishing one question before starting the next.

**Put a mark at the top of the reveal.** Rejected by Victor, and this is the option most likely to creep back in, because a list of nine ticks and crosses wants a "7 of 9" above it more than anything else in the app. PLAN 3.4 keeps no score, no percentage and no ability estimate, because a running judgement of how well somebody holds a subject is the tutor-and-pupil dynamic this app exists to avoid. A mark for one sitting is defensible and a mark that is kept is not, and the two are one small commit apart. Neither is being built. Revisit only by rewriting PLAN 3.4 deliberately.

## Consequences

Answers are held, so they have to survive a closed window. A `held_answers` row exists per question per sitting, written as each question is checked and read on resume. A Test carrying a project-depth submission can take a day, and losing that to a closed lid is the failure that stops somebody trusting an app.

An Attempt gains a sitting id, nullable so existing rows stay valid. A retake writes fresh Attempts under a new one. Both sittings stay in the record and the missed list reads the latest, because an Attempt that happened is a fact and deleting it to keep the record tidy is how a record starts lying.

Each question is still checked by its own run, holding only that question, its guide and the answer given. Nothing is shared between questions and nothing is carried from a previous attempt. That is what `judge()` already does, and the reveal makes it expensive: nine questions are nine spawns rather than one conversation. The independence is the point and is not an optimisation target. The single exception is a Task that names the Tasks it follows, which is marked on the reader's own earlier answers rather than the correct ones, so one mistake costs one question.

A Test may declare an indicative time, shown as a subtitle. Nothing counts down and nothing is enforced.

A Try is now meaningfully different from a Task in the hand as well as in the record, which is what 0013 intended. `tests/` should assert both halves: that a checked question shows nothing until the last one is checked, and that nothing in the app displays a score, a percentage or an average.
