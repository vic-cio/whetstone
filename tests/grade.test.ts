import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { join } from 'node:path'

import { parseCourse } from '../src/shared/parseCourse'
import { answerDeterministic, normalise } from '../src/shared/grade'
import { isOffline } from '../src/shared/format'
import type { Course, Task } from '../src/shared/format'

const FIXTURE = join(import.meta.dirname, '..', 'fixtures', 'courses', 'gradients-by-hand')

let course: Course
const task = (id: string): Task => {
  const found = course.tasks[id]
  if (!found) throw new Error(`fixture has no task ${id}`)
  return found
}

beforeAll(() => {
  const result = parseCourse(FIXTURE)
  if (!result.ok) throw new Error('fixture did not parse')
  course = result.course
})

describe('test 6 — every deterministic kind answers with no network', () => {
  /**
   * There is no I/O to stub: these are pure functions. Rather than mock a network, this
   * removes fetch entirely, so any accidental call would throw rather than pass silently.
   */
  const realFetch = globalThis.fetch
  beforeAll(() => {
    // @ts-expect-error deliberately removing fetch for the duration of these tests
    delete globalThis.fetch
  })
  afterAll(() => {
    globalThis.fetch = realFetch
  })

  it('multiple-choice', () => {
    expect(answerDeterministic(task('tsk-slope-of-flat'), [0]).outcome).toBe('pass')
    expect(answerDeterministic(task('tsk-slope-of-flat'), [2]).outcome).toBe('fail')
    expect(answerDeterministic(task('tsk-slope-of-flat'), []).outcome).toBe('fail')
  })

  it('numeric, within the declared tolerance', () => {
    expect(answerDeterministic(task('tsk-derivative-of-square'), 6).outcome).toBe('pass')
    expect(answerDeterministic(task('tsk-derivative-of-square'), 6.0005).outcome).toBe('pass')
    expect(answerDeterministic(task('tsk-derivative-of-square'), 6.5).outcome).toBe('fail')
    expect(answerDeterministic(task('tsk-derivative-of-square'), 'not a number').outcome).toBe('fail')
  })

  it('ordering', () => {
    expect(answerDeterministic(task('tsk-name-the-rule'), [0, 1, 2, 3]).outcome).toBe('pass')
    expect(answerDeterministic(task('tsk-name-the-rule'), [3, 2, 1, 0]).outcome).toBe('fail')
  })

  it('accepted-answers, the Duolingo check', () => {
    const t = task('tsk-why-gradients-vanish')
    expect(answerDeterministic(t, 'The product of many small numbers shrinks toward zero.').outcome).toBe('pass')
    expect(answerDeterministic(t, 'the  product of MANY small numbers shrinks toward zero').outcome).toBe('pass')
    expect(answerDeterministic(t, 'because the weights are large').outcome).toBe('fail')
    expect(answerDeterministic(t, '').outcome).toBe('fail')
  })

  it('app-result, where the mini-app reports and the host decides', () => {
    const t = task('tsk-place-the-factors')
    expect(answerDeterministic(t, { placements: ['hidden', 'hidden', 'output', 'output'] }).outcome).toBe('pass')
    expect(answerDeterministic(t, { placements: ['output', 'hidden', 'output', 'output'] }).outcome).toBe('fail')
    expect(answerDeterministic(t, { placements: [] }).outcome).toBe('fail')
  })

  it('assertions-pass, reporting each assertion by name', () => {
    const t = task('tsk-write-backward')
    const all = answerDeterministic(t, { passed: ['shapes match', 'numeric gradient check', 'bias gradient'] })
    expect(all.outcome).toBe('pass')
    expect(all.assertions).toEqual([
      { name: 'shapes match', passed: true },
      { name: 'numeric gradient check', passed: true },
      { name: 'bias gradient', passed: true },
    ])

    const partial = answerDeterministic(t, { passed: ['shapes match'] })
    expect(partial.outcome).toBe('fail')
    expect(partial.assertions?.filter((a) => a.passed)).toHaveLength(1)
  })

  it('a mini-app cannot pass itself by claiming an assertion the task never declared', () => {
    const result = answerDeterministic(task('tsk-write-backward'), { passed: ['made it up'] })
    expect(result.outcome).toBe('fail')
  })
})

describe('test 2 — a transfer-depth task is answered offline, at no cost', () => {
  it('answers the fixture\'s transfer-depth deterministic task without a grader', () => {
    const t = task('tsk-why-gradients-vanish')
    expect(t.depth).toBe('transfer')
    expect(isOffline(t)).toBe(true)
    expect(answerDeterministic(t, 'the product of many small numbers shrinks toward zero').outcome).toBe('pass')
  })

  it('derives offline from check alone, never from depth', () => {
    for (const t of Object.values(course.tasks)) {
      expect(isOffline(t)).toBe(t.check === 'deterministic')
    }
    const deterministicDepths = new Set(
      Object.values(course.tasks).filter((t) => t.check === 'deterministic').map((t) => t.depth),
    )
    // Deterministic tasks span shallow and deep, so the marker cannot be read off depth.
    expect(deterministicDepths.size).toBeGreaterThan(1)
    expect(deterministicDepths).toContain('transfer')
  })

  it('refuses to answer a task that needs a grader, rather than guessing', () => {
    expect(() => answerDeterministic(task('tsk-two-layer-writeup'), 'anything')).toThrow(/cannot be answered by the host/)
  })
})

describe('normalising a typed answer', () => {
  it('folds case, spacing, punctuation and accents, and nothing else', () => {
    expect(normalise('  The   Product, of numbers! ')).toBe('the product of numbers')
    expect(normalise('café')).toBe('cafe')
    expect(normalise('one')).not.toBe(normalise('two'))
  })
})
