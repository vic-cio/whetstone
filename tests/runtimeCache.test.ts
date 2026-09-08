import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { gcRuntimeCache, hasRuntime, runtimeDir, runtimeKey } from '../src/shared/runtimeCache'

/**
 * The shared runtime cache is deduplicated across courses and reference-counted by
 * derivation (docs/adr/0025): nothing is decremented on delete, the next GC pass just
 * reads which courses still point at a runtime and removes what none of them do.
 */

let box = ''
let cacheRoot = ''
let coursesRoot = ''

beforeEach(() => {
  box = mkdtempSync(join(tmpdir(), 'whetstone-runtime-cache-'))
  cacheRoot = join(box, 'runtimes')
  coursesRoot = join(box, 'courses')
  mkdirSync(coursesRoot, { recursive: true })
})
afterEach(() => {
  rmSync(box, { recursive: true, force: true })
})

function putRuntime(lang: string, version: string): void {
  const dir = runtimeDir(cacheRoot, { lang, version })
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'runtime.js'), '// stub')
}

function putCourse(slug: string, runtimes: { lang: string; version: string }[]): void {
  const dir = join(coursesRoot, slug)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'course.json'), JSON.stringify({ formatVersion: 1, runtimes }))
}

describe('runtimeKey / runtimeDir', () => {
  it('keys a runtime by lang and version', () => {
    expect(runtimeKey({ lang: 'python', version: '0.26.1' })).toBe('python@0.26.1')
    expect(runtimeDir('/cache', { lang: 'python', version: '0.26.1' })).toBe('/cache/python@0.26.1')
  })
})

describe('gcRuntimeCache', () => {
  it('removes a runtime no course points to', () => {
    putRuntime('python', '0.26.1')
    const removed = gcRuntimeCache(cacheRoot, coursesRoot)
    expect(removed).toEqual(['python@0.26.1'])
    expect(hasRuntime(cacheRoot, { lang: 'python', version: '0.26.1' })).toBe(false)
  })

  it('keeps a runtime a course still points to', () => {
    putRuntime('python', '0.26.1')
    putCourse('a-course', [{ lang: 'python', version: '0.26.1' }])
    const removed = gcRuntimeCache(cacheRoot, coursesRoot)
    expect(removed).toEqual([])
    expect(hasRuntime(cacheRoot, { lang: 'python', version: '0.26.1' })).toBe(true)
  })

  it('removes a runtime once the last course pointing to it is gone', () => {
    putRuntime('python', '0.26.1')
    putCourse('a-course', [{ lang: 'python', version: '0.26.1' }])
    rmSync(join(coursesRoot, 'a-course'), { recursive: true, force: true })

    const removed = gcRuntimeCache(cacheRoot, coursesRoot)
    expect(removed).toEqual(['python@0.26.1'])
  })

  it('keeps a runtime shared by two courses until both are gone', () => {
    putRuntime('python', '0.26.1')
    putCourse('a-course', [{ lang: 'python', version: '0.26.1' }])
    putCourse('b-course', [{ lang: 'python', version: '0.26.1' }])
    rmSync(join(coursesRoot, 'a-course'), { recursive: true, force: true })

    expect(gcRuntimeCache(cacheRoot, coursesRoot)).toEqual([])
    rmSync(join(coursesRoot, 'b-course'), { recursive: true, force: true })
    expect(gcRuntimeCache(cacheRoot, coursesRoot)).toEqual(['python@0.26.1'])
  })

  it('does not crash on a course with a malformed or missing runtimes field', () => {
    const dir = join(coursesRoot, 'odd-course')
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'course.json'), 'not json')
    putRuntime('python', '0.26.1')
    let removed: string[] = []
    expect(() => {
      removed = gcRuntimeCache(cacheRoot, coursesRoot)
    }).not.toThrow()
    expect(removed).toEqual(['python@0.26.1'])
  })

  it('returns nothing removed when the cache does not exist yet', () => {
    expect(existsSync(cacheRoot)).toBe(false)
    expect(gcRuntimeCache(cacheRoot, coursesRoot)).toEqual([])
  })
})
