import { mkdirSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { ensureCacheRoot, hasRuntime, runtimeDir } from '../shared/runtimeCache'
import type { RuntimeRef } from '../shared/runtimeCache'
import { POLICY } from '../shared/miniapp'
import { runtimeBootstrapScript } from '../shared/runtimeBootstrap'
import { boot, pollUntil } from './sandboxHarness'

/**
 * Fetching a codeblock language runtime at build time (docs/adr/0026).
 *
 * The Constructor has real network access only during the build; the sealed frame never
 * does (`connect-src 'none'`, permanently). So a language beyond `js` is fetched here, once,
 * and the result is what every Course's sealed frame gets inlined at serve time — the frame
 * itself still never reaches the network.
 *
 * Two things stand between "the Constructor asked for a language" and "it is trusted into
 * the shared cache":
 *
 *  - It must be on `ALLOWED_RUNTIMES`. The Constructor cannot point this at an arbitrary
 *    URL; a fetched runtime is an opaque binary nobody reads before it ships to every
 *    Course that uses that language, so only a short, hand-picked list is trusted.
 *  - It must boot and run a known-good snippet inside the real sealed-frame machinery
 *    before it is written to the cache. A runtime that merely downloaded is not proven to
 *    work, and the cache is shared, so a broken one would poison every future Course that
 *    reuses it rather than just the one that fetched it.
 */

export interface RuntimeAsset {
  /** The filename the runtime's own loader asks for, e.g. `pyodide.asm.wasm`. */
  name: string
  url: string
}

export interface AllowedRuntime {
  version: string
  /**
   * Every file this runtime needs, fetched together. A loader is rarely one file: Pyodide's
   * `pyodide.js` is a ~16KB orchestrator, but it needs its own Emscripten glue
   * (`pyodide.asm.js`), the compiled interpreter (`pyodide.asm.wasm`, ~10MB), the standard
   * library (`python_stdlib.zip`, ~2.3MB), and the package index it consults even when
   * nothing beyond the stdlib is installed (`pyodide-lock.json`) — verified against the
   * live v0.26.1 CDN, not assumed from the loader's own name.
   */
  assets: RuntimeAsset[]
}

/**
 * The trusted source list. Adding a language is adding one entry here, never accepting a
 * URL the Constructor supplies. `python` is the first: Pyodide's own CDN, the WASM build of
 * CPython the Constructor is told about in `writing-a-mini-app/SKILL.md`.
 */
const PYODIDE_VERSION = '0.26.1'
const PYODIDE_BASE = `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`

export const ALLOWED_RUNTIMES: Record<string, AllowedRuntime> = {
  python: {
    version: PYODIDE_VERSION,
    assets: ['pyodide.js', 'pyodide.asm.js', 'pyodide.asm.wasm', 'python_stdlib.zip', 'pyodide-lock.json'].map(
      (name) => ({ name, url: PYODIDE_BASE + name }),
    ),
  },
}

export interface RuntimeAssetBytes {
  name: string
  bytes: Buffer
}

export interface RuntimeIO {
  /** Fetches one asset's bytes from its allowlisted URL. */
  fetch: (url: string) => Promise<Buffer>
  /**
   * Boots every fetched asset together in the real sealed-frame machinery and runs one
   * known-good snippet, returning whether real output came back correctly. Never left to a
   * default: the caller supplies the actual boot harness (see the Mini-app execution gate
   * this shares its boot machinery with).
   */
  boot: (assets: RuntimeAssetBytes[], ref: RuntimeRef) => Promise<boolean>
}

/**
 * Fetch, verify, and cache one language runtime. Idempotent: a runtime already in the
 * cache is returned without fetching again. Throws a named error rather than caching
 * anything on an allowlist miss, a failed boot, or a boot that throws.
 */
export async function fetchRuntime(lang: string, cacheRoot: string, io: RuntimeIO): Promise<RuntimeRef> {
  const allowed = ALLOWED_RUNTIMES[lang]
  if (!allowed) {
    const known = Object.keys(ALLOWED_RUNTIMES).join(', ') || 'none'
    throw new Error(`"${lang}" is not on the trusted runtime allowlist (known: ${known})`)
  }
  const ref: RuntimeRef = { lang, version: allowed.version }
  if (hasRuntime(cacheRoot, ref)) return ref

  const assets: RuntimeAssetBytes[] = await Promise.all(
    allowed.assets.map(async (asset) => ({ name: asset.name, bytes: await io.fetch(asset.url) })),
  )

  let booted: boolean
  try {
    booted = await io.boot(assets, ref)
  } catch (cause) {
    throw new Error(`"${lang}" runtime failed to verify: ${(cause as Error).message}`, { cause })
  }
  if (!booted) {
    throw new Error(`"${lang}" runtime did not boot and run its known-good check`)
  }

  ensureCacheRoot(cacheRoot)
  const staging = await mkdtemp(join(tmpdir(), 'whetstone-runtime-'))
  for (const asset of assets) writeFileSync(join(staging, asset.name), asset.bytes)
  const dest = runtimeDir(cacheRoot, ref)
  rmSync(dest, { recursive: true, force: true })
  mkdirSync(join(cacheRoot), { recursive: true })
  renameSync(staging, dest)

  return ref
}

/**
 * One snippet per allowlisted language that only succeeds if the standard library's own
 * import machinery works — booting the interpreter alone would not catch a runtime whose
 * wasm loads but whose stdlib zip is mounted wrong (docs/adr/0026's stated bar).
 */
const KNOWN_GOOD: Record<string, { source: string; exportName: string; expected: string }> = {
  python: { source: 'import json\nresult = json.dumps({"ok": True})', exportName: 'result', expected: '{"ok": true}' },
}

const BOOT_TIMEOUT_MS = 30_000

/** The probe page: the same bootstrap a real frame gets, then one call into the engine it wires up. */
function bootProbe(lang: string, assets: RuntimeAssetBytes[]): string {
  const knownGood = KNOWN_GOOD[lang]
  const runtimeScript = runtimeBootstrapScript([{ lang, assets }])
  const runner = `(async function () {
    try {
      await window.__whetstoneRuntimesReady
      var engine = window.__whetstoneRuntimes && window.__whetstoneRuntimes['${lang}']
      if (typeof engine !== 'function') {
        window.parent.postMessage({ type: 'boot-fail', message: 'no "${lang}" engine was installed' }, '*')
        return
      }
      var api = engine(${JSON.stringify(knownGood?.source ?? '')}, ${JSON.stringify([knownGood?.exportName ?? ''])}, function () {})
      var value = api && api['${knownGood?.exportName ?? ''}']
      var ok = value === ${JSON.stringify(knownGood?.expected ?? '')}
      window.parent.postMessage({ type: ok ? 'boot-ok' : 'boot-fail', message: String(value) }, '*')
    } catch (e) {
      window.parent.postMessage({ type: 'boot-fail', message: String((e && e.stack) || e) }, '*')
    }
  })();`
  return [
    '<!doctype html><html><head>',
    `<meta http-equiv="Content-Security-Policy" content="${POLICY}">`,
    '</head><body>',
    runtimeScript,
    `<script>${runner}</script>`,
    '</body></html>',
  ].join('\n')
}

/**
 * The real `RuntimeIO`: `fetch` hits the network, `boot` drives the actual sandboxed-frame
 * machinery a served Course frame uses (`sandboxHarness.ts`), proving the runtime works
 * under the exact CSP it will run under later, not a looser stand-in.
 */
export function realRuntimeIO(): RuntimeIO {
  return {
    fetch: async (url) => {
      const response = await fetch(url)
      if (!response.ok) throw new Error(`fetching "${url}" failed: ${response.status} ${response.statusText}`)
      return Buffer.from(await response.arrayBuffer())
    },
    boot: async (assets, ref) => {
      if (!KNOWN_GOOD[ref.lang]) return false
      const booted = await boot(bootProbe(ref.lang, assets))
      if (!booted) return false
      try {
        await pollUntil(
          booted.win,
          'window.__gate.events.some(function (m) { return m && (m.type === "boot-ok" || m.type === "boot-fail") })',
          BOOT_TIMEOUT_MS,
        )
        const events = (await booted.win.webContents.executeJavaScript('window.__gate.events')) as {
          type: string
          message?: string
        }[]
        return events.some((event) => event.type === 'boot-ok')
      } finally {
        booted.win.destroy()
        booted.cleanup()
      }
    },
  }
}
