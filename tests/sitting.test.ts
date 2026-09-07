import { describe, it, expect, beforeEach } from 'vitest'
import { join } from 'node:path'

import { parseCourse } from '../src/shared/parseCourse'
import { openProgress } from '../src/main/progress'
import { answerDeterministic } from '../src/shared/grade'
import { graderPrompt } from '../src/shared/prompts'
import {
  checkedTask,
  earlierAnswers,
  holdAnswer,
  retakeTest,
  sittingFor,
} from '../src/main/study'
import type { Course } from '../src/shared/format'
import type { Progress } from '../src/main/progress'

/**
 * A Test is a sitting (docs/adr/0022).
 *
 * These are the parts of it that fail quietly: an answer that does not survive a closed
 * window, a result that leaks before the last question is checked, and a dependent
 * question marked against the right answer rather than the reader's own.
 */

const FIXTURE = join(import.meta.dirname, '..', 'fixtures', 'courses', 'gradients-by-hand')
const SLUG = 'gradients-by-hand'
/** Two deterministic Tasks, in this order. */
const TEST = 'tst-derivatives'
const FLAT = 'tsk-slope-of-flat'
const SQUARE = 'tsk-derivative-of-square'

const result = parseCourse(FIXTURE)
if (!result.ok) throw new Error('the fixture course did not parse')
const course: Course = result.course

let progress: Progress

beforeEach(() => {
  progress = openProgress(':memory:')
})

/** Check one deterministic Task the way `answering.ts` does, without spawning anything. */
function check(taskId: string, given: unknown): ReturnType<typeof checkedTask> {
  const task = course.tasks[taskId]!
  return checkedTask(SLUG, course, progress, TEST, taskId, given, {
    outcome: answerDeterministic(task, given),
  })
}

describe('a half-answered test comes back', () => {
  it('holds what was typed, without checking it', () => {
    holdAnswer(SLUG, course, progress, TEST, SQUARE, 5)
    const sitting = sittingFor(SLUG, course, progress, TEST)
    expect(sitting.answers[SQUARE]).toEqual({ given: 5, checked: false })
    expect(sitting.revealed).toBe(false)
    // Nothing was judged, so nothing was recorded.
    expect(progress.attemptsFor(SLUG)).toHaveLength(0)
  })

  it('is the same sitting when the test is opened again', () => {
    const first = holdAnswer(SLUG, course, progress, TEST, FLAT, [2])
    const reopened = sittingFor(SLUG, course, progress, TEST)
    expect(reopened.id).toBe(first.id)
    expect(reopened.answers[FLAT]?.given).toEqual([2])
  })

  it('never overwrites an answer that has already been checked', () => {
    check(FLAT, [0])
    holdAnswer(SLUG, course, progress, TEST, FLAT, [3])
    expect(sittingFor(SLUG, course, progress, TEST).answers[FLAT]).toEqual({
      given: [0],
      checked: true,
    })
  })
})

describe('a checked question shows nothing until the last one is checked', () => {
  it('records the attempt at once, because the run happened', () => {
    check(FLAT, [0])
    expect(progress.attemptsFor(SLUG)).toHaveLength(1)
  })

  it('holds every result back while one question is unchecked', () => {
    const sitting = check(FLAT, [0])
    expect(sitting.answers[FLAT]?.checked).toBe(true)
    expect(sitting.revealed).toBe(false)
    // The whole rule, in one line: what the window never receives it cannot show early.
    expect(sitting.results).toBeUndefined()
  })

  it('reveals every result at once when the last question is checked', () => {
    check(FLAT, [0])
    const sitting = check(SQUARE, 5)
    expect(sitting.revealed).toBe(true)
    expect(sitting.results?.[FLAT]?.passed).toBe(true)
    expect(sitting.results?.[SQUARE]?.passed).toBe(false)
    // The Course's own words, kept for the feedback screen.
    expect(sitting.results?.[SQUARE]?.explanation).toContain("f'(3) = 6")
  })

  it('gives back what the reader put, so feedback can show it', () => {
    check(FLAT, [0])
    expect(check(SQUARE, 5).results?.[SQUARE]?.given).toBe(5)
  })

  /**
   * PLAN 3.4, and the line most likely to be crossed by accident while building the reveal
   * screen. There is no total in here to draw, which is the reason there is none on screen.
   */
  it('carries no mark, no percentage and no count of how it went', () => {
    check(FLAT, [0])
    const sitting = check(SQUARE, 5)
    expect(Object.keys(sitting).sort()).toEqual(['answers', 'id', 'results', 'revealed'])
    // One result per question, and each says only whether it passed and why. `given` is
    // the reader's own answer and may be a number; nothing here measures anything.
    const allowed = ['assertions', 'explanation', 'given', 'passed', 'verdict']
    for (const one of Object.values(sitting.results ?? {})) {
      for (const key of Object.keys(one)) expect(allowed).toContain(key)
    }
  })
})

describe('a retake is another go, not a correction', () => {
  it('starts a fresh sitting with nothing shown', () => {
    check(FLAT, [0])
    const done = check(SQUARE, 6)
    expect(done.revealed).toBe(true)

    const fresh = retakeTest(SLUG, course, progress, TEST)
    expect(fresh.id).not.toBe(done.id)
    expect(fresh.revealed).toBe(false)
    expect(fresh.results).toBeUndefined()
    expect(fresh.answers[SQUARE]).toBeUndefined()
  })

  it('leaves both sittings in the record', () => {
    check(FLAT, [0])
    check(SQUARE, 6)
    retakeTest(SLUG, course, progress, TEST)
    check(FLAT, [1])
    // Four Attempts, and the missed list reads the latest: the second sitting got the
    // first question wrong, so it is missed now even though the first sitting passed it.
    expect(progress.attemptsFor(SLUG)).toHaveLength(3)
    const latest = progress.attemptsFor(SLUG).at(-1)
    expect(latest?.taskId).toBe(FLAT)
    expect(latest?.outcome).toBe('fail')
  })
})

describe('a question that follows another', () => {
  /**
   * The one exception to the Grader's amnesia. The earlier question and the reader's own
   * answer go to the run; the right answer does not, which is what makes a right method on
   * a wrong part a pass part b.
   */
  it('hands the run the reader’s own earlier answer, and not the correct one', () => {
    const followed: Course = {
      ...course,
      tasks: { ...course.tasks, [SQUARE]: { ...course.tasks[SQUARE]!, follows: [FLAT] } },
    }
    // A wrong part a: "undefined" rather than "zero".
    check(FLAT, [2])
    const earlier = earlierAnswers(SLUG, followed, progress, TEST, SQUARE)
    expect(earlier).toEqual([
      { id: FLAT, prompt: course.tasks[FLAT]!.prompt, given: [2] },
    ])
    expect(JSON.stringify(earlier)).not.toContain('answer')
  })

  it('hands the run nothing when the task follows nothing', () => {
    check(FLAT, [0])
    expect(earlierAnswers(SLUG, course, progress, TEST, SQUARE)).toEqual([])
  })

  it('tells the grader to mark the method on that earlier answer', () => {
    const prompt = graderPrompt({ rubric: false, skills: [], attached: [], writeFile: false, earlier: true })
    expect(prompt).toContain('earlier.json')
    expect(prompt).toContain('A right method carried out on a wrong earlier answer passes.')
    // And says nothing of the kind when the question stands alone.
    const alone = graderPrompt({ rubric: false, skills: [], attached: [], writeFile: false })
    expect(alone).not.toContain('earlier.json')
  })
})
