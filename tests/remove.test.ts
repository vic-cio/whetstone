import { cpSync, existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { openProgress } from '../src/main/progress'
import { removeCourse } from '../src/shared/remove'
import type { Progress } from '../src/main/progress'

/**
 * Test 5: Delete Course leaves no row and no folder. A delete whose folder will not move
 * leaves the rows gone and reports the path.
 *
 * The Trash is passed in rather than imported, because what is under test is the order the
 * two halves happen in and what is true when the second half fails.
 */

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..')
const SAMPLE = join(ROOT, 'fixtures', 'courses', 'gradients-by-hand')

let box = ''
let db: Progress

beforeAll(() => {
  box = mkdtempSync(join(tmpdir(), 'whetstone-remove-'))
  db = openProgress(':memory:')
})
afterAll(() => {
  db.close()
  rmSync(box, { recursive: true, force: true })
})

/** A library holding one Course the user has read some of. */
function scene(slug: string): string {
  const root = mkdtempSync(join(box, 'courses-'))
  cpSync(SAMPLE, join(root, slug), { recursive: true })
  db.setTickByUser(slug, 'les-1', 'lesson', true)
  db.recordAttempt({
    courseSlug: slug,
    taskId: 'tsk-one',
    objectiveId: 'obj-one',
    depth: 'recall',
    check: 'deterministic',
    outcome: 'pass',
  })
  return root
}

describe('deleting a course', () => {
  it('leaves no folder and no row', async () => {
    const root = scene('going')
    const binned: string[] = []

    const result = await removeCourse(
      root,
      'going',
      (slug) => db.forget(slug),
      async (folder) => {
        binned.push(folder)
        rmSync(folder, { recursive: true, force: true })
      },
    )

    expect(result.ok).toBe(true)
    expect(binned).toEqual([join(root, 'going')])
    expect(existsSync(join(root, 'going'))).toBe(false)
    expect(db.pagesDone('going')).toBe(0)
    expect(db.attemptedTaskIds('going').size).toBe(0)
  })

  it('says where the folder still is when it cannot be moved', async () => {
    const root = scene('stuck')

    const result = await removeCourse(
      root,
      'stuck',
      (slug) => db.forget(slug),
      () => Promise.reject(new Error('Operation not permitted')),
    )

    expect(result.ok).toBe(false)
    expect(result.message).toContain(join(root, 'stuck'))
    expect(result.message).toContain('could not be moved to the Trash')
    // The user asked for it gone, so the rows go whatever the disk does.
    expect(db.pagesDone('stuck')).toBe(0)
    expect(existsSync(join(root, 'stuck'))).toBe(true)
  })

  it('forgets a course whose folder somebody already deleted by hand', async () => {
    const root = mkdtempSync(join(box, 'courses-'))
    db.setTickByUser('ghost', 'les-1', 'lesson', true)
    let asked = false

    const result = await removeCourse(
      root,
      'ghost',
      (slug) => db.forget(slug),
      () => {
        asked = true
        return Promise.resolve()
      },
    )

    expect(result.ok).toBe(true)
    expect(asked).toBe(false)
    expect(db.pagesDone('ghost')).toBe(0)
  })

  it('refuses a name that is a path rather than a course', async () => {
    const root = mkdtempSync(join(box, 'courses-'))
    mkdirSync(join(root, 'keep'))
    let asked = false

    const result = await removeCourse(
      root,
      '../keep',
      () => {
        asked = true
      },
      () => Promise.resolve(),
    )

    expect(result.ok).toBe(false)
    expect(asked).toBe(false)
    expect(existsSync(join(root, 'keep'))).toBe(true)
  })

  it('keeps the spend ledger, which outlives the course it built', async () => {
    const root = scene('paid')
    const run = db.startRun({ kind: 'build', courseSlug: 'paid', harness: 'claude', model: 'claude-opus-5' })
    db.endRun(run, 1.42, 'ok')

    await removeCourse(root, 'paid', (slug) => db.forget(slug), () => Promise.resolve())
    expect(db.lastRun('paid')).toEqual({ harness: 'claude', model: 'claude-opus-5' })
  })
})
