---
status: accepted
---

# Generated Mini-apps run fully sealed: no files, no network, no host state, one message channel

Mini-apps are code written by an automated process against material fetched from the open web, so they are treated as untrusted even though the model is trusted. Each runs in an iframe with `sandbox="allow-scripts"` only, an opaque origin, and a Content Security Policy that denies every external resource and every connection. The host passes inputs in and receives `ready`, `resize`, and `result` back by `postMessage`, and nothing else crosses. A per-course network allowlist was considered and deferred, because the host can hand a Mini-app any data it needs, so network access bought little and removed the whole security argument.

## Consequences

The Constructor must produce a single self-contained `index.html` per Mini-app with everything inline, and the validator rejects any external reference. Mini-apps that need live data are out of scope until the allowlist is revisited.
