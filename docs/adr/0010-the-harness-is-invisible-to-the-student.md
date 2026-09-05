---
status: accepted
---

# The student never sees a harness

Strudel++ docks a raw terminal pane, which suits a user who lives in a terminal. Victor was explicit that Whetstone is the polished case and the student must not have to see a harness, so Whetstone drives the same agents through their headless interface and renders typed JSON events into its own interface. No terminal appears anywhere in the study surface. Tool calls become short status lines in the app's own vocabulary, tool results render as nothing, and a spawn failure becomes one plain sentence with a retry rather than an exit code.

## Consequences

The app cannot take the shortcut of showing raw output, so every harness needs an adapter that normalises its stream into one event union, and an unmapped tool name must render as nothing rather than leak. The Constructor's run is the single partial exception: building a Course takes minutes and costs money, so it shows an activity feed written from those same typed events, with the raw stream behind a closed disclosure for debugging only.
