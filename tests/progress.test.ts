import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { join } from 'node:path'

import { parseCourse } from '../src/shared/parseCourse'
import { openProgress } from '../src/main/progress'
import type { Progress } from '../src/main/progress'
import { courseView, answerTask, answerTry, reachedEndOfLesson } from '../src/main/study'
import type { Course } from '../src/shared/format'

const FIXTURE = join(import.meta.dirname, '..', 'fixtures', 'courses', 'gradients-by-hand')
const SLUG = 'gradients-by-hand'

function load(): Course {
  const result = parseCourse(FIXTURE)
  if (!result.ok) throw new Error('fixture did not parse')
  return result.course
}

describe('test 9 — progress is one tick per page', () => {
  let progress: Progress
  const course = load()

  beforeEach(() => {
    progress = openProgress(':memory:')
  })
  afterEach(() => {
    progress.close()
  })

  it('a lesson ticks when the user reaches its end', () => {
    expect(progress.ticks(SLUG)['les-the-chain-rule']).toBeUndefined()
    reachedEndOfLesson(SLUG, course, progress, 'les-the-chain-rule')
    expect(progress.ticks(SLUG)['les-the-chain-rule']).toEqual({ ticked: true, byUser: false })
    expect(progress.pagesDone(SLUG)).toBe(1)
  })

  it('a test ticks only once every task in it has been attempted', () => {
    // tst-derivatives holds two tasks. One attempt is not enough.
    answerTask(SLUG, course, progress, 'tst-derivatives', 'tsk-slope-of-flat', [0])
    expect(progress.ticks(SLUG)['tst-derivatives']).toBeUndefined()

    const second = answerTask(SLUG, course, progress, 'tst-derivatives', 'tsk-derivative-of-square', 6)
    expect(second.ticked).toBe(true)
    expect(progress.ticks(SLUG)['tst-derivatives']).toEqual({ ticked: true, byUser: false })
  })

  it('a test the user got entirely wrong still ticks, because a tick counts and never scores', () => {
    const first = answerTask(SLUG, course, progress, 'tst-derivatives', 'tsk-slope-of-flat', [3])
    const second = answerTask(SLUG, course, progress, 'tst-derivatives', 'tsk-derivative-of-square', 99)
    expect(first.outcome.outcome).toBe('fail')
    expect(second.outcome.outcome).toBe('fail')
    expect(second.ticked).toBe(true)
  })

  it('a manual tick and a manual untick both persist', () => {
    progress.setTickByUser(SLUG, 'les-one-layer-at-a-time', 'lesson', true)
    expect(progress.ticks(SLUG)['les-one-layer-at-a-time']).toEqual({ ticked: true, byUser: true })

    progress.setTickByUser(SLUG, 'les-one-layer-at-a-time', 'lesson', false)
    expect(progress.ticks(SLUG)['les-one-layer-at-a-time']).toEqual({ ticked: false, byUser: true })
    expect(progress.pagesDone(SLUG)).toBe(0)
  })

  it('reading a lesson again does not undo a deliberate untick', () => {
    reachedEndOfLesson(SLUG, course, progress, 'les-the-chain-rule')
    progress.setTickByUser(SLUG, 'les-the-chain-rule', 'lesson', false)
    reachedEndOfLesson(SLUG, course, progress, 'les-the-chain-rule')
    expect(progress.ticks(SLUG)['les-the-chain-rule']).toEqual({ ticked: false, byUser: true })
  })

  it('ticks survive a reopened database', () => {
    const file = join(process.env['VITEST_TMP'] ?? '/tmp', `whetstone-${Date.now()}.db`)
    const first = openProgress(file)
    first.setTickByUser(SLUG, 'les-the-chain-rule', 'lesson', true)
    first.close()

    const second = openProgress(file)
    expect(second.ticks(SLUG)['les-the-chain-rule']?.ticked).toBe(true)
    second.close()
  })

  it('exposes pages done and nothing else that measures the user', () => {
    answerTask(SLUG, course, progress, 'tst-derivatives', 'tsk-slope-of-flat', [3])
    const view = courseView(SLUG, course, progress)

    // The count is the only progress figure anywhere. Anything resembling a score, an
    // attempt total, or an ability estimate must not reach the renderer at all.
    expect(Object.keys(view)).toEqual([
      'slug', 'id', 'title', 'subject', 'summary', 'ladder', 'modules',
      'pageCount', 'pagesDone', 'lessons', 'tests', 'resources',
    ])
    const page = view.modules[0]?.pages[1]
    expect(Object.keys(page ?? {}).sort()).toEqual(
      ['checks', 'depths', 'id', 'taskCount', 'ticked', 'title', 'type'],
    )
  })
})

describe('test 3b — a try records nothing, the same question inside a test records an attempt', () => {
  const course = load()

  it('answering a try leaves the record untouched', () => {
    const progress = openProgress(':memory:')
    // try-inner-derivative asks exactly what tsk-sin-of-3x2 asks. Only one is recorded.
    const outcome = answerTry(course, 'les-the-chain-rule', 'try-inner-derivative', [0])
    expect(outcome.outcome).toBe('pass')
    expect(progress.attemptedTaskIds(SLUG).size).toBe(0)
    expect(progress.pagesDone(SLUG)).toBe(0)
    progress.close()
  })

  it('answering the same question inside a test records one attempt', () => {
    const progress = openProgress(':memory:')
    answerTask(SLUG, course, progress, 'tst-chain-rule', 'tsk-sin-of-3x2', [0])
    expect([...progress.attemptedTaskIds(SLUG)]).toEqual(['tsk-sin-of-3x2'])
    progress.close()
  })

  it('a task that is not in the named test is refused', () => {
    const progress = openProgress(':memory:')
    expect(() =>
      answerTask(SLUG, course, progress, 'tst-derivatives', 'tsk-sin-of-3x2', [0]),
    ).toThrow(/not in test/)
    progress.close()
  })
})

describe('the renderer never receives an answer', () => {
  const course = load()

  it('strips the answer from every task and try it sends', () => {
    const progress = openProgress(':memory:')
    const view = courseView(SLUG, course, progress)
    const serialised = JSON.stringify(view)

    for (const test of Object.values(view.tests)) {
      for (const task of test.tasks) {
        expect(task).not.toHaveProperty('answer')
        expect(task).not.toHaveProperty('accepted')
        expect(task).not.toHaveProperty('answerGuide')
      }
    }
    // The answer guide of tsk-why-gradients-vanish must not appear anywhere in what
    // crosses the bridge, in any field. A guide is an answer with reasons attached.
    expect(serialised).not.toContain('each layer contributes a factor to a product')
    expect(serialised).not.toContain('Do not accept an answer that only names the symptom')
    expect(serialised).not.toContain('6x cos(3x^2)"]') // the try's answer array

    const lesson = view.lessons['les-the-chain-rule']
    const block = lesson?.blocks.find((item) => item.block === 'try')
    expect(block?.block).toBe('try')
    if (block?.block === 'try') {
      expect(block.question).not.toHaveProperty('answer')
      expect(block.question.options).toHaveLength(4)
    }
    progress.close()
  })

  it('keeps what the user is meant to see', () => {
    const progress = openProgress(':memory:')
    const view = courseView(SLUG, course, progress)
    const backprop = view.tests['tst-backprop']
    const writeup = backprop?.tasks.find((task) => task.id === 'tsk-two-layer-writeup')
    expect(writeup?.rubric).toHaveLength(3)
    const code = backprop?.tasks.find((task) => task.id === 'tsk-write-backward')
    expect(code?.assertions).toEqual(['shapes match', 'numeric gradient check', 'bias gradient'])
    progress.close()
  })
})
