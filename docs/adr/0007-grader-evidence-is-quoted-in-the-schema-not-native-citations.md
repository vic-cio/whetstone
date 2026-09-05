---
status: superseded by ADR-0009
---

# The Grader returns evidence as quoted strings inside its own schema, not through native citations

The Verdict needs a validated JSON object with every criterion scored, and it also needs evidence from the Submission. Anthropic's API rejects a request that enables document citations together with structured output, so the two cannot be combined in one call. We chose to keep the single structured call and have the Grader copy short quotes into an `evidence` field per criterion, rather than make a second citations call or route quotes through a strict tool. The cost is that quotes are not machine-verified against the document; a test asserts each quote appears verbatim in the Submission text where the file type allows it.


## Superseded

This tension existed only because the Grader was a single Messages API call, where citations and a validated schema cannot combine. Under ADR-0009 the Grader is an agent that reads the Submission with its own tools, so it quotes what it actually read and the app still receives a validated object. The verbatim-quote check survives as the test; the trade-off does not.
