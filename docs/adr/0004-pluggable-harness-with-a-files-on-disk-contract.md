---
status: superseded by ADR-0009
---

# The Constructor Harness is pluggable, and its only contract is files on disk plus an event stream

Victor wants to build Courses with the Claude Agent SDK today and with other agent harnesses such as pi and Codex later. So the host never calls a model directly to build a Course. It gives a Harness a brief, a staging folder, a budget, and the format spec, then validates whatever the Harness wrote and moves it into place.

Superseded by ADR-0009, which extends the same contract to every model role rather than only the Constructor. The reasoning below still holds for the Constructor; what changed is that the Tutor and Grader were wrongly excluded.

## Consequences

The format validator is the real interface and must be strict, because it is the only thing standing between an arbitrary agent's output and the reader. A Harness never writes into `courses/` directly.
