---
status: accepted
---

# The Progress DB uses Node's own SQLite, not a native module

`better-sqlite3` is the usual choice and the plan named it. It is a native module, so it
must be compiled against the exact Electron ABI, rebuilt on every Electron upgrade, and
rebuilt again for each architecture that ships. Node 22.5 added `node:sqlite`, and
Electron 44 carries Node 24.20, so the same synchronous prepared-statement API is already
in the runtime with nothing to build.

Both write identical SQL. The difference is entirely in the build, and the build is where
an Electron project loses its afternoons.

## Consequences

`npm run dist:mac` needs no rebuild step and no `electron-rebuild` dependency. `.nvmrc`
moves to Node 24, because the tests import the same module outside Electron and a Node
below 22.5 has no `node:sqlite` at all.

The cost is a narrower API: no user-defined functions, no extensions, and no async
variant. Nothing in the plan needs any of those, and swapping drivers later is a change to
one file, `src/main/progress.ts`, because the SQL is standard.
