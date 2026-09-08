---
status: accepted
---

# A codeblock runtime is fetched at build time, allowlisted, boot-verified, and shared

`Kit.editor` ran only JavaScript, evaluated in-frame with `new Function` (docs/adr/0016).
`Kit.run` pulls that into a language-dispatch core `Kit.editor` and the new `Kit.codeblock`
both call: `js` stays built in, and any other language comes from a runtime the host
inlined into the frame, keyed on `window.__whetstoneRuntimes[lang]`. This is the decision
about where that runtime comes from and how it is stored.

The sealed frame has no network, permanently (docs/adr/0016), so a Course cannot fetch a
runtime itself. The Constructor can: it has real network access during the build, and no
access at all once the Course is finished. So a language beyond `js` is fetched once, at
build time, and what ships in the Course is the result — same as the toolkit and library
are already inlined server-side today (docs/adr/0014, docs/adr/0019).

Two more decisions follow from what a runtime actually is: a large, opaque, third-party
binary, unlike the Constructor's own toolkit-widget code or a Course's own library.

**Only a hand-picked source is trusted.** Nothing reads a fetched runtime before it ships,
so the Constructor cannot point this at an arbitrary URL it found; it can only ask for a
language on `ALLOWED_RUNTIMES` (`src/main/runtimeFetch.ts`). Asking for anything else fails
the build by name, the same way a bad file or field does elsewhere (`agent/roles/constructor-build.md`).

**A fetched runtime is proven before it is cached.** Downloading is not the same as
working. Before a runtime is written to the cache it must boot in the real sealed-frame
machinery and run one known-good snippet, confirming real output comes back. A runtime
that fails this is never cached and the build fails with that error — never a silent
downgrade to a codeblock that shows text and does nothing (`src/main/runtimeFetch.ts`,
`fetchRuntime`).

**The cache is shared, not copied per Course.** The toolkit and a Course's library are
deliberately duplicated per Course, so one Course's copy is never disturbed by another's
(docs/adr/0014, docs/adr/0019). A runtime is not: it is tens of megabytes of third-party
code with no subject-matter opinion in it, and copying it into every Course that uses
Python would multiply that cost for no benefit anyone would notice. One copy lives outside
any Course folder, keyed by `{ lang, version }`; a Course's manifest carries only a pointer
to it, in `runtimes` (`src/shared/format.ts`).

The cache has no live reference count. A counter can drift the moment a Course folder is
removed by something other than the app — dragged to the Trash directly, deleted with the
machine off, restored from a backup missing some Courses. `gcRuntimeCache`
(`src/shared/runtimeCache.ts`) instead derives the answer each time it runs: it reads which
Courses exist under `coursesRoot()` right now, unions their `runtimes` pointers, and
removes whatever cache entry nothing points to. It is called after every Course deletion
(`src/main/index.ts`, `courses:remove`), and is safe to call again on a schedule or at
startup, since it is idempotent either way.

## Considered options

**Duplicate the runtime into every Course that uses it**, matching the toolkit and library
model. Rejected: those are duplicated on purpose so one Course's copy is stable against
another's changes, but a runtime never changes per Course — there is nothing to protect by
copying it, only disk to spend.

**A live reference count, incremented on fetch and decremented on delete.** Rejected: it
can only be correct if every path that removes a Course folder also decrements it, and a
folder removed from outside the app (Finder, a shell, a restored backup) cannot be made to
call back into Whetstone. A count that can silently drift from the truth is worse than no
count, because nothing would notice it was wrong.

**Let the Constructor fetch from anywhere it can find a working build.** Rejected
alongside the sandbox reasoning in docs/adr/0016: `'unsafe-eval'` costs nothing extra
because the frame already has nothing worth reaching, but that argument does not extend to
a binary nobody reads before it is trusted into every future Course that names the same
language. A short, hand-picked allowlist is the cost of that trust.

**Cache a runtime as soon as it downloads, skip the boot check.** Rejected: the cache is
shared, so a runtime that downloaded but does not actually work would not just break the
one Course that fetched it — every later Course asking for that language would reuse the
same broken copy until someone happened to notice.

## Consequences

Adding a language is one entry in `ALLOWED_RUNTIMES`, not a redesign. `python` (Pyodide) is
the first; nothing else is wired in yet.

A Course's disk footprint no longer includes the runtimes it uses; the cache does, once,
regardless of how many Courses point to it. A Course exported as a zip (courses:export)
does **not** carry its runtime the way it carries its toolkit and library — this is the
next thing to resolve: either the export inlines the pointed-to runtime from the cache, or
an imported Course re-fetches it against the allowlist on first open. Neither is decided
yet.

Actually inlining a fetched runtime into `frameSource()` — so a Mini-app's `lang: 'python'`
codeblock can run — is not built by this change. `fetchRuntime` writes the runtime's raw
bytes into the cache as `runtime.bin`; getting from that to a working
`window.__whetstoneRuntimes.python` inside a frame with `connect-src 'none'` is real work
still open, because Pyodide's ordinary loading path fetches its own sub-assets (the wasm
binary, the stdlib archive) over the network, which the frame does not have. That likely
means precomputing a single self-contained bundle (every asset inlined as a data URI, a
`loadPyodide({ indexURL: 'data:...' })` or equivalent) as part of what gets written to the
cache, not simply mirroring Pyodide's own distribution layout. Until that is solved,
`lang: 'python'` is reachable through `Kit.run`'s injected-runtime path (proven by
`tests/kit-run.test.ts`) but nothing yet supplies a real Pyodide runtime object to inject.
