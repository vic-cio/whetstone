import { describe, it, expect } from 'vitest'
import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { parseCourse } from '../src/shared/parseCourse'
import { compileDeclaredActivities } from '../src/shared/declaredActivity'

/**
 * `parseCourse` is where a Task and the declared activity its `app-result` points at are
 * both in scope at once, so it is where the initial-state cross-check has to live: an
 * `app-result` Task whose `answer` equals a declared activity's own untouched starting
 * state must fail the build, the same way a missing objective id fails it today.
 */

const ROOT = join(import.meta.dirname, '..')
const FIXTURE = join(ROOT, 'fixtures', 'courses', 'gradients-by-hand')

function copyFixture(): string {
  const dir = join(mkdtempSync(join(tmpdir(), 'whetstone-declared-')), 'course')
  cpSync(FIXTURE, dir, { recursive: true })
  return dir
}

function addOrderTask(dir: string, id: string, answer: number[]): void {
  writeFileSync(
    join(dir, 'tasks', `${id}.json`),
    JSON.stringify({
      id,
      objective: 'obj-chain-rule',
      depth: 'apply',
      check: 'deterministic',
      kind: 'app-result',
      prompt: 'Put the steps in order.',
      app: 'act-order-test',
      answer,
    }),
  )
  // Reachable from the existing test, so the Task cross-reference checks stay satisfied.
  const testPath = join(dir, 'tests', 'tst-chain-rule.json')
  const test = JSON.parse(readFileSync(testPath, 'utf8')) as { tasks: string[] }
  test.tasks.push(id)
  writeFileSync(testPath, JSON.stringify(test, null, 2))
}

function addOrderActivity(dir: string): void {
  mkdirSync(join(dir, 'activities'), { recursive: true })
  writeFileSync(
    join(dir, 'activities', 'act-order-test.json'),
    JSON.stringify({
      id: 'act-order-test',
      widget: 'order',
      label: 'Order these',
      items: ['first', 'second', 'third'],
    }),
  )
  const errors = compileDeclaredActivities(dir)
  if (errors.length > 0) throw new Error(`fixture activity did not compile: ${JSON.stringify(errors)}`)
}

describe('parseCourse cross-checks an app-result Task against its declared activity', () => {
  it('fails when the expected answer equals the identity order untouched', () => {
    const dir = copyFixture()
    addOrderActivity(dir)
    addOrderTask(dir, 'tsk-order-untouched', [0, 1, 2])

    const result = parseCourse(dir)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(
      result.errors.some(
        (error) => error.file === 'tasks/tsk-order-untouched.json' && /untouched|initial|starting/i.test(error.message),
      ),
    ).toBe(true)
  })

  it('passes when the expected answer requires the widget to actually change', () => {
    const dir = copyFixture()
    addOrderActivity(dir)
    addOrderTask(dir, 'tsk-order-moved', [2, 0, 1])

    const result = parseCourse(dir)
    expect(result.ok).toBe(true)
  })
})
