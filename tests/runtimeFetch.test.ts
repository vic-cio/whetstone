import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { ALLOWED_RUNTIMES, fetchRuntime } from '../src/main/runtimeFetch'
import { hasRuntime, runtimeDir } from '../src/shared/runtimeCache'

/**
 * Build-time fetching of a codeblock language runtime (docs/adr/0025). The Constructor may
 * only ask for a language on `ALLOWED_RUNTIMES`; whatever it fetches must boot and run a
 * known-good snippet before it is trusted into the shared cache, so `fetch`/`boot` are
 * always injected here rather than reaching the network or a real sealed frame.
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
    expect(ALLOWED_RUNTIMES['python']?.url).toMatch(/^https:\/\//)
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

  it('fetches, verifies, and writes the runtime into the shared cache', async () => {
    const ref = await fetchRuntime('python', cacheRoot, {
      fetch: async (url) => {
        expect(url).toBe(ALLOWED_RUNTIMES['python']?.url)
        return Buffer.from('pretend runtime bytes')
      },
      boot: async () => true,
    })
    expect(ref).toEqual({ lang: 'python', version: ALLOWED_RUNTIMES['python']?.version })
    expect(hasRuntime(cacheRoot, ref)).toBe(true)
    expect(readFileSync(join(runtimeDir(cacheRoot, ref), 'runtime.bin'))).toEqual(
      Buffer.from('pretend runtime bytes'),
    )
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
    expect(fetches).toBe(1)
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
