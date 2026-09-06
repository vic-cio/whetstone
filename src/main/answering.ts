import { judge } from './grader'
import { loadCourse, progress } from './courseStore'
import { answerTask, recordTask, taskIn } from './study'
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
