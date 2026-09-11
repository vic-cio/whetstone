/**
 * Wiring a fetched codeblock language runtime into the sealed frame (docs/adr/0026).
 *
 * Loading Pyodide inside `sandbox="allow-scripts"` (an opaque-origin frame, `connect-src
 * 'none'`) needs two things a plain `window.fetch` override does not give for free, both
 * confirmed against a real sandboxed `BrowserWindow` frame while building this:
 *
 *  - `sessionStorage`/`localStorage` throw (`SecurityError`) the moment anything reads
 *    them in an opaque-origin document, and Pyodide's own loader reads `sessionStorage` at
 *    module load time to detect its environment. Left alone, that throw happens before
 *    `loadPyodide` is even defined. Stubbing both with a plain object before the loader
 *    runs is enough — the frame has no origin-scoped storage to keep anyway.
 *  - The loader's own dependency (`pyodide.asm.js`, the Emscripten glue) is loaded with a
 *    dynamic `import()`, not `fetch()` — module fetches are a separate browser subsystem a
 *    `window.fetch` override cannot see, and a `connect-src 'none'` frame cannot resolve one
 *    regardless. The loader skips that import entirely once `_createPyodideModule` already
 *    exists as a global, so `pyodide.asm.js`'s source is inlined as a plain `<script>` ahead
 *    of the loader, exactly like `pyodide.asm.wasm`, `python_stdlib.zip`, and
 *    `pyodide-lock.json` are served from memory through the `fetch` override — those three
 *    *do* go through real `fetch()` calls in Pyodide's own code, so the override covers them.
 *
 * `window.fetch` matches an asset by filename regardless of the URL Pyodide resolved it
 * against, so `loadPyodide`'s own `indexURL` never has to point anywhere real.
 */

export interface InlinedRuntime {
  lang: string
  assets: { name: string; bytes: Buffer }[]
}

function toBase64(bytes: Buffer): string {
  return bytes.toString('base64')
}

function contentTypeFor(name: string): string {
  if (name.endsWith('.wasm')) return 'application/wasm'
  if (name.endsWith('.json')) return 'application/json'
  return 'application/octet-stream'
}

/** The fetch-override IIFE, plus the storage stub every runtime needs regardless of language. */
function fetchOverrideScript(served: { name: string; bytes: Buffer }[]): string {
  const entries = served.map((asset) => `'${asset.name}': '${toBase64(asset.bytes)}'`).join(',\n    ')
  return `(function () {
  try { Object.defineProperty(window, 'sessionStorage', { value: {}, configurable: true }) } catch (e) {}
  try { Object.defineProperty(window, 'localStorage', { value: {}, configurable: true }) } catch (e) {}

  var assets = {
    ${entries}
  }
  function contentTypeFor(name) {
    if (name.slice(-5) === '.wasm') return 'application/wasm'
    if (name.slice(-5) === '.json') return 'application/json'
    return 'application/octet-stream'
  }
  function assetBytes(b64) {
    var bin = atob(b64)
    var out = new Uint8Array(bin.length)
    for (var i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i)
    return out
  }
  window.fetch = function (input) {
    var url = typeof input === 'string' ? input : (input && input.url) || String(input)
    for (var name in assets) {
      if (url.indexOf(name) !== -1) {
        return Promise.resolve(new Response(assetBytes(assets[name]), { status: 200, headers: { 'content-type': contentTypeFor(name) } }))
      }
    }
    return Promise.reject(new Error('no inlined runtime asset for ' + url))
  }
})();`
}

/** `window.__whetstoneRuntimes.python`, wired up once `loadPyodide` has finished. */
const PYTHON_READY_SCRIPT = `(async function () {
  try {
    var pyodide = await loadPyodide({ indexURL: './' })
    window.__whetstoneRuntimes.python = function (source, names, print) {
      pyodide.setStdout({ batched: print })
      pyodide.setStderr({ batched: print })
      var globals = pyodide.globals.get('dict')()
      try {
        pyodide.runPython(source, { globals: globals })
        var api = {}
        for (var i = 0; i < names.length; i += 1) {
          if (globals.has(names[i])) api[names[i]] = globals.get(names[i])
        }
        return api
      } finally {
        globals.destroy()
      }
    }
  } catch (e) {
    window.__whetstoneRuntimeErrors = window.__whetstoneRuntimeErrors || []
    window.__whetstoneRuntimeErrors.push('python: ' + String((e && e.stack) || e))
  }
})()`

/**
 * The `<script>` tags to splice ahead of the toolkit in `assembleFrame`, for a Course whose
 * manifest names at least one runtime. Empty for a Course with none, so nothing about an
 * unaffected Course's frame changes.
 *
 * Only `python` has wiring today; a second language adds another `if` here alongside its own
 * entry in `ALLOWED_RUNTIMES` (`src/main/runtimeFetch.ts`) — the loader-specific quirks a
 * runtime needs are not something a generic shape could have hidden anyway.
 */
export function runtimeBootstrapScript(runtimes: InlinedRuntime[]): string {
  if (runtimes.length === 0) return ''

  const scripts: string[] = []
  const readyPromises: string[] = []

  for (const runtime of runtimes) {
    if (runtime.lang !== 'python') continue
    const byName = new Map(runtime.assets.map((asset) => [asset.name, asset.bytes]))
    const loaderJs = byName.get('pyodide.js')
    const asmJs = byName.get('pyodide.asm.js')
    if (!loaderJs || !asmJs) continue
    const served = runtime.assets.filter((asset) => asset.name !== 'pyodide.js' && asset.name !== 'pyodide.asm.js')

    scripts.push(`<script>${fetchOverrideScript(served)}</script>`)
    scripts.push(`<script>${asmJs.toString('utf8')}</script>`)
    scripts.push(`<script>${loaderJs.toString('utf8')}</script>`)
    scripts.push(`<script>window.__whetstoneRuntimes = window.__whetstoneRuntimes || {};</script>`)
    scripts.push(`<script>var __whetstonePythonReady = ${PYTHON_READY_SCRIPT};</script>`)
    readyPromises.push('__whetstonePythonReady')
  }

  if (readyPromises.length === 0) return ''
  scripts.push(`<script>window.__whetstoneRuntimesReady = Promise.all([${readyPromises.join(', ')}]);</script>`)
  return scripts.join('\n')
}
