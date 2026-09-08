import { mkdirSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { ensureCacheRoot, hasRuntime, runtimeDir } from '../shared/runtimeCache'
import type { RuntimeRef } from '../shared/runtimeCache'

/**
 * Fetching a codeblock language runtime at build time (docs/adr/0025).
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

export interface AllowedRuntime {
  version: string
  url: string
}

/**
 * The trusted source list. Adding a language is adding one entry here, never accepting a
 * URL the Constructor supplies. `python` is the first: Pyodide's own CDN, the WASM build of
 * CPython the Constructor is told about in `writing-a-mini-app/SKILL.md`.
 */
export const ALLOWED_RUNTIMES: Record<string, AllowedRuntime> = {
  python: {
    version: '0.26.1',
    url: 'https://cdn.jsdelivr.net/pyodide/v0.26.1/full/pyodide.js',
  },
}

export interface RuntimeIO {
  /** Fetches the runtime's bytes from its allowlisted URL. */
  fetch: (url: string) => Promise<Buffer>
  /**
   * Boots the fetched runtime in the real sealed-frame machinery and runs one known-good
   * snippet in it, returning whether real output came back correctly. Never left to a
   * default: the caller supplies the actual boot harness (see the Mini-app execution gate
   * this shares its boot machinery with).
   */
  boot: (bytes: Buffer, ref: RuntimeRef) => Promise<boolean>
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

  const bytes = await io.fetch(allowed.url)

  let booted: boolean
  try {
    booted = await io.boot(bytes, ref)
  } catch (cause) {
    throw new Error(`"${lang}" runtime failed to verify: ${(cause as Error).message}`, { cause })
  }
  if (!booted) {
    throw new Error(`"${lang}" runtime did not boot and run its known-good check`)
  }

  ensureCacheRoot(cacheRoot)
  const staging = await mkdtemp(join(tmpdir(), 'whetstone-runtime-'))
  writeFileSync(join(staging, 'runtime.bin'), bytes)
  const dest = runtimeDir(cacheRoot, ref)
  rmSync(dest, { recursive: true, force: true })
  mkdirSync(join(cacheRoot), { recursive: true })
  renameSync(staging, dest)

  return ref
}
