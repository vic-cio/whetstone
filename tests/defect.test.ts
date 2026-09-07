import { describe, it, expect, beforeEach } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { parseCourse } from '../src/shared/parseCourse'
import { openProgress } from '../src/main/progress'
import { readEvaluation } from '../src/shared/defect'
import { emptiesATest, tasksUnder, voidUnder } from '../src/main/study'
import type { Course } from '../src/shared/format'
import type { Progress } from '../src/main/progress'

/**
 * A defect report, and what upholding one does.
 *
 * The claim is that the Task itself is broken, on three grounds. It is never an appeal
 * against a Verdict, and the record moves in exactly one place: upholding voids the
 * Attempts against a broken question, and never rescores (PLAN 3.15).
 */

const ROOT = join(import.meta.dirname, '..')
const FIXTURE = join(ROOT, 'fixtures', 'courses', 'gradients-by-hand')
const SLUG = 'gradients-by-hand'
const TEST = 'tst-derivatives'
const FLAT = 'tsk-slope-of-flat'

const parsed = parseCourse(FIXTURE)
if (!parsed.ok) throw new Error('the fixture course did not parse')
const course: Course = parsed.course

let progress: Progress

beforeEach(() => {
  progress = openProgress(':memory:')
})

function anAttempt(taskId: string, outcome: 'pass' | 'fail'): void {
  const task = course.tasks[taskId]!
  progress.recordAttempt({
    courseSlug: SLUG,
    taskId,
    objectiveId: task.objective,
    depth: task.depth,
    check: task.check,
    outcome,
  })
}

describe('what the constructor is allowed to come back with', () => {
  it('reads an agreement and its reason', () => {
    const said = readEvaluation('AGREE\nThe options give two right answers, so it cannot be answered.')
    expect(said.at).toBe('evaluated')
    if (said.at === 'evaluated') {
      expect(said.agrees).toBe(true)
      expect(said.text).toContain('two right answers')
    }
  })

  it('reads a disagreement through the markup a model reaches for', () => {
    const said = readEvaluation('**DISAGREE.** The question uses the definition given in lesson two.')
    expect(said.at).toBe('evaluated')
    if (said.at === 'evaluated') {
      expect(said.agrees).toBe(false)
      expect(said.text).toBe('The question uses the definition given in lesson two.')
    }
  })

  /**
   * The same rule as a Verdict, for the same reason. An answer that cannot be read has
   * evaluated nothing, and a guess here either waves away a real defect or voids somebody's
   * Attempts on a run that never ran.
   */
  it('calls anything else trouble, rather than deciding', () => {
    expect(readEvaluation('It depends on what you mean by flat.').at).toBe('trouble')
    expect(readEvaluation('AGREE').at).toBe('trouble')
    expect(readEvaluation('').at).toBe('trouble')
  })

  it('ships the instruction file that asks for one of those two words', () => {
    const role = join(ROOT, 'agent', 'roles', 'constructor-defect.md')
    expect(existsSync(role)).toBe(true)
    const text = readFileSync(role, 'utf8')
    expect(text).toContain('`AGREE` or `DISAGREE`')
    // It settles nothing, and the file has to say so, because a role that believes it is
    // deciding writes as though the reader has no say.
    expect(text).toContain('override')
  })
})

describe('a report the constructor disagrees with', () => {
  it('leaves the record untouched until the reader overrides it', () => {
    anAttempt(FLAT, 'fail')
    const id = progress.fileDefect({ courseSlug: SLUG, taskId: FLAT, ground: 'inaccurate', note: 'Two of these are right.' })
    expect(progress.defect(id)?.status).toBe('open')

    progress.evaluateDefect(id, { agrees: false, text: 'The question asks for the tangent, not the curve.' })
    const disputed = progress.defect(id)
    expect(disputed?.status).toBe('disputed')
    expect(disputed?.overridden).toBe(false)
    // Nothing moved. The Attempt is still a fail and the reader still has the question.
    expect(progress.attemptsFor(SLUG).map((seen) => seen.outcome)).toEqual(['fail'])

    progress.upholdDefect(id, true)
    const upheld = progress.defect(id)
    expect(upheld?.status).toBe('upheld')
    expect(upheld?.overridden).toBe(true)
    expect(progress.attemptsFor(SLUG).map((seen) => seen.outcome)).toEqual(['voided'])
  })

  it('changes nothing at all when the reader lets it go', () => {
    anAttempt(FLAT, 'fail')
    const id = progress.fileDefect({ courseSlug: SLUG, taskId: FLAT, ground: 'impossible', note: 'Cannot be done.' })
    progress.evaluateDefect(id, { agrees: false, text: 'It can, and lesson one shows how.' })
    progress.dropDefect(id)
    expect(progress.defect(id)?.status).toBe('dropped')
    expect(progress.attemptsFor(SLUG).map((seen) => seen.outcome)).toEqual(['fail'])
  })

  it('voids without an override when the constructor agrees', () => {
    anAttempt(FLAT, 'pass')
    const id = progress.fileDefect({ courseSlug: SLUG, taskId: FLAT, ground: 'broke', note: 'The activity never drew.' })
    progress.evaluateDefect(id, { agrees: true, text: 'The activity names a file that is not there.' })
    progress.upholdDefect(id, false)
    expect(progress.defect(id)?.overridden).toBe(false)
    // Voiding rewrites an outcome. It never rescores, and a pass is voided the same way.
    expect(progress.attemptsFor(SLUG).map((seen) => seen.outcome)).toEqual(['voided'])
  })
})

describe('taking a question or a module away', () => {
  it('names the test a removal would empty, so a replacement is written instead', () => {
    // A Test page vanishing from a Course somebody is part way through leaves a hole.
    const alone: Course = {
      ...course,
      tests: { ...course.tests, [TEST]: { ...course.tests[TEST]!, tasks: [FLAT] } },
    }
    expect(emptiesATest(alone, FLAT)).toBe(TEST)
    // In the real fixture that Test holds two, so removing one leaves a Test behind.
    expect(emptiesATest(course, FLAT)).toBeUndefined()
  })

  it('finds every task under a module', () => {
    expect(tasksUnder(course, 'mod-1')).toEqual(course.tests[TEST]?.tasks)
    expect(tasksUnder(course, 'mod-nowhere')).toEqual([])
  })

  it('voids every attempt under a removed module, and leaves the rest alone', () => {
    anAttempt(FLAT, 'pass')
    anAttempt('tsk-sin-of-3x2', 'pass')
    const voided = voidUnder(SLUG, course, progress, 'mod-1')
    expect(voided).toContain(FLAT)

    const byTask = new Map(progress.attemptsFor(SLUG).map((seen) => [seen.taskId, seen.outcome]))
    expect(byTask.get(FLAT)).toBe('voided')
    // Module 2's question is untouched: a removal reaches its own module and no further.
    expect(byTask.get('tsk-sin-of-3x2')).toBe('pass')
  })
})
