import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import { missed, reviewSession, strugglingWith, touched } from '../src/shared/again'
import { parseCourse } from '../src/shared/parseCourse'
import type { Seen } from '../src/shared/again'
import type { Course } from '../src/shared/format'

/**
 * Coming back to things.
 *
 * Most of what these tests pin is what the app refuses to do. There is no schedule, no
 * interval, no due date and no weighting by ability, so the assertions are largely that a
 * cleverer answer did not creep in (PLAN 3.15).
 */

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..')
const read = parseCourse(join(ROOT, 'fixtures', 'courses', 'gradients-by-hand'))
if (!read.ok) throw new Error('the fixture course does not parse')
const course: Course = read.course

const ids = Object.keys(course.tasks).sort()
const attempt = (taskId: string, outcome: Seen['outcome'], at: string): Seen => ({ taskId, outcome, at })

describe('the missed list', () => {
  it('holds what was got wrong', () => {
    expect(missed([attempt(ids[0] as string, 'fail', '2026-09-01T10:00:00Z')])).toEqual([ids[0]])
  })

  it('lets go the moment one is got right', () => {
    // The whole rule. No interval, no second showing, no "one more time to be sure".
    const seen = [
      attempt(ids[0] as string, 'fail', '2026-09-01T10:00:00Z'),
      attempt(ids[0] as string, 'pass', '2026-09-01T10:05:00Z'),
    ]
    expect(missed(seen)).toEqual([])
  })

  it('comes back when it is got wrong again', () => {
    const seen = [
      attempt(ids[0] as string, 'fail', '2026-09-01T10:00:00Z'),
      attempt(ids[0] as string, 'pass', '2026-09-01T10:05:00Z'),
      attempt(ids[0] as string, 'fail', '2026-09-02T09:00:00Z'),
    ]
    expect(missed(seen)).toEqual([ids[0]])
  })

  it('reads the newest attempt, not the last row it was handed', () => {
    const seen = [
      attempt(ids[0] as string, 'pass', '2026-09-02T09:00:00Z'),
      attempt(ids[0] as string, 'fail', '2026-09-01T10:00:00Z'),
    ]
    expect(missed(seen)).toEqual([])
  })

  it('ignores an attempt that was voided', () => {
    // An upheld defect report voids the Attempt itself; it does not add a second row.
    // A Task that was only ever failed on a broken question must not sit on this list
    // accusing the reader (PLAN 3.15).
    expect(missed([attempt(ids[0] as string, 'voided', '2026-09-01T10:00:00Z')])).toEqual([])

    // And a voided attempt does not hide a real fail that came after it.
    const since = [
      attempt(ids[0] as string, 'voided', '2026-09-01T10:00:00Z'),
      attempt(ids[0] as string, 'fail', '2026-09-02T10:00:00Z'),
    ]
    expect(missed(since)).toEqual([ids[0]])
  })

  it('is a list and nothing else', () => {
    const seen = ids.map((id, index) => attempt(id, 'fail', `2026-09-0${index + 1}T10:00:00Z`))
    const list = missed(seen)
    // Sorted by id, so it does not imply an order to work through.
    expect(list).toEqual([...list].sort())
    expect(list.every((id) => typeof id === 'string')).toBe(true)
  })
})

describe('a review session', () => {
  const everywhere = ids.map((id) => attempt(id, 'pass', '2026-09-01T10:00:00Z'))

  it('draws nothing before the reader has met anything', () => {
    expect(reviewSession(course, [])).toEqual([])
  })

  it('draws only from objectives the reader has already touched', () => {
    const one = course.tasks[ids[0] as string]!
    const drawn = reviewSession(course, [attempt(one.id, 'fail', '2026-09-01T10:00:00Z')])
    expect(drawn.length).toBeGreaterThan(0)
    expect(drawn.every((task) => task.objective === one.objective)).toBe(true)
  })

  it('draws only what the host can answer, so a review works on a train', () => {
    const drawn = reviewSession(course, everywhere, 20)
    expect(drawn.length).toBeGreaterThan(0)
    expect(drawn.every((task) => task.check === 'deterministic')).toBe(true)
    // The fixture has a `model` task, so this is a filter rather than an accident.
    expect(Object.values(course.tasks).some((task) => task.check !== 'deterministic')).toBe(true)
  })

  it('never draws the same task twice', () => {
    const drawn = reviewSession(course, everywhere, 50)
    expect(new Set(drawn.map((task) => task.id)).size).toBe(drawn.length)
  })

  it('gives a short session rather than repeating itself when the pool is small', () => {
    const one = course.tasks[ids[0] as string]!
    const drawn = reviewSession(course, [attempt(one.id, 'pass', '2026-09-01T10:00:00Z')], 99)
    const pool = Object.values(course.tasks).filter(
      (task) => task.check === 'deterministic' && task.objective === one.objective,
    )
    expect(drawn.length).toBe(pool.length)
  })

  it('draws at random, and not by any estimate of how the reader is doing', () => {
    // Handed a picker that always takes the first, the draw is the pool in order. So the
    // order comes from the draw and from nothing about the reader.
    const drawn = reviewSession(course, everywhere, 3, () => 0)
    const pool = Object.values(course.tasks)
      .filter((task) => task.check === 'deterministic')
      .map((task) => task.id)
      .sort()
    expect(drawn.map((task) => task.id)).toEqual(pool.slice(0, 3))
  })

  it('knows which objectives have been met, whichever way it went', () => {
    const one = course.tasks[ids[0] as string]!
    expect(touched(course, [attempt(one.id, 'fail', '2026-09-01T10:00:00Z')])).toEqual([one.objective])
    expect(touched(course, [attempt('tsk-not-here', 'pass', '2026-09-01T10:00:00Z')])).toEqual([])
  })
})

describe('noticing that one objective is going badly', () => {
  const forOne = (objective: string): string[] =>
    Object.values(course.tasks)
      .filter((task) => task.objective === objective)
      .map((task) => task.id)

  const objective = course.tasks[ids[0] as string]!.objective
  const theirs = forOne(objective)

  it('says nothing until it has plainly happened three times', () => {
    const two = theirs.slice(0, 2).map((id, index) => attempt(id, 'fail', `2026-09-0${index + 1}T10:00:00Z`))
    expect(strugglingWith(course, two)).toEqual([])
  })

  it('offers after three fails on one objective', () => {
    const three = [
      attempt(theirs[0] as string, 'fail', '2026-09-01T10:00:00Z'),
      attempt(theirs[0] as string, 'fail', '2026-09-02T10:00:00Z'),
      attempt(theirs[0] as string, 'fail', '2026-09-03T10:00:00Z'),
    ]
    expect(strugglingWith(course, three)).toEqual([objective])
  })

  it('forgets the run the moment one goes right', () => {
    const then = [
      attempt(theirs[0] as string, 'fail', '2026-09-01T10:00:00Z'),
      attempt(theirs[0] as string, 'fail', '2026-09-02T10:00:00Z'),
      attempt(theirs[0] as string, 'pass', '2026-09-03T10:00:00Z'),
      attempt(theirs[0] as string, 'fail', '2026-09-04T10:00:00Z'),
    ]
    expect(strugglingWith(course, then)).toEqual([])
  })

  it('counts what happened in the order it happened', () => {
    // Handed the rows backwards, the answer is the same. A count of a thing that plainly
    // happened, never an estimate of the reader (PLAN 3.4).
    const rows = [
      attempt(theirs[0] as string, 'fail', '2026-09-03T10:00:00Z'),
      attempt(theirs[0] as string, 'fail', '2026-09-01T10:00:00Z'),
      attempt(theirs[0] as string, 'fail', '2026-09-02T10:00:00Z'),
    ]
    expect(strugglingWith(course, rows)).toEqual([objective])
  })
})
