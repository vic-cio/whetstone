import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { ALLOWED_RUNTIMES, fetchRuntime } from '../src/main/runtimeFetch'
import { hasRuntime, runtimeDir } from '../src/shared/runtimeCache'

/**
 * Build-time fetching of a codeblock language runtime (docs/adr/0026). The Constructor may
 * only ask for a language on `ALLOWED_RUNTIMES`; every asset it names must be fetched, and
 * all of them must boot and run a known-good snippet together before anything is trusted
 * into the shared cache, so `fetch`/`boot` are always injected here rather than reaching the
 * network or a real sealed frame.
 */

let box = ''
let cacheRoot = ''

beforeEach(() => {
  box = mkdtempSync(join(tmpdir(), 'whetstone-runtime-fetch-'))
  cacheRoot = join(box, 'runtimes')
})
afterEach(() => {
  rmSync(box, { recursive: true, force: true })
})

describe('ALLOWED_RUNTIMES', () => {
  it('names python as the only non-js entry today', () => {
    expect(Object.keys(ALLOWED_RUNTIMES)).toEqual(['python'])
    expect(ALLOWED_RUNTIMES['python']?.version).toBeTruthy()
    const assets = ALLOWED_RUNTIMES['python']?.assets ?? []
    expect(assets.length).toBeGreaterThan(0)
    for (const asset of assets) {
      expect(asset.name).toBeTruthy()
      expect(asset.url).toMatch(/^https:\/\//)
    }
    expect(assets.map((asset) => asset.name)).toEqual(
      expect.arrayContaining(['pyodide.js', 'pyodide.asm.js', 'pyodide.asm.wasm', 'python_stdlib.zip']),
    )
  })
})

describe('fetchRuntime', () => {
  it('refuses a language not on the allowlist, naming it', async () => {
    await expect(
      fetchRuntime('ruby', cacheRoot, {
        fetch: async () => Buffer.from(''),
        boot: async () => true,
      }),
    ).rejects.toThrow(/ruby.*allowlist|allowlist.*ruby/i)
  })

  it('fetches every asset, verifies them together, and writes them into the shared cache', async () => {
    const requested: string[] = []
    const ref = await fetchRuntime('python', cacheRoot, {
      fetch: async (url) => {
        requested.push(url)
        return Buffer.from(`pretend bytes for ${url}`)
      },
      boot: async (assets) => {
        expect(assets.length).toBe(ALLOWED_RUNTIMES['python']?.assets.length)
        return true
      },
    })
    expect(ref).toEqual({ lang: 'python', version: ALLOWED_RUNTIMES['python']?.version })
    expect(requested.sort()).toEqual(ALLOWED_RUNTIMES['python']?.assets.map((asset) => asset.url).sort())
    expect(hasRuntime(cacheRoot, ref)).toBe(true)
    for (const asset of ALLOWED_RUNTIMES['python']?.assets ?? []) {
      expect(readFileSync(join(runtimeDir(cacheRoot, ref), asset.name))).toEqual(
        Buffer.from(`pretend bytes for ${asset.url}`),
      )
    }
  })

  it('is idempotent: a second call reuses the cached copy without fetching again', async () => {
    let fetches = 0
    const io = {
      fetch: async () => {
        fetches += 1
        return Buffer.from('bytes')
      },
      boot: async () => true,
    }
    await fetchRuntime('python', cacheRoot, io)
    await fetchRuntime('python', cacheRoot, io)
    expect(fetches).toBe(ALLOWED_RUNTIMES['python']?.assets.length)
  })

  it('does not cache a runtime that fails to boot', async () => {
    await expect(
      fetchRuntime('python', cacheRoot, {
        fetch: async () => Buffer.from('bytes'),
        boot: async () => false,
      }),
    ).rejects.toThrow(/did not boot|failed to boot|verify/i)
    expect(existsSync(runtimeDir(cacheRoot, { lang: 'python', version: ALLOWED_RUNTIMES['python']!.version }))).toBe(
      false,
    )
  })

  it('does not cache a runtime whose boot check throws', async () => {
    await expect(
      fetchRuntime('python', cacheRoot, {
        fetch: async () => Buffer.from('bytes'),
        boot: async () => {
          throw new Error('sandbox crashed')
        },
      }),
    ).rejects.toThrow('sandbox crashed')
    expect(existsSync(runtimeDir(cacheRoot, { lang: 'python', version: ALLOWED_RUNTIMES['python']!.version }))).toBe(
      false,
    )
  })
})
