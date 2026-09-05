---
status: accepted
---

# A Mini-app is served over its own scheme, rather than written into `srcdoc`

The host window denies inline scripts, because it is the window holding the preload bridge and it renders text an agent wrote. A frame created with `srcdoc` inherits the embedding document's Content Security Policy, so a Mini-app delivered that way inherits `script-src 'self'` and cannot run at all. The frame needs a policy of its own, which means it needs a response of its own.

So the main process registers `whetstone-app://<course>/<app>` and answers it with the composed document, its own policy in a real header. The renderer sets the frame's `src` and never holds the document.

## Considered options

A `data:` URL was rejected because a document loaded from a local scheme can inherit the embedder's policy in the same way, which is the problem being solved. Loosening the host window's policy to allow inline scripts was rejected outright: that window holds the bridge to the main process, and it is the last place to weaken.

## Consequences

`sandbox="allow-scripts"` still puts the frame on an opaque origin, so the scheme buys the frame a policy and nothing else. The renderer's own policy gains `frame-src whetstone-app:`, which is narrower than what `srcdoc` needed. A Mini-app that fails to compose is answered with a 404 rather than an exception in the renderer.
