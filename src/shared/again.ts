import type { Course, Task } from './format'

/**
 * Coming back to things.
 *
 * Two features, and what they have in common is what they refuse to be. There is no
 * schedule, no interval, no due date, no ability estimate and no weighting. A
 * spaced-repetition scheduler is the machinery that turns study into homework, and the app
 * is built to avoid exactly that (PLAN 3.15).
 *
 * **Missed** is the list of Tasks the reader got wrong and has not since got right. Getting
 * one right removes it. That is the whole rule, and it is derived from the Attempts rather
 * than kept in a list of its own: two records of one fact drift, and this one can be read
 * off the record that already has to be right.
 *
 * **A review session** is a handful of Tasks drawn at random from Objectives the reader has
 * already touched. At random, because any cleverer draw is an estimate of how well they
 * hold something, and the app keeps none.
 */

/** One Attempt, as the list needs to read it: newest first, per Task. */
export interface Seen {
  taskId: string
  outcome: 'pass' | 'fail' | 'voided'
  at: string
}

/**
 * The Tasks the reader got wrong and has not since got right.
 *
 * A voided Attempt is not an answer. An upheld defect report voids one, and a Task that was
 * only ever failed on a broken question must not sit on this list accusing the reader.
 */
export function missed(seen: Seen[]): string[] {
  const latest = new Map<string, Seen>()
  for (const attempt of seen) {
    if (attempt.outcome === 'voided') continue
    const held = latest.get(attempt.taskId)
    if (!held || attempt.at > held.at) latest.set(attempt.taskId, attempt)
  }
  return [...latest.entries()]
    .filter(([, attempt]) => attempt.outcome === 'fail')
    .map(([taskId]) => taskId)
    .sort()
}

/** Which Objectives the reader has met, whichever way those Attempts went. */
export function touched(course: Course, seen: Seen[]): string[] {
  const objectives = new Set<string>()
  for (const attempt of seen) {
    const task = course.tasks[attempt.taskId]
    if (task) objectives.add(task.objective)
  }
  return [...objectives].sort()
}

/**
 * Draw a review session.
 *
 * Deterministic Tasks only, so a review runs offline and costs nothing. That is not a
 * budget compromise: a review is something a reader should be able to do on a train, and a
 * handful of questions that each need a model is a different and worse feature.
 *
 * `pick` is passed in so a test can watch a real draw rather than a seeded one.
 */
export function reviewSession(
  course: Course,
  seen: Seen[],
  howMany = 6,
  pick: (upTo: number) => number = (upTo) => Math.floor(Math.random() * upTo),
): Task[] {
  const objectives = new Set(touched(course, seen))
  if (objectives.size === 0) return []

  const pool = Object.values(course.tasks).filter(
    (task) => task.check === 'deterministic' && objectives.has(task.objective),
  )

  // Drawn without replacement, so a short pool gives a short session rather than the same
  // question twice.
  const drawn: Task[] = []
  const left = [...pool].sort((a, b) => a.id.localeCompare(b.id))
  while (drawn.length < howMany && left.length > 0) {
    const [taken] = left.splice(pick(left.length), 1)
    if (taken) drawn.push(taken)
  }
  return drawn
}

/**
 * Is one Objective going badly enough to offer a remediation block?
 *
 * The threshold is deliberately dull: three fails on one Objective with no pass since. It
 * is not an estimate of ability, it is a count of a thing that plainly happened, and it
 * produces an offer rather than an intervention. The reader presses it or ignores it.
 */
export function strugglingWith(course: Course, seen: Seen[], after = 3): string[] {
  const runs = new Map<string, number>()
  const ordered = [...seen].sort((a, b) => a.at.localeCompare(b.at))

  for (const attempt of ordered) {
    if (attempt.outcome === 'voided') continue
    const task = course.tasks[attempt.taskId]
    if (!task) continue
    if (attempt.outcome === 'pass') runs.set(task.objective, 0)
    else runs.set(task.objective, (runs.get(task.objective) ?? 0) + 1)
  }

  return [...runs.entries()]
    .filter(([, fails]) => fails >= after)
    .map(([objective]) => objective)
    .sort()
}
