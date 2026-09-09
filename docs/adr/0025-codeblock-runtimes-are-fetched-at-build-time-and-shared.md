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

Actually inlining a fetched runtime into `frameSource()` — so a Mini-app's or a Lesson
codeblock's `lang: 'python'` can run — is not built by this change, and is now more
precisely scoped than when this ADR was first written (verified against the real assets,
not assumed):

`ALLOWED_RUNTIMES.python.url` names only `pyodide.js`, the ~16KB loader/orchestrator.
`fetchRuntime` currently caches just that file as `runtime.bin` — nowhere near enough to
run Python. The loader's own two dependencies, fetched separately at its runtime by URLs
relative to `indexURL`, are `pyodide.asm.wasm` (~10MB, the compiled CPython interpreter)
and `python_stdlib.zip` (~2.3MB, the standard library). Both must be fetched at build time
and cached alongside the loader before anything can work; `ALLOWED_RUNTIMES` and
`fetchRuntime` need to grow from one URL to the small, fixed set of assets one Pyodide
release actually needs.

The frame having `connect-src 'none'` is the real obstacle, and it rules out the two
approaches that assume some server exists to answer a request: neither an `indexURL`
pointing at an embedded static server nor a Service Worker intercepting `fetch` is
possible here — a Service Worker cannot even register inside a `sandbox="allow-scripts"`
frame, because that sandbox token alone gives the frame an opaque origin, and Service
Worker registration requires a real (non-opaque) origin.

The approach that survives that constraint: **override `window.fetch` inside the frame,
before `loadPyodide()` runs, with a pure in-memory responder** for the fixed set of asset
paths Pyodide's loader asks for (`pyodide.asm.wasm`, `python_stdlib.zip`, and whatever
`pyodide-lock.json` — the package index — resolves to, if `Kit.run`'s python engine ever
supports `micropip`-installed packages beyond the stdlib; the stdlib alone does not need
it). Each asset's bytes would already be inlined into the served document as base64,
exactly like the toolkit and course library already are; the override decodes them and
returns a synthetic `Response` without the real network-layer `fetch` algorithm ever
running, so `connect-src 'none'` never has anything to block — no capability is added to
the frame beyond what inlining the toolkit already grants it. This needs no private
Emscripten `Module` hook names and does not depend on Pyodide's internal loading
implementation staying stable across versions, which a `Module.instantiateWasm`/
`Module.locateFile` override (the other viable approach) would.

This is judged feasible, not merely hoped for, but embedding and correctly proving ~12.5MB
of interpreter and stdlib bytes — and getting Python's own import system working against
a zip mounted this way — is real engineering that deserves a dedicated pass with its own
verification budget, not a rushed addition here. Until it lands, `lang: 'python'` is
reachable through `Kit.run`'s injected-runtime path (proven by `tests/kit-run.test.ts`) but
nothing yet supplies a real Pyodide runtime object to inject, and `writing-a-mini-app/SKILL.md`
tells the Constructor not to use it yet for exactly that reason.
