---
status: accepted
---

# The sealed frame allows eval, because running the learner's code is the point

`assertions-pass` is the coding-course Check: the learner writes code inside a Mini-app and the Constructor's assertions run against it. Nothing can run code without `eval` or `new Function`, so the frame's Content Security Policy carries `'unsafe-eval'` beside the `'unsafe-inline'` that runs the Mini-app itself.

The name overstates the cost here. The policy already allows the Mini-app's own inline script, so arbitrary code was always going to run in that frame. What `'unsafe-eval'` adds is that the learner's code runs too, in a frame with an opaque origin, no network, no storage, no files, no agent, and no reach into the host. It gains nothing the Mini-app did not already have.

## Considered options

Sending the code to the main process to run was rejected: the main process is the one place with a filesystem and a spawn, and moving untrusted code there to avoid a word in a policy trades a real boundary for a nominal one. A parser or interpreter written in the toolkit was rejected as a large amount of code that would support one language badly.

## Consequences

`Kit.editor` is the only thing in the toolkit that evaluates, and a Mini-app that needs to run code uses it rather than writing its own. The strength of the sandbox rests on the frame having nothing worth reaching, which is what test 7 checks.
