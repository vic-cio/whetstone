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
An interactive artifact the Constructor wrote as code and stored inside the Course folder. It runs in a sandbox, is built from the [[toolkit]], and reaches the host through one narrow message channel.
_Avoid_: Widget, applet, component, embed

**Toolkit**:
The widget set and host bridge the app injects into every Mini-app, pinned per Course so a shared Course behaves the same everywhere. It is what makes activities across different Courses look and work alike.
_Avoid_: Library, framework, SDK, components

**Bridge**:
The single way across a line the app draws on purpose. The preload Bridge is how the renderer reaches the main process. `Kit.bridge` is how a Mini-app reaches the host. Each is the only way across its own line, and neither can reach the other.
_Avoid_: API, IPC layer, interface, channel

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

**Plugin bundle**:
A folder of skills, subagents, and hooks the app ships and loads for one role. Hidden from the user. The authoring bundle also tells the Constructor what agents can handle at study time.
_Avoid_: Extension, pack, toolkit

**Live snapshot**:
The file the app rewrites continuously with the current study state, so a Harness can see what the student is doing without an API. Read fresh, never cached.
_Avoid_: State file, status, telemetry

**Review**:
The action a student takes to send a Mini-app's output to the Grader for judgement. It always starts from the student, never from the Mini-app.
_Avoid_: Check, submit, evaluate
