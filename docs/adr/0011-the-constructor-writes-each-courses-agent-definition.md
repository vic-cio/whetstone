---
status: accepted
---

# The Constructor writes the agent definition the Tutor runs under

A general model answering questions about a Course it cannot see is the weakest part of any learning app. Since the Constructor authored the material, it also writes the `AGENTS.md` and the Course-specific skills that the Tutor and Grader load when they operate inside that Course folder: what the Course teaches and in what order, the common misconceptions per Objective, which Lesson answers which question, the notation the material uses, and how strictly to read each Rubric. A Course therefore carries its own teacher, and a shared copy carries it too.

## Consequences

This lands inside the Course folder, so it is covered by the existing rule that only the Constructor writes there, and the Tutor's read-only tool allowance enforces it. The app must seed the same skill set into both `.claude/skills/` and `.agents/skills/`, because different harnesses look in different places. A Course built before this existed still works, with the Tutor falling back to the app-level role instructions.
