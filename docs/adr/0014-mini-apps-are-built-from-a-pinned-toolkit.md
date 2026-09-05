---
status: accepted
---

# Mini-apps are built from one toolkit, pinned per Course

Letting each Constructor run write bespoke markup, styling, and message handling for every activity would make each Course look and behave like a different product, which is the opposite of what Victor asked for. So the app ships a toolkit of widgets (slider, plot, draggable tokens, hotspot, code editor with assertions, walkthrough, stepped simulation) plus a bridge that replaces raw `postMessage`, and the host inlines it into every sandboxed frame because the sandbox forbids fetching anything. The Constructor is instructed to build from it, and to report which widget was missing when it has to write its own.

## Considered options

Letting the Constructor inline its own copy of a shared library was rejected because copies drift and nothing then guarantees two Courses agree. Having the host always inject its newest toolkit was rejected for the opposite reason: it would silently change how an already-built Course behaves after an app update, which breaks the promise that a Course is fixed once written.

## Consequences

A copy of the toolkit lives in each Course folder with its version in `course.json`, and the host injects that copy rather than its own, so a shared Course renders identically elsewhere and survives app updates. The bridge becomes the single implementation of the sandbox protocol, which removes a class of subtle per-activity bugs. A gap in the toolkit is treated as a defect in the toolkit rather than a licence to restyle.
