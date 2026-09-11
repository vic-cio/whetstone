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
codeblock's `lang: 'python'` can run — landed in a dedicated pass after this ADR was first
written, once the asset list and the sandboxed-frame obstacles below were verified against
the real thing rather than assumed.

`ALLOWED_RUNTIMES.python` names five assets, not one: `pyodide.js` (~16KB, the loader),
`pyodide.asm.js` (~1.2MB, Emscripten's own glue — missing from this ADR's first count),
`pyodide.asm.wasm` (~10MB, the compiled interpreter), `python_stdlib.zip` (~2.3MB), and
`pyodide-lock.json` (~105KB, the package index the loader consults even when nothing beyond
the stdlib is installed). `fetchRuntime` fetches and caches all five together.

The frame having `connect-src 'none'` rules out the two approaches that assume some server
exists to answer a request: neither an `indexURL` pointing at an embedded static server nor
a Service Worker intercepting `fetch` is possible here — a Service Worker cannot even
register inside a `sandbox="allow-scripts"` frame, because that sandbox token alone gives
the frame an opaque origin, and Service Worker registration requires a real (non-opaque)
origin.

What ships instead, confirmed against a real sandboxed `BrowserWindow` frame while building
this (`src/shared/runtimeBootstrap.ts`):

- **`window.fetch` is overridden inside the frame**, before `loadPyodide()` runs, with a
  pure in-memory responder for `pyodide.asm.wasm`, `python_stdlib.zip`, and
  `pyodide-lock.json` — the three assets Pyodide's own code actually requests through
  `fetch()`. Each asset's bytes are inlined into the served document as base64, exactly like
  the toolkit and course library already are; the override decodes them and returns a
  synthetic `Response` (with `content-type: application/wasm` for the wasm file —
  `WebAssembly.instantiateStreaming` refuses anything else) without the real network-layer
  `fetch` algorithm ever running, so `connect-src 'none'` never has anything to block.
- **`pyodide.asm.js` is not fetched at all.** Pyodide's loader gets it a different way —
  a dynamic `import()`, not `fetch()` — which a `window.fetch` override cannot see (module
  fetches are a separate browser subsystem) and which `connect-src 'none'` would refuse
  regardless. The loader skips that import entirely once `globalThis._createPyodideModule`
  already exists, so `pyodide.asm.js`'s source is inlined as a plain `<script>` ahead of the
  loader, defining that global before `loadPyodide` ever runs — the same inlining pattern as
  the toolkit, just triggered by a different mechanism than the fetch override.
- **`sessionStorage`/`localStorage` are stubbed with a plain object before the loader runs.**
  An opaque-origin sandboxed document throws `SecurityError` the instant anything reads
  either — not just on access, `typeof sessionStorage` throws too, since the getter itself
  throws before `typeof` ever sees a value — and Pyodide's loader reads `sessionStorage` at
  module load time to detect its environment. Left alone, that throw happens before
  `loadPyodide` is even defined. The frame has no origin-scoped storage to keep anyway, so a
  plain stand-in costs nothing.

None of this needs private Emscripten `Module` hook names, so it does not depend on
Pyodide's internal loading implementation staying stable across versions the way a
`Module.instantiateWasm`/`Module.locateFile` override (the other viable approach) would.

Two more things this pass found, unrelated to Pyodide specifically:

- **`BrowserWindow.loadURL` hard-fails (`ERR_INVALID_URL`) once a `data:` URL reaches the
  multi-megabyte range.** The build-time execution gate (`executionGate.ts`) used `data:`
  URLs for both its outer harness page and the Mini-app iframe, which broke the instant a
  Mini-app inlined a ~12.5MB runtime. The boot harness (`sandboxHarness.ts`, shared with the
  runtime boot-verify below) writes both pages to temp files and loads them with
  `loadFile` instead — `srcdoc` was never an option either, since it inherits the host
  page's CSP.
- **`Kit.run`'s engine contract is synchronous**, but loading Pyodide cannot be forced
  synchronous even with everything already inlined (WASM instantiation and the loader's own
  internal awaits still cross real event-loop turns). `Kit.bridge.ready()` now waits on a
  frame-global `window.__whetstoneRuntimesReady` promise before firing, when the frame set
  one — so by the time anything in the frame can be clicked, any runtime it needs has
  already finished loading. Neither a hand-written Mini-app nor a generated Lesson codeblock
  has to know this happens.

The known-good check `fetchRuntime`'s `boot` runs before caching anything is
`import json; json.dumps({"ok": True})` — chosen specifically to exercise the stdlib zip's
own import machinery, not just prove the interpreter boots, per this ADR's original bar.

Export/import still does not carry a Course's runtime pointer to bytes: `courses:export`
zips a Course folder that never contained them (that is the point of the shared cache).
There is no dedicated import feature in this app — a Course reaches the library by a build
finishing, or by its folder being placed under the library root some other way (a restored
backup, a folder copied in by hand) — so the fix lives at the one place every Course is read
before use: `openCourse()` (`src/main/courseStore.ts`) now re-fetches and re-verifies any
`runtimes` pointer against the allowlist on open, best-effort, the same way a fresh build
does. A Course whose runtime is already cached pays nothing extra (`fetchRuntime` is
idempotent); a Course dropped in from elsewhere gets it fetched the first time someone opens
it.
