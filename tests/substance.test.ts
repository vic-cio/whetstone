import { describe, expect, it } from 'vitest'
import { join } from 'node:path'

import { parseCourse } from '../src/shared/parseCourse'
import { substancePrompt, thin } from '../src/shared/substance'
import type { Course, Lesson } from '../src/shared/format'

/**
 * The second gate.
 *
 * The parser says whether a Course is well formed. This says whether there is enough there
 * to learn from, which is a different question and the one both real builds failed: the
 * first was 17 pages of 174 words, the second 34 lessons of which 23 were under 400 words,
 * with 31 of 42 questions multiple choice and every objective's questions in one Test.
 *
 * It asks and never refuses, so what these check is that it names the right things
 * precisely enough to act on, and stays quiet about a Course that is short on purpose.
 */

const FIXTURE = join(import.meta.dirname, '..', 'fixtures', 'courses', 'gradients-by-hand')

function load(): Course {
  const result = parseCourse(FIXTURE)
  if (!result.ok) throw new Error('the fixture course did not parse')
  return result.course
}

/** A Lesson of `words` words, keeping everything else about it. */
function padded(lesson: Lesson, words: number): Lesson {
  return {
    ...lesson,
    blocks: [{ block: 'prose', markdown: 'word '.repeat(words).trim() }],
  }
}

const said = (complaints: { file: string; message: string }[]): string =>
  complaints.map((one) => `${one.file}: ${one.message}`).join('\n')

describe('measuring whether there is enough to learn from', () => {
  it('names each short lesson, with its own count', () => {
    const course = load()
    const first = Object.values(course.lessons)[0]!
    const thinned: Course = {
      ...course,
      lessons: { ...course.lessons, [first.id]: padded(first, 174) },
    }
    const complaints = thin(thinned)
    expect(said(complaints)).toContain(`lessons/${first.id}.md: is 174 words of prose`)
    // Naming the file is the point: "the course is thin" is not something a run can act on.
    expect(complaints.some((one) => one.file === `lessons/${first.id}.md`)).toBe(true)
  })

  it('says the average, so the run cannot fix one lesson and call it done', () => {
    const course = load()
    const lessons: Course['lessons'] = {}
    for (const [id, lesson] of Object.entries(course.lessons)) lessons[id] = padded(lesson, 393)
    expect(said(thin({ ...course, lessons }))).toContain('averages 393 words a lesson')
  })

  it('is quiet about lessons that are long enough', () => {
    const course = load()
    const lessons: Course['lessons'] = {}
    for (const [id, lesson] of Object.entries(course.lessons)) lessons[id] = padded(lesson, 800)
    const complaints = thin({ ...course, lessons })
    expect(complaints.some((one) => one.message.includes('words of prose'))).toBe(false)
    expect(complaints.some((one) => one.message.includes('averages'))).toBe(false)
  })

  /**
   * A small Course is short because the reader asked for a short one. The field exists to
   * say so, and a gate that ignored it would argue with the brief.
   */
  it('says nothing at all about a course marked small', () => {
    const course = load()
    const lessons: Course['lessons'] = {}
    for (const [id, lesson] of Object.entries(course.lessons)) lessons[id] = padded(lesson, 120)
    expect(thin({ ...course, lessons, small: true })).toEqual([])
  })

  it('catches an objective that is sampled rather than practised', () => {
    const course = load()
    const only = Object.values(course.tasks)[0]!
    const complaints = thin({ ...course, tasks: { [only.id]: only } })
    expect(said(complaints)).toContain(`objective "${only.objective}" has 1 question`)
    expect(said(complaints)).toContain('a sample, not practice')
  })

  /**
   * The finding the second build turned up: six questions on one idea, all in one sitting,
   * never seen again. The count looks right and the practice is one afternoon's.
   */
  it('catches an idea that never comes back after its own test', () => {
    const course = load()
    // tst-chain-rule holds every task belonging to obj-chain-rule.
    const complaints = thin(course)
    expect(said(complaints)).toContain('sits in one test')
    expect(said(complaints)).toContain('where it is no longer what the module is about')
  })

  it('catches a test made of things to pick from a list', () => {
    const course = load()
    const tasks: Course['tasks'] = {}
    for (const [id, task] of Object.entries(course.tasks)) {
      tasks[id] = { ...task, check: 'deterministic', kind: 'multiple-choice', options: ['a', 'b'], answer: [0] } as never
    }
    expect(said(thin({ ...course, tasks }))).toContain('questions are ones the reader picks from a list')
  })

  it('catches a long module with one test at the end of it', () => {
    const course = load()
    const module = course.modules[0]!
    const pages = [
      ...Array.from({ length: 9 }, (_, index) => ({ type: 'lesson' as const, id: `les-${index}` })),
      { type: 'test' as const, id: 'tst-derivatives' },
    ]
    expect(said(thin({ ...course, modules: [{ ...module, pages }] }))).toContain(
      '9 lessons against 1 test',
    )
  })
})

describe('what the run is told', () => {
  it('asks for writing, and forbids the two ways of gaming the measure', () => {
    const prompt = substancePrompt([{ file: 'lessons/les-one.md', message: 'is 174 words of prose' }])
    expect(prompt).toContain('The course parses')
    expect(prompt).toContain('lessons/les-one.md: is 174 words of prose')
    expect(prompt).toContain('Fix these by writing, not by trimming')
    // Splitting one thin lesson into two thinner ones raises no average worth having.
    expect(prompt).toContain('do not add pages to raise an average')
    expect(prompt).toContain('staging-a-lesson')
  })
})
