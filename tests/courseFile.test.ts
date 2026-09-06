import { describe, expect, it, beforeAll } from 'vitest'
import { mkdirSync, mkdtempSync, realpathSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import { fileInCourse } from '../src/shared/courseFile'

/**
 * A Course folder is content an agent wrote, so every path in it is untrusted input.
 * These are the shapes that get past a check written with `relative` alone.
 */
let root: string
let outside: string

beforeAll(() => {
  // The temp folder is itself behind a symlink on macOS, so start from the real one.
  const box = realpathSync(mkdtempSync(join(tmpdir(), 'whetstone-')))
  root = join(box, 'courses', 'a-course')
  mkdirSync(join(root, 'diagrams'), { recursive: true })
  writeFileSync(join(root, 'diagrams', 'one.svg'), '<svg></svg>')

  outside = join(box, 'secrets.txt')
  writeFileSync(outside, 'not for a course')

  // A symlink inside the Course, pointing at a file the Course has no business reading.
  symlinkSync(outside, join(root, 'escape.txt'))
  symlinkSync(join(box, 'courses'), join(root, 'siblings'))
})

describe('serving a file a course points at', () => {
  it('serves a file that is really inside the course', () => {
    expect(fileInCourse(root, '/diagrams/one.svg')).toBe(resolve(root, 'diagrams', 'one.svg'))
  })

  it('refuses a path that climbs out', () => {
    expect(fileInCourse(root, '../secrets.txt')).toBeUndefined()
    expect(fileInCourse(root, '/../../secrets.txt')).toBeUndefined()
  })

  it('refuses a file that is not there', () => {
    expect(fileInCourse(root, 'diagrams/missing.svg')).toBeUndefined()
  })

  it('refuses the course folder itself', () => {
    expect(fileInCourse(root, '/')).toBeUndefined()
  })

  /**
   * The one this check exists for. `resolve` and `relative` are string arithmetic and
   * never touch the disk, so a symlink inside the Course passes a check written that way
   * and is then followed. Only the real path on disk settles it.
   */
  it('refuses a symlink that leads out of the course', () => {
    expect(fileInCourse(root, 'escape.txt')).toBeUndefined()
  })

  it('allows a symlink that leads back inside, because the real path says so', () => {
    // The check is about where a path ends, not about whether a link was followed.
    expect(fileInCourse(root, 'siblings/a-course/diagrams/one.svg')).toBe(
      resolve(root, 'diagrams', 'one.svg'),
    )
  })
})
