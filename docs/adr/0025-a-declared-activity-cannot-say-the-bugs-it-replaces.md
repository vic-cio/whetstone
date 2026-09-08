---
status: accepted
---

# A declared activity cannot say the bugs it replaces

Everything the parser checked about a Mini-app was three things: `apps/<id>/index.html`
exists, it holds no external reference, and the Course's toolkit version matches the
manifest. Two real Courses parsed cleanly and shipped broken anyway: a Task whose expected
answer equalled a widget's own untouched starting state, so pressing Answer without doing
anything passed; and an `assertions-pass` check that matched the raw text of what the
reader typed (`indexOf('bd*4')`) instead of running it.

Neither bug was a parser gap that a stricter regex would have caught. Both were possible
because the thing being checked — a hand-written `apps/<id>/index.html` — is arbitrary
code, and nothing short of running it and reasoning about its behaviour can tell whether an
assertion is honest or a widget's rest state happens to be the answer.

## The decision

For the eight toolkit widgets, add a declared-activity schema: the Constructor writes data
(`activities/<id>.json`), not code. A build step compiles it into an ordinary
`apps/<id>/index.html` before the parser ever runs, so everything downstream — the
parser's `apps/` checks, `frameSource`, the execution gate below — treats it exactly like
a hand-written Mini-app. A bespoke, hand-written Mini-app remains fully supported for
anything the schema cannot express; this is an alternative path for the common case, not a
replacement.

Two structural invariants do the actual work, both enforced at compile/parse time rather
than left to a Constructor instruction:

- **One universal rule, not eight bespoke ones.** For any declared activity with an
  `expected` answer (an `app-result` Task's `answer`, cross-checked against the widget's
  own computed starting state in `parseCourse`), the build fails if they are equal.
  `Kit.order`'s identity order, `Kit.slider`'s default value, `Kit.sim`'s starting state —
  one rule, not a special case per widget, and it generalises to a ninth widget for free.
  No escape hatch: a Course that genuinely wants "the correct answer is the default" has
  no way to say so, on purpose — nothing in the evidence that motivated this showed anyone
  needing that, and an override would reopen exactly the hole this closes.
- **A closed comparison DSL for `Kit.editor`'s assertions, not free-form JS.** A declared
  editor's assertion is `{name, export, args, check: {type: 'equals'|'range'|'matches', ...}}`,
  evaluated against the real executed export value. There is no field an assertion could
  use to inspect the raw source text, which is what makes the shipped bug unrepresentable
  rather than merely harder to write. A bespoke code Mini-app keeps today's `Kit.editor`
  with a free-form `test(api)` function exactly as it is (docs/adr/0016); this DSL applies
  only to the declared path.

`Kit.steps` and `Kit.plot` are presentation-only in the declared schema: neither has a
natural "answer," so the schema does not let the Constructor invent one. `Kit.sim` keeps
`step`/`draw` as function-body strings rather than pretending a simulation is expressible
as pure data — a simulation is defined by its behaviour, and a data shape that pretended
otherwise would either be dishonest or would have grown into a bad programming language in
JSON, the same trap docs/adr/0016 already named for a Strudel REPL.

## A second gate for what the schema cannot cover: real execution

The declared-activity schema closes the two bugs that shipped, but only for the common
case. A bespoke Mini-app is still arbitrary code, and nothing checked that it parses, that
it draws, that pressing its action button sends anything, or that its button is legible.
So a second, independent gate runs at build time, generically, over every Mini-app —
declared or bespoke: boot it in a real, hidden `BrowserWindow` through the same sealed
frame a reader gets, require `Kit.bridge.ready()` with no thrown error, require that
pressing at least one `.k-btn` (the only class `Kit.bridge.action` ever renders) produces
an `answer` or `review` message, and require a readable contrast ratio on every `<button>`
in both light and dark theme. It knows nothing about what a specific app does — only that
the toolkit's own contract holds — which is what lets one mechanism cover both declared
and hand-written Mini-apps.

Gate failures are shaped exactly like a parse error (a file and a message) and flow
through the existing three-attempt repair loop in `src/main/build.ts`, rather than
inventing a second repair path.

## Considered options

**Detecting a bad assertion by analysing arbitrary JS** was rejected. Telling a good
`test(api)` from an `indexOf` on raw text requires judging code quality, which is a much
harder and leakier problem than restricting what a declared assertion is allowed to be.

**A per-widget "does the answer differ from the start" check, written once per widget**
was rejected in favour of the one universal rule above. It is the same invariant eight
times with eight chances to miss a widget, or a ninth one added later without the rule
following it.

**Re-checking a Mini-app's behaviour after a toolkit update, not just at build time** was
rejected for now, per Victor: a runtime check that finds a Mini-app broken needs something
that can act on the finding, and the Constructor that would fix it may be unavailable or
out of credit at that point. Handling that is a separate mechanism, not built here. This
gate runs once, at build time, and a Course that has already shipped is not re-verified
against a later toolkit.

**Reusing `tests/sandbox.test.ts`'s full `WHETSTONE_CAPTURE*` harness verbatim** for the
execution gate was rejected — it drives the whole app's UI to reach one Mini-app, which is
slow and couples the gate to unrelated navigation. The gate instead loads `frameSource()`'s
output directly into its own hidden window, keeping the same sealed-frame guarantees
(`sandbox="allow-scripts"`, a `data:` URL rather than `srcdoc`, for the same CSP-inheritance
reason production avoids `srcdoc`) without the UI on the way there.

## Consequences

A Constructor writing the eight common widget shapes now writes data, and the two bugs
that shipped are unrepresentable rather than merely discouraged. A bespoke Mini-app is
unrestricted, exactly as before, but is now proven to boot, answer, and be legible before
a Course ever reaches a reader. `docs/toolkit.md` and
`agent/skills/authoring/writing-a-mini-app/SKILL.md` need to describe the declared path as
the default for the widgets it covers, and when to still reach for a hand-written
`index.html`.
