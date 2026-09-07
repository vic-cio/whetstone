---
status: accepted
---

# The Constructor answers a defect report, and the reader can override it

A defect report is a claim that a Task itself is broken, on exactly three grounds: it rests on something that is not true, it cannot be done as written, or something broke. It is not a dispute about a Verdict, and upholding one never rescores anything.

Until now filing one wrote a row and stopped. Nothing read it, nothing acted on it, and the reader was told "reported" by an app that had quietly filed their complaint in a drawer. That is worse than having no button: it teaches somebody that saying something is broken achieves nothing.

Filing one now starts a run. The Constructor reads the Task, the note and the ground, in a folder holding nothing else, and comes back either agreeing or naming something the reader may have missed. It settles nothing. The reader upholds the report or drops it, and **overriding a Constructor that disagrees is theirs to do.** A report that stands voids the Attempts against that question and sends it back to be mended or removed.

## Considered options

**Uphold every report.** Rejected. It is the reader's own app and their word could simply be final, which is the shape with the least machinery. It makes the button expensive to press honestly: every report rewrites a question, so a reader who is not sure learns to keep quiet rather than risk churning a Course they are halfway through. A question the reader misread is also the most common case, and rewriting it destroys the thing they misread instead of explaining it.

**Let the Constructor decide.** Rejected, and it is the version that looks most like the rest of the app, because the Grader decides and the reader lives with it. A Grader is judging an answer against a guide it was given. Here the Constructor is judging its own work, and a role marking its own homework will defend it. Worse, being wrong here is not recoverable by trying again: the reader is told the question is fine and has nowhere left to go.

**A conversation about it.** Rejected. A thread would let the reader make their case and the Constructor answer, which is what a person would want. It is also a Tutor with a different name, and it turns a two-press decision into a negotiation about a question the reader is meant to be spending their attention on. One answer, then a decision.

## Consequences

The evaluation is read on the same rule as a Verdict: an answer that does not begin with `AGREE` or `DISAGREE` and give a reason is trouble, not a decision. Nothing is recorded and the report stays exactly as it was filed. A guess here either waves away a real defect or voids somebody's Attempts on a run that never ran.

Upholding is the only call that touches the record, and what it touches is the outcome of the Attempts against that Task, which become void. Voiding rewrites an outcome and never adds a row: `docs/adr/0001` and the missed list both depend on that.

`revise.ts` gains `fix-task` and `remove-task` for what happens next, and `rebuild-module` and `remove-module` for the same thing at Module scale, which is the case a defect report is too small for. Those four break the "add, never rewrite" instruction every other revision run is given, so they carry their own wording: change what you were named, and nothing else.

A removal that would empty a Test is refused, in the interface and again in the instruction, and the Constructor writes a replacement question instead. A Test page vanishing from a Course somebody is part way through leaves a hole in the contents, which is a worse defect than the one being repaired.

Removing a Module voids every Attempt under it before the run starts, because an Attempt against a question that no longer exists is a mark for something nobody can look at.
