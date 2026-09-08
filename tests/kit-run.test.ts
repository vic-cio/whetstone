import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * `Kit.run` is the language-execution core `Kit.editor` and `Kit.codeblock` both call.
 * It needs no DOM, so it is loaded and driven directly here rather than through a sealed
 * frame — the sandbox boundary itself stays proven by tests/sandbox.test.ts, which a
 * unit test cannot stand in for.
 */

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..')

function loadKit(): any {
  const source = readFileSync(join(ROOT, 'toolkit', 'kit.js'), 'utf8')
  const window: any = { parent: {} }
  new Function('window', source)(window)
  return window.Kit
}

describe('Kit.run', () => {
  it('runs JavaScript and returns the named exports', () => {
    const Kit = loadKit()
    const result = Kit.run('js', 'function double(x) { return x * 2 }', { exports: ['double'] })
    expect(result.ok).toBe(true)
    expect(result.api.double(3)).toBe(6)
    expect(result.error).toBeNull()
  })

  it('defaults to js when no lang is given', () => {
    const Kit = loadKit()
    const result = Kit.run(undefined, 'var x = 1', {})
    expect(result.ok).toBe(true)
  })

  it('captures console.log calls as real output rather than discarding them', () => {
    const Kit = loadKit()
    const result = Kit.run('js', "console.log('a'); console.log('b', 2)", {})
    expect(result.ok).toBe(true)
    expect(result.log).toEqual(['a', 'b 2'])
  })

  it('reports a thrown error by message, and never throws itself', () => {
    const Kit = loadKit()
    const result = Kit.run('js', 'throw new Error("boom")', {})
    expect(result.ok).toBe(false)
    expect(result.error).toBe('boom')
  })

  it('reports a syntax error the same way as a thrown one', () => {
    const Kit = loadKit()
    const result = Kit.run('js', 'function (', {})
    expect(result.ok).toBe(false)
    expect(typeof result.error).toBe('string')
    expect(result.error.length).toBeGreaterThan(0)
  })

  it('refuses a language with no runtime, and names it', () => {
    const Kit = loadKit()
    const result = Kit.run('python', 'print(1)', {})
    expect(result.ok).toBe(false)
    expect(result.error).toContain('python')
  })

  it('uses an injected runtime for a non-js language', () => {
    const Kit = loadKit()
    const runtimes = {
      python: (source: string, names: string[], print: (...args: unknown[]) => void) => {
        print('ran:', source)
        return { names }
      },
    }
    const result = Kit.run('python', 'print(1)', { exports: ['x'], runtimes })
    expect(result.ok).toBe(true)
    expect(result.api).toEqual({ names: ['x'] })
    expect(result.log).toEqual(['ran: print(1)'])
  })

  it('an injected runtime throwing is reported like a js error, not thrown', () => {
    const Kit = loadKit()
    const runtimes = {
      python: () => {
        throw new Error('indent error')
      },
    }
    const result = Kit.run('python', 'bad', { runtimes })
    expect(result.ok).toBe(false)
    expect(result.error).toBe('indent error')
  })
})
