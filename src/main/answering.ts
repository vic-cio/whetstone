import { judge } from './grader'
import { loadCourse, progress } from './courseStore'
import { answerTask, checkedTask, earlierAnswers, recordTask, taskIn } from './study'
import { answerDeterministic } from '../shared/grade'
import type { SittingView } from './study'
import type { Moment } from '../shared/harness'
import type { Outcome } from '../shared/grade'
import type { Verdict } from '../shared/verdict'

/**
 * Answering a Task, whichever way it is checked.
 *
 * The renderer asks the same thing every time and does not know which path it took. That is
 * the point: `check` is the Task's business and nothing above it has to branch.
 *
 * Most Tasks never reach a model. `deterministic` is answered here, instantly, offline, at
 * no cost, at any Depth (PLAN 3.15). A Task that does need one costs money and needs a
 * network, and the reader pressed a button to get here.
 */

export type Answered =
  | { at: 'answered'; outcome: Outcome; ticked: boolean; verdict?: Verdict }
  /** The Grader could not judge it. Nothing is recorded and the Attempt stays open. */
  | { at: 'trouble'; message: string }

export interface Judged {
  slug: string
  testId: string
  taskId: string
  given: unknown
  harnessId: string
  model: string
  /** Files the reader attached at `project` depth. Copied into the Attempt folder. */
  submission?: string[]
}

export async function answer(request: Judged, onMoment: (moment: Moment) => void): Promise<Answered> {
  const course = loadCourse(request.slug)
  const task = taskIn(course, request.testId, request.taskId, request.slug)

  if (task.check === 'deterministic') {
    const done = answerTask(request.slug, course, progress(), request.testId, request.taskId, request.given)
    return { at: 'answered', ...done }
  }

  const grading = await judge(
    task,
    request.given,
    request.harnessId,
    request.model,
    onMoment,
    request.submission ?? [],
  )

  if (grading.judgement.at === 'trouble') {
    // Not a fail. A run that ran out of budget has not judged anything, and recording that
    // as a wrong answer is the worst thing this app could do to somebody (PLAN 3.15).
    return { at: 'trouble', message: grading.judgement.message }
  }

  const verdict = grading.judgement.verdict
  const outcome: Outcome = { outcome: verdict.outcome, explanation: verdict.reason }
  const done = recordTask(
    request.slug,
    course,
    progress(),
    request.testId,
    request.taskId,
    outcome,
    JSON.stringify(verdict),
  )
  return { at: 'answered', ...done, verdict }
}

// ---------------------------------------------------------------- checking, in a sitting

/**
 * What comes back from pressing Check.
 *
 * There is no outcome in it. The run happened, the Attempt is recorded, and the result is
 * held until every question in the Test has been checked (docs/adr/0022). The window asking
 * the questions is told only that this one is now checked, which is the same discipline
 * that keeps an answer out of the renderer: what it does not hold, it cannot show early.
 */
export type Checked =
  | { at: 'checked'; sitting: SittingView }
  | { at: 'trouble'; message: string }

export async function check(request: Judged, onMoment: (moment: Moment) => void): Promise<Checked> {
  const course = loadCourse(request.slug)
  const task = taskIn(course, request.testId, request.taskId, request.slug)

  if (task.check === 'deterministic') {
    const outcome = answerDeterministic(task, request.given)
    return {
      at: 'checked',
      sitting: checkedTask(request.slug, course, progress(), request.testId, request.taskId, request.given, {
        outcome,
      }),
    }
  }

  const grading = await judge(
    task,
    request.given,
    request.harnessId,
    request.model,
    onMoment,
    request.submission ?? [],
    earlierAnswers(request.slug, course, progress(), request.testId, request.taskId),
  )

  // Trouble is not a fail, so nothing is recorded and the question stays unchecked. In a
  // sitting that matters more, not less: an unchecked question is one the reveal waits for.
  if (grading.judgement.at === 'trouble') return { at: 'trouble', message: grading.judgement.message }

  const verdict = grading.judgement.verdict
  return {
    at: 'checked',
    sitting: checkedTask(request.slug, course, progress(), request.testId, request.taskId, request.given, {
      outcome: { outcome: verdict.outcome, explanation: verdict.reason },
      verdict,
    }),
  }
}
