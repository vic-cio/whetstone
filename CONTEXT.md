# Whetstone

A single-user macOS learning environment. A frontier model builds a structured course from a topic and a set of objectives. The user then climbs a ladder of tasks that grows in difficulty, from questions the app grades instantly and offline to projects a model grades against a rubric.

## Language

### Content

**Subject**:
A top-level category in the sidebar, such as "Machine Learning". It groups Courses and holds no content of its own.
_Avoid_: Category, field, discipline

**Course**:
One generated curriculum with a stated goal, stored as a self-contained folder. Deleting the folder deletes the Course.
_Avoid_: Class, program, track, curriculum (as a noun for this thing)

**Module**:
An ordered division of a Course that groups Pages around one theme, usually some Lessons followed by a Test.
_Avoid_: Chapter, unit, section

**Page**:
One entry in a Module, either a Lesson or a Test. Pages are what the tick counts.
_Avoid_: Item, unit, step, screen

**Lesson**:
A Page the user reads and watches, with interactive pieces to play with and questions they can try. Nothing in a Lesson is recorded.
_Avoid_: Article, topic, chapter, content

**Test**:
A Page holding the recorded Tasks for a Module. Untimed, retakeable, and never a gate. Attempts come only from Tests.
_Avoid_: Quiz, exam, assessment, practice set, checkpoint

**Try**:
A question inside a Lesson that gives an answer immediately and is never recorded. It exists so the reader can check they followed.
_Avoid_: Practice question, self-check, exercise

**Block**:
One of a fixed set of pieces the host renders inside a Lesson: prose, callout, diagram, [[try]], app, and resource. A Lesson is made only of Blocks, and the set is closed, so no Course can invent one.
_Avoid_: Component, widget, element, section

**Objective**:
A single named capability the Course claims to teach, such as "compute a gradient by hand". Every Attempt records the Objective it tested, so the data exists. The interface shows none of it, and displays only the [[tick]] on each Lesson.
_Avoid_: Goal, outcome, skill, competency

**Resource**:
An external link the constructor curated, stored as a URL, a title, a type, and one line on why it is worth the user's time. The app never stores a local copy.
_Avoid_: Reference, material, link

**Mini-app**:
An interactive artifact stored inside the Course folder as one `index.html`. It runs in a sandbox, is built from the [[toolkit]], and reaches the host through one narrow message channel. Written by hand for a bespoke case, or produced by compiling a [[Declared activity]] for the common ones.
_Avoid_: Widget, applet, component, embed

**Declared activity**:
Data, not code: one of the toolkit's widgets, described as JSON under a Course's `activities/`, that compiles into an ordinary [[Mini-app]] before the parser ever reads the Course. Its point is what it cannot express — a Task whose expected answer equals the widget's own untouched starting state, or an assertion that checks the raw text of what the reader typed instead of running it — rather than what it can. A bespoke, hand-written Mini-app remains the path for anything a Declared activity cannot say.
_Avoid_: Template, generator, config, blueprint

**Toolkit**:
The widget set and host bridge the app injects into every Mini-app, pinned per Course so a shared Course behaves the same everywhere. It is what makes activities across different Courses look and work alike. It carries no subject: what one Course is about goes in that Course's [[library]].
_Avoid_: Library (that is a different thing here), framework, SDK, components

**Bridge**:
The single way across a line the app draws on purpose. The preload Bridge is how the renderer reaches the main process. `Kit.bridge` is how a Mini-app reaches the host. Each is the only way across its own line, and neither can reach the other.
_Avoid_: API, IPC layer, interface, channel

**Library**:
The code one Course carries for itself, listed in its manifest and inlined into every one of its Mini-apps. A Library is what a Course is about, such as the rules of chess and a board to play them on. The [[toolkit]] is the same in every Course; a Library belongs to one and no other Course can see it.
_Avoid_: Package, module, dependency, plugin, service

**Codeblock**:
A `Kit.codeblock` or `Kit.editor` in a Mini-app: code the reader can run for real, in whatever language its `lang` set. `js` runs built in; any other language runs through a [[runtime]] the host inlined. `Kit.codeblock` shows what ran; `Kit.editor` additionally runs the Constructor's assertions against it, same as before.
_Avoid_: Snippet, sandbox (that word means the frame itself here), REPL

**Runtime**:
What a codeblock language beyond `js` runs on: fetched once at build time from a short, hand-picked list (`ALLOWED_RUNTIMES`), proven to boot before it is trusted, and kept in one shared, deduplicated cache outside any Course folder rather than copied per Course like the [[toolkit]] and a [[library]] are. A Course carries only a pointer to one, `{ lang, version }`.
_Avoid_: Interpreter, engine, VM, plugin

### Assessment

**Task**:
One assessable prompt. It belongs to exactly one Objective and carries a Depth and a Check.
_Avoid_: Question, exercise, problem, assignment, activity

**Depth**:
How demanding a Task's thinking is, on a fixed five-point scale: `recall`, `apply`, `construct`, `transfer`, `project`. Independent of Check.
_Avoid_: Difficulty, level, tier (as the field name)

**Check**:
How a Task's answer is judged: `deterministic`, `model`, or `rubric`. Independent of Depth. This field alone decides whether a Task works offline and whether it costs money.
_Avoid_: Grading type, evaluation mode, marking

**Rung**:
One Depth that a given Course actually uses. A Course's Ladder is its set of Rungs. A short Course may have two; a deep one may have five.
_Avoid_: Tier, level, stage

**Ladder**:
The ordered set of Rungs a Course uses. Declared per Course by the constructor, drawn from the fixed Depth scale.
_Avoid_: Progression, path, sequence

**Attempt**:
One submission against one Task inside a Test, recorded with its Objective, its outcome, and its timestamp. Every Attempt is recorded, always. A [[try]] in a Lesson makes no Attempt.
_Avoid_: Try, submission (that word is taken), answer

**Submission**:
The file or files the user attaches to an Attempt at `project` depth, such as a document or a CSV.
_Avoid_: Upload, deliverable, artifact

**Rubric**:
The list of criteria a `rubric` Task is scored against, written when the Task is created and shown to the user before they start.
_Avoid_: Criteria, marking scheme, grading guide

**Verdict**:
The grader's output for one Attempt: a score per Rubric criterion, the evidence for each, and an overall result.
_Avoid_: Grade, result, score, feedback

**Defect report**:
A claim that a Task itself is broken, on exactly three grounds: it rests on inaccurate information, it is impossible as written, or something broke unforeseeably. It is not a dispute about a Verdict. Upholding one repairs the Task and voids the Attempt; it never rescores.
_Avoid_: Appeal, dispute, complaint, challenge

### Study

**Sitting**:
One pass through a Test. You answer a question and press Check, the run happens then, and the result is held until every question in the Test has been checked, when all of them are revealed together. A Retake starts another sitting, and both stay in the record.
_Avoid_: Session (that word is taken), run, submission, attempt (that is one question)

**Held**:
What a checked answer is until the sitting is revealed. It has been recorded; it has not been told.
_Avoid_: Pending, queued, unmarked

**Reveal**:
The end of a sitting: every question with a tick or a cross beside it, and no number of any kind. Feedback and Retake follow it.
_Avoid_: Results, score screen, report

**Project**:
Open-ended work covering a theme or a whole Course, done outside the app with ordinary tools and submitted as a folder and some links. It sits below the last Module, is not a Page, and has no Tutor panel.
_Avoid_: Assignment, capstone, coursework

**Reviewer**:
The role that reads a submitted Project and writes one response, in the register of a senior colleague reading the work. No mark, no thread, no memory of a previous submission.
_Avoid_: Grader (that is a different role), marker, critic

**Review session**:
A set of Tasks drawn at random from Objectives the user has already covered. It exists to interrupt linear progress, and it draws at random rather than by any estimate of ability.
_Avoid_: Practice, quiz, revision

**Missed**:
The plain list of Tasks the user got wrong and has not since got right. Getting one right removes it. There is no schedule and no due date.
_Avoid_: Miss queue, review queue, flashcards, repetition deck, spaced repetition

**Tick**:
The single mark beside a Page, and the only progress the app shows. A Lesson ticks at its end, a Test ticks once every Task has been attempted, and the user can fill or clear either by hand to say they already know the material. It never deletes anything.
_Avoid_: Known-already, complete, skip, dismiss, done, checkbox

**Next up**:
The one Lesson or Task the Course suggests the user open next, taken from the Constructor's ordering. It is advice, never a lock.
_Avoid_: Current step, unlock, gate, checkpoint

### Model roles

**Brief**:
The short conversation in which the user says what they want to learn and attaches any material, before a Course is built. Nothing is generated until the user says to start.
_Avoid_: Prompt, request, form, intake

**Constructor**:
The agentic role that builds a Course: it searches, curates Resources, writes Lessons, and authors Tasks. It runs once per Course, and again when the user asks for another Rung or a remediation block.
_Avoid_: Generator, author, builder, planner

**Tutor**:
The conversational role the user asks for hints and explanations while studying.
_Avoid_: Assistant, helper, coach

**Grader**:
The role that judges an Attempt whose Check is `model` or `rubric`.
_Avoid_: Evaluator, marker, reviewer, judge

**Run**:
One execution of the Constructor against one Course: a build, an added Rung, or a remediation block. Every Run has a spend cap and is recorded.
_Avoid_: Job, generation, session, build (as a noun)

**Harness**:
An agent program the app spawns to do any job that needs a model, such as `claude`, `codex`, or `pi`. It is declared in a registry, never seen by the student, and chosen per role in Settings alongside the model.
_Avoid_: Runner, driver, agent framework, provider

**Agent profile**:
What makes one role differ from another: a working directory, a role instruction file, a plugin bundle, a tool allowance, and a budget. The Constructor, Tutor, and Grader are three profiles over one spawn mechanism.
_Avoid_: Mode, persona, configuration

**Skill set**:
The skills the app ships for one role, copied into that run's own folder so any [[harness]] can read them whatever plugin format it has. Hidden from the user. The authoring set carries the Course format itself, and tells the Constructor what agents can handle at study time.
_Avoid_: Plugin, bundle, extension, pack, toolkit

**Staging**:
The folder a Course is written into while it is being built, outside the library. A Course in Staging is not listed and cannot be opened. Only a folder the parser accepts moves out of it, and it moves in one step.
_Avoid_: Draft, temp, scratch, working copy

**Moment**:
One thing the app understood a [[harness]] to have done, in the app's own words: it started, it said something, it is doing something, a file appeared, it finished, it failed. A Moment is all the interface ever receives, which is what makes the harness invisible.
_Avoid_: Event, message, update, chunk

**Stopped build**:
A build that ended without producing a Course, usually because a plan's usage limit ran out. It keeps its staging folder and what it needs to carry on, and the home screen offers it back. Carrying on resumes the same harness session on the same folder.
_Avoid_: Failed build, crashed, draft

**Live snapshot**:
The file the app writes with the current study state, immediately before a spawn and never otherwise, so a [[harness]] can see what the student is doing without an API. It is written into the folder the run was given, never into the Course, because a Tutor may not change a byte of a Course.
_Avoid_: State file, status, telemetry

**Trouble**:
What comes back when a [[grader]] could not judge an Attempt: a run that failed, a budget that ran out, or an incomplete [[verdict]]. It carries a sentence and never an outcome, nothing is recorded, and the Attempt stays open. It is not a fail.
_Avoid_: Error, failure, invalid

**Review**:
The action a student takes to send a Mini-app's output to the Grader for judgement. It always starts from the student, never from the Mini-app.
_Avoid_: Check, submit, evaluate
