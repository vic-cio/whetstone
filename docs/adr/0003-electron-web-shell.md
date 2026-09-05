---
status: accepted
---

# The app is an Electron web shell, not a native SwiftUI app

Victor asked for a macOS app, and the obvious reading is SwiftUI. We chose a web shell in Electron with React and TypeScript instead, because every generated Mini-app is web code, so the content layer is a web runtime whichever shell wraps it, and because every candidate Constructor Harness (Claude Agent SDK, `@openai/codex-sdk`, `@mariozechner/pi-agent-core`) is a Node library that Electron ships in-process. Tauri was the lighter alternative and lost only because its Rust backend would need a bundled Node sidecar to host those Harnesses.

## Consequences

The app is roughly 200 MB on disk and has no menu bar presence, Spotlight indexing, Shortcuts integration, or iPad path. Revisit if any of those becomes a requirement.
