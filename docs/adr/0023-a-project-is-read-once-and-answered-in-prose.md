---
status: accepted
---

# A Project is read once and answered in prose

A Course may carry Projects: open-ended assignments covering a theme or the whole curriculum. You do one outside the app with ordinary tools, and come back and submit a folder and a list of links.

Everything else the app assesses is a Task inside a Test, and a Task is a question with a shape: a set of options, a number, an ordering, a rubric with criteria to score. A project has none of that. It is a piece of work, and the useful thing to say about a piece of work is what a colleague would say about it.

So a submitted Project produces one written response, in the register of a senior colleague reading your work rather than a marker scoring it. No pass, no fail, no number and no thread. It is organised around the criteria the Constructor wrote with the brief, so the criteria exist before you start and the work is finishable.

## Considered options

**A Project as a Page type.** Rejected. It is the obvious shape, because a Project reads like a third kind of Page beside a Lesson and a Test. But a Page type reaches into `Module`, the rail, the tick rules, the next-page logic and the keyboard navigation, and every one of those would need a case for a thing that is not read in order and cannot be ticked by reaching its end. A section below the last Module reaches none of them, and `projects` is a top-level array in `course.json` for that reason.

**A rubric-scored submission, like a `project` depth Task.** Rejected. The machinery exists and it would have been the cheapest thing to build: a Verdict per criterion with evidence and what was missing, and an outcome. It is the wrong instrument. A criterion scored met or unmet is a good way to check that a piece of work contains what was asked for, and a bad way to say what the work is. It also produces an outcome, which produces a pass rate, which is the score PLAN 3.4 does not have. The criteria stay, as what the response is organised around; the scoring goes.

**A thread on the response.** Rejected by Victor. Arguing with a review is worth doing and the app is the wrong place for it: a thread here would be a Tutor that had read your project, which is a different product. Take the criteria, your work and the response to an ordinary chat outside the app. What the app keeps is the response.

**A tutor panel on a Project page.** Rejected, and this is the one that would have arrived by accident, because the panel is on every other page. The point of a project is that it is a real-world setting. It gets no panel by sitting outside `route.at === 'page'` rather than by a flag, so nothing has to remember the rule.

## Consequences

The Reviewer is a fourth role, with its own row in Settings and a larger cap than the Grader's, because it reads a folder rather than a file. It reads and writes nothing: the response is its message.

A resubmission is read by a run that has never seen the last one. That is the Grader's amnesia applied here for the same reason: a reviewer that remembered would be grading the difference rather than the work. Every response is kept, because it is text and it is cheap. The folder is not kept, because storing past work is the reader's own business.

A real project folder carries a repository and a package tree, so what is copied out of it skips the obvious names and stops at 32MB. Without that the first submission copies four gigabytes into the app's data folder, and none of it is the work.

A `small` Course carries no Projects. That is why `small` is a field rather than a tag: it changes what the Course does, and the parser refuses a manifest that says both.

The one thing to watch is the register. Every model has read a thousand rubrics, and the pull toward a score, a grade, or a strengths-and-weaknesses list is strong. `agent/roles/reviewer.md` says so three times and `tests/project.test.ts` pins those lines, because there is nowhere in the database for a mark, so a mark in the prose would be the only score in the app.
