# Whetstone: what to do next

**Written:** 2026-09-07
**Written by:** Claude Opus 5, from a bug sweep and three interview rounds with Victor.
**Written for:** the next session, starting cold.
**Status:** settled. Nothing waits on Victor. Part A is ready to write and part B is designed.

---

## 0. How to read this

There are two pieces of work and they are not the same size.

- **Part A** is a bug sweep. Eleven defects, found by reading the whole of `src/`. All 266 tests pass and `tsc --noEmit` is clean, so no test catches any of them. Part A is about a morning.
- **Part B** is a phase. It reworks the Test, adds Projects, adds a fourth role, and turns defect reports into Constructor runs. Part B is weeks.

Do part A first. The app currently tells the reader that the Grader "arrives with the tutor", and the tutor arrived in phase 4. Every hour part B waits is an hour the app is lying on screen.

Read `PLAN.md` for the design and `CONTEXT.md` for the vocabulary. Use those words exactly. `HANDOFF.md` is the original design handoff and is historical.

---

# Part A. The sweep

## 1. The findings

| # | What | Where |
|---|---|---|
| 1 | The Grader cannot be reached from the interface | `src/renderer/Answer.tsx:221` |
| 2 | The tutor's Attach button can never be pressed | `src/main/index.ts:239`, `src/renderer/Tutor.tsx:50` |
| 3 | Settings' Constructor row is never read | `src/renderer/NewCourse.tsx`, `src/renderer/App.tsx:255` |
| 4 | A sentence with a pipe in it is eaten as a table | `src/shared/markdown.ts:105` |
| 5 | One moment channel carries every run | `src/preload/index.ts`, `src/main/index.ts` |
| 6 | A defect report can be filed and never read | `src/main/progress.ts` |
| 7 | `add-rung` has no button | `src/main/revise.ts` |
| 8 | A Try's prompt skips the inline parser | `src/renderer/Lesson.tsx:93` |
| 9 | `coursesRoot()` re-hashes the samples on every call | `src/main/courseStore.ts:56` |
| 10 | An outside drag reorders an ordering list | `src/renderer/Answer.tsx:122` |
| 11 | The Grader shares one state folder across attempts | `src/main/workspace.ts` |

A twelfth was found and dismissed. The spend cap never fires for `pi`, because `pi` reports its cost once, at `agent_settled`, after the run is over. Worse, when the cap does trip the app kills a process that has already exited and reports a run that finished as failed, discarding work already paid for. **Victor is handling limits at the provider portals, so this is not being fixed.** If it is ever picked up, the fix is a per-turn cost moment from `pi` and a cap that kills on a running total. The false sentence at `src/main/harness.ts:273` is the part worth removing even now.

## 2. The ones that need explaining

**1. The Grader cannot be reached.** `Answer.tsx` renders a phase 3 placeholder for `short-answer` and `submission`. `gradients-by-hand` ships one of each, so a Course that ships with the app has two questions nobody can answer. Everything behind the placeholder is built and correct: `answering.ts` routes to `judge()`, `Test.tsx` already passes the grader's harness and already draws the rubric and the `Scored` component. What is missing is two input controls. Part B replaces this whole screen, so build the controls in a shape part B keeps.

**2. The tutor's Attach.** Two bugs make one dead feature. `tutor:thread` returns `attached: []` hardcoded, so a reopened conversation never lists its files. And `Tutor.tsx` takes `chatId` only from that read, while `tutor:ask` returns no id, so after the first question the button is still disabled. Return the real list, and return the thread id from `ask`.

**3. The Constructor row.** Settings writes `constructor.harness` and `constructor.model`. `NewCourse` picks the first installed harness by itself, and a remediation run uses the **tutor's** row. The role whose model matters most is the one the setting cannot reach.

**4. The markdown table.** `markdown.ts:105` takes any line holding a pipe when the next line looks like a rule. There is no thematic break rule, so `---` under a sentence qualifies. Measured:

```
Use a | b to pipe.
---
```

That becomes a two-column table with no rows, and the sentence is split across the headers. The prose is destroyed, not just misdrawn. Fix: add a thematic break rule, and require the header and the rule to agree on cell count. Two smaller ones in the same file: `snake_case` in prose becomes emphasis, and emphasis holds plain text only so a code span inside bold shows raw backticks. Fix the first. Leave the second, and say so in a comment.

**5. The moment channel.** `run:moment` is global. `Tutor` and `NewCourse` both subscribe. This is quiet only because of finding 1. Once a Task can be graded, grading one with the tutor panel open puts the Grader's words into the tutor's reply, and a Grader failure sets the tutor's error line. Give every run an id and put it on each `Moment`. A panel draws its own run and ignores the rest.

**6 and 7** are covered by part B and should be left alone until then. Do not delete `voidAttempts`; part B calls it.

---

# Part B. The phase

## 3. What changes, in one paragraph each

**3.1 A Test becomes a sitting.** Today every answer is recorded the moment it is given, and a wrong one offers another go. That collapses the Test into the Lesson. From now on a Test is a sitting. You answer a question and press Check. The run happens then, in the background, and the result is **held**. When the last question is checked, every result is revealed at once. There is no mark and no number: the reveal is the list of questions with a tick or a cross beside each. Two things follow the reveal. **Get feedback** shows, per question, what you gave, whether it passed, and the Task's own explanation. **Retake** starts a fresh sitting with nothing shown.

**3.2 The Grader stays amnesiac.** Each question is checked by its own run, holding only that question, its guide and your answer. Nothing is shared between questions and nothing is carried from a previous attempt. This is already how `judge()` works. Do not optimise it into one conversation that marks the whole Test; the independence is the point.

**3.3 A question that follows another.** The one exception to 3.2. A Task may name the Tasks it builds on. The run marking it is then shown those questions **and the reader's own answers to them**, not the correct ones. So a wrong part a followed by a correct method in part b passes part b. This is the error-carried-forward rule a real examiner uses, and without it one mistake costs two questions.

**3.4 A Test says how long it should take.** An indicative time, written by the Constructor, shown as a subtitle. Nothing counts down and nothing is enforced.

**3.5 Answers survive a closed window.** Held answers are saved as you go, so a half-answered Test resumes. A Test with a project-depth submission can take a day, and losing that to a closed lid is the kind of failure that stops somebody trusting an app.

**3.6 Projects.** A Course may carry a Projects section, below the last Module on the Course page. The Constructor asks in the Brief whether this Course wants one. A project is an open-ended assignment covering a theme or the whole curriculum. You do it outside the app with ordinary tools. You come back and submit a folder and a list of links. There is no tutor panel on a project page: the point is that it is a real-world setting.

**3.7 The reviewer.** A submitted project produces one written response, in the register of a senior colleague reading your work, not a marker scoring it. No pass, no fail, no number. It is organised around the criteria the Constructor wrote with the brief, so the criteria exist before you start and the work is finishable. There is no thread. If you want to argue with it you take the criteria, your work and the response to an ordinary chat outside the app. You may resubmit, and the reviewer has no knowledge of a previous attempt. Keeping past work is yours to do.

**3.8 A defect report brings the Constructor in.** Reporting a Task as broken now starts a run. The Constructor reads the Task, your note and the ground you named, and comes back with a quick evaluation: either it agrees, or it names something you may have missed. **You then have the authority to override it.** When the report stands, the Attempts against that Task are voided and the Task is remade or removed. Voided is already a state in the schema, and the missed list and the struggling count already skip it.

**3.9 Revision at module scale.** A report is the small case. You must also be able to tell the Constructor that a whole Module is irrelevant or badly written, and have it rebuilt, or removed outright when it was an unnecessary addition.

**3.10 Tags, and small courses.** A Course carries tags, and the library filters on them. The Constructor writes them in the Brief, and it is shown the tags already in your library and told to reuse one that fits before inventing a new one. A fixed list would be wrong for the next niche course; free tags alone drift into `ml`, `machine-learning` and `ML`. Separately, a Course carries a `small` flag. Small is a field and not a tag, because it changes behaviour: a small Course has Projects disabled. You tell the Constructor in the Brief that a Course will be a small one.

## 4. Format changes

These are the expensive ones, because the parser, the authoring skills, the Constructor's instructions and every Course already written all move together. Do them in one pass.

**`course.json`**

```jsonc
{
  "tags": ["fourier", "signals"],   // default []
  "small": false,                   // default false. true disables projects.
  "projects": [                     // default []. Absent on most courses.
    {
      "id": "prj-...",
      "title": "...",
      "brief": "...",               // the assignment, in prose
      "criteria": [{ "id": "cri-...", "criterion": "..." }],
      "accepts": ["folder", "links"]
    }
  ]
}
```

Projects are a top-level array, not a Page type. A Page type would reach into `Module`, the rail, the tick rules, the next-page logic and the keyboard navigation. A section below the last Module reaches none of them.

**A Task**

```jsonc
{ "follows": ["tsk-..."] }   // optional. Tasks this one builds on.
```

The parser must check that each id exists, that it is in the same Test, and that it appears earlier in that Test's `tasks` array. A cycle is an error.

**A Test**

```jsonc
{ "minutes": 20 }   // optional, indicative only
```

## 5. Database changes

- **`held_answers`**: `courseSlug`, `testId`, `taskId`, `sittingId`, `givenJson`, `checked`, `resultJson`, `at`. One row per question per sitting. Written as you check, read on resume, and left in place after the reveal so feedback can be drawn from it.
- **`attempts`**: add `sittingId`, nullable, so the reveal can group one sitting and old rows stay valid. A retake writes fresh Attempts under a new `sittingId`. Both sittings stay in the record, and the missed list reads the latest.
- **`project_submissions`**: `id`, `courseSlug`, `projectId`, `submittedAt`, `links`, `responseText`. Every response is kept, because it is text and it is cheap. The folder is not kept, because Victor said storing past work is his.
- **`defect_reports`**: add the Constructor's evaluation text and whether Victor overrode it.

## 6. New roles and files

- `agent/roles/reviewer.md` and `agent/skills/reviewing/`. Settings gets a fourth row. Its cap is larger than the Grader's, because it reads a folder rather than a file.
- `revise.ts` gains work kinds: `fix-task`, `remove-task`, `rebuild-module`, `remove-module`, `add-project`. Each keeps the existing rule that a run copies the Course, works in staging, and only a folder the parser accepts goes back.
- The `remove` kinds break the current "add, never rewrite" instruction, so they need their own wording. Removing a Task that would empty a Test is not allowed: the Constructor writes a replacement instead. A Test page vanishing from a Course you are partway through leaves a hole in the contents.

## 7. Guards worth writing down

- A project folder is copied into an attempt folder. A real project folder carries `.git` and `node_modules`. Cap the size and skip the obvious names, or the first submission copies four gigabytes.
- Every run gets an id on its moments before the reveal screen is built, or the Grader's words land in the tutor panel. This is finding 5 of part A, and part B makes it reachable.

## 8. Verification

Write these before the code. They are the parts that fail quietly.

1. A Test with one deterministic and one model question, closed halfway and reopened, shows what you typed.
2. A checked question stays checked and shows nothing until the last one is checked.
3. A part b marked after a wrong part a passes when the method is right.
4. A defect the Constructor disagrees with leaves the record untouched until Victor overrides.
5. A removed Task leaves the Course parsing, and its Attempts voided rather than dangling.
6. A removed Module leaves the Course parsing, and every Attempt under it voided.
7. Nothing in the app displays a score, a percentage or an average. This is the rule most likely to be broken by accident while building the reveal screen.

## 9. Why the results are held

**Settled, and written up as `docs/adr/0022`.** Read that rather than this section. It holds the reasoning, the two rejected options, and the reason a mark at the top of the reveal is the thing most likely to creep back in.

## 10. Order of work

1. Part A, findings 1 to 5 and 8 to 11. Leave 6 and 7 for part B.
2. The format changes in section 4, in one pass, with the authoring skills updated in the same commit.
3. The Test as a sitting: held answers, check, reveal, feedback, retake.
4. Defect reports and the revision work kinds, including module scale.
5. Projects and the reviewer.
6. Tags, the library filter, and `small`.

## 11. Decisions, and who made them

| Decision | Who |
|---|---|
| No mark, no number. Ticks and crosses at the reveal | Victor |
| Results held until the last question is checked | Victor |
| Each question checked by its own amnesiac run | Victor |
| A dependent question is marked on the reader's own earlier answer | Victor |
| Answers saved as you go, retake button at the bottom | Victor |
| Indicative time, no timer | Victor |
| Projects, optional, asked at Brief time, no tutor panel | Victor |
| One written response, no thread, no memory of a previous attempt | Victor |
| The Constructor evaluates a defect report, Victor overrides | Victor |
| Module-scale rebuild and removal | Victor |
| Tags, reused from the library where they fit | Victor |
| A retake writes fresh Attempts and both sittings stay | Claude |
| Projects are a top-level array, not a Page type | Claude |
| A removal that would empty a Test writes a replacement instead | Claude |
| `small` is a field, not a tag | Claude |
| Every response kept, no folder kept | Claude |

## 12. What this deliberately does not do

- No score, no percentage, no average, no history of marks. Revisit only by rewriting PLAN 3.4, deliberately.
- No timer on a Test.
- No thread on a project review.
- No shelf life on a small course. A Course that deletes itself would be the first thing in this app that throws away your work without being asked.
- No fixed tag vocabulary.
- No spend cap work. Limits are handled at the provider portals.
