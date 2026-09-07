import { randomUUID } from 'node:crypto'

import { missed, strugglingWith } from '../shared/again'
import { answerDeterministic } from '../shared/grade'
import { publicTask, publicTry } from '../shared/format'
import type {
  Check,
  Course,
  Depth,
  LessonBlock,
  PageType,
  PublicTask,
  PublicTry,
  Resource,
  Task,
  Test,
} from '../shared/format'
import type { Outcome } from '../shared/grade'
import type { Verdict } from '../shared/verdict'
import type { Progress } from './progress'

/**
 * Study, with the answers kept on this side of the bridge.
 *
 * Every rule about when a Page ticks lives here rather than in the renderer, so the
 * progress model is one testable thing rather than a habit spread across components.
 */

/** A Lesson block as the renderer sees it: identical, except a Try loses its answer. */
export type PublicBlock =
  | Exclude<LessonBlock, { block: 'try' }>
  | { block: 'try'; question: PublicTry }

export interface PageView {
  type: PageType
  id: string
  title: string
  ticked: boolean
  /** Reading time, on a Lesson that declares one. */
  minutes?: number
  /** True when a Lesson holds a Try or a Mini-app, so the row can say "has an activity". */
  hasActivity?: boolean
  /** On a Test: how many Tasks, and the Depths and Checks they cover. */
  taskCount?: number
  depths?: Depth[]
  checks?: Check[]
}

export interface ModuleView {
  id: string
  title: string
  pages: PageView[]
}

export interface LessonView {
  id: string
  title: string
  module: string
  minutes?: number
  blocks: PublicBlock[]
}

export interface TestView {
  id: string
  title: string
  module: string
  /** What the Constructor thinks the sitting takes. Nothing counts down (PLAN 3.4). */
  minutes?: number
  tasks: PublicTask[]
}

export interface CourseView {
  slug: string
  id: string
  title: string
  subject: string
  summary: string
  ladder: Depth[]
  modules: ModuleView[]
  pageCount: number
  pagesDone: number
  lessons: Record<string, LessonView>
  tests: Record<string, TestView>
  resources: Record<string, Resource>
  /**
   * What the reader got wrong and has not since got right. A list, reachable from the
   * Course page and nowhere else. No count on the home screen and no due date (PLAN 3.15).
   */
  missed: MissedView[]
  /** Objectives with three fails and no pass since. An offer, never an intervention. */
  struggling: { id: string; title: string }[]
}

export interface MissedView {
  taskId: string
  /** The Test it lives in, so the list can send the reader to the question itself. */
  testId: string
  title: string
  prompt: string
}

export function courseView(slug: string, course: Course, progress: Progress): CourseView {
  const ticks = progress.ticks(slug)
  const seen = progress.attemptsFor(slug)

  const testOf = new Map<string, Test>()
  for (const test of Object.values(course.tests)) for (const id of test.tasks) testOf.set(id, test)

  const missedNow: MissedView[] = []
  for (const taskId of missed(seen)) {
    const task = course.tasks[taskId]
    const test = testOf.get(taskId)
    if (task && test) missedNow.push({ taskId, testId: test.id, title: test.title, prompt: task.prompt })
  }

  const objectives = new Map(course.objectives.map((objective) => [objective.id, objective.title]))
  const struggling = strugglingWith(course, seen).map((id) => ({ id, title: objectives.get(id) ?? id }))

  const modules: ModuleView[] = course.modules.map((module) => ({
    id: module.id,
    title: module.title,
    pages: module.pages.map((page): PageView => {
      const ticked = ticks[page.id]?.ticked === true
      if (page.type === 'lesson') {
        const lesson = course.lessons[page.id]
        return {
          type: 'lesson',
          id: page.id,
          title: lesson?.title ?? page.id,
          ticked,
          ...(lesson?.minutes === undefined ? {} : { minutes: lesson.minutes }),
          ...(lesson && (lesson.tries.length > 0 || lesson.apps.length > 0)
            ? { hasActivity: true }
            : {}),
        }
      }
      const test = course.tests[page.id]
      const tasks = (test?.tasks ?? []).flatMap((id) => {
        const task = course.tasks[id]
        return task ? [task] : []
      })
      return {
        type: 'test',
        id: page.id,
        title: test?.title ?? page.id,
        ticked,
        taskCount: tasks.length,
        depths: unique(tasks.map((task) => task.depth)),
        checks: unique(tasks.map((task) => task.check)),
      }
    }),
  }))

  const lessons: Record<string, LessonView> = {}
  for (const [id, lesson] of Object.entries(course.lessons)) {
    lessons[id] = {
      id,
      title: lesson.title,
      module: lesson.module,
      ...(lesson.minutes === undefined ? {} : { minutes: lesson.minutes }),
      blocks: lesson.blocks.map((block) =>
        block.block === 'try' ? { block: 'try', question: publicTry(block.question) } : block,
      ),
    }
  }

  const tests: Record<string, TestView> = {}
  for (const [id, test] of Object.entries(course.tests)) {
    tests[id] = {
      id,
      title: test.title,
      module: test.module,
      ...(test.minutes === undefined ? {} : { minutes: test.minutes }),
      tasks: test.tasks.flatMap((taskId) => {
        const task = course.tasks[taskId]
        return task ? [publicTask(task)] : []
      }),
    }
  }

  return {
    slug,
    id: course.id,
    title: course.title,
    subject: course.subject,
    summary: course.summary,
    ladder: course.ladder,
    modules,
    pageCount: modules.reduce((total, module) => total + module.pages.length, 0),
    pagesDone: progress.pagesDone(slug),
    lessons,
    missed: missedNow,
    struggling,
    tests,
    resources: course.resources,
  }
}

/** Depth order is the fixed scale, not the order the Tasks happen to appear in. */
const ORDER: Record<string, number> = { recall: 0, apply: 1, construct: 2, transfer: 3, project: 4 }
function unique<T extends string>(values: T[]): T[] {
  return [...new Set(values)].sort((a, b) => (ORDER[a] ?? 99) - (ORDER[b] ?? 99))
}

/**
 * Answer a Task inside a Test. The Attempt is always recorded, whichever way it went,
 * and the Test ticks once every Task in it has been attempted at least once.
 *
 * Attempting them all is the whole condition. Getting them all wrong still ticks the
 * page, because the tick counts what the user has been through and never scores it.
 */
export function answerTask(
  slug: string,
  course: Course,
  progress: Progress,
  testId: string,
  taskId: string,
  given: unknown,
): { outcome: Outcome; ticked: boolean } {
  const task = taskIn(course, testId, taskId, slug)
  return recordTask(slug, course, progress, testId, taskId, answerDeterministic(task, given))
}

/** The Task, checked against the Test that claims it. Both roles ask for it the same way. */
export function taskIn(course: Course, testId: string, taskId: string, slug: string): Task {
  const test = course.tests[testId]
  if (!test) throw new Error(`no test "${testId}" in course "${slug}"`)
  if (!test.tasks.includes(taskId)) throw new Error(`task "${taskId}" is not in test "${testId}"`)
  const task = course.tasks[taskId]
  if (!task) throw new Error(`no task "${taskId}" in course "${slug}"`)
  return task
}

/**
 * Write down what happened.
 *
 * Separate from working out what happened, because a `model` or `rubric` Task is judged
 * somewhere else and asynchronously, and both paths must record an Attempt the same way.
 * Nothing reaches here without an outcome: a Grader that could not judge produces trouble,
 * and trouble is not an outcome (PLAN 3.15).
 */
export function recordTask(
  slug: string,
  course: Course,
  progress: Progress,
  testId: string,
  taskId: string,
  outcome: Outcome,
  verdictJson?: string,
): { outcome: Outcome; ticked: boolean } {
  const test = course.tests[testId]
  const task = taskIn(course, testId, taskId, slug)

  progress.recordAttempt({
    courseSlug: slug,
    taskId,
    objectiveId: task.objective,
    depth: task.depth,
    check: task.check,
    outcome: outcome.outcome,
    ...(verdictJson === undefined ? {} : { verdictJson }),
  })

  const attempted = progress.attemptedTaskIds(slug)
  if (test && test.tasks.every((id) => attempted.has(id))) progress.earnTick(slug, testId, 'test')

  return { outcome, ticked: progress.ticks(slug)[testId]?.ticked === true }
}

/**
 * Answer a Try inside a Lesson. Nothing is recorded and nothing ticks: a Try is a
 * question the Lesson asks, not a measurement (docs/adr/0013).
 */
export function answerTry(course: Course, lessonId: string, tryId: string, given: unknown): Outcome {
  const lesson = course.lessons[lessonId]
  if (!lesson) throw new Error(`no lesson "${lessonId}"`)
  const block = lesson.blocks.find((item) => item.block === 'try' && item.question.id === tryId)
  if (!block || block.block !== 'try') throw new Error(`no try "${tryId}" in lesson "${lessonId}"`)
  return answerDeterministic(block.question, given)
}

/** The user reached the end of a Lesson. That earns the tick, unless they set it by hand. */
export function reachedEndOfLesson(slug: string, course: Course, progress: Progress, lessonId: string): void {
  if (!course.lessons[lessonId]) throw new Error(`no lesson "${lessonId}"`)
  progress.earnTick(slug, lessonId, 'lesson')
}

// ---------------------------------------------------------------- a test is a sitting

/**
 * A Test is a sitting (docs/adr/0022).
 *
 * The reader answers a question and presses Check. The run happens then, and the result is
 * held. When the last question in the Test is checked, every result is revealed at once.
 * There is no mark and no number: the reveal is the list of questions with a tick or a
 * cross beside each.
 *
 * Nothing here stores whether a sitting is open. A sitting is revealed when every Task in
 * the Test carries a checked row, which is derived from the rows themselves, because two
 * records of one fact drift.
 */

/** What was checked, kept whole so the feedback screen can draw it later. */
export interface CheckResult {
  outcome: Outcome
  verdict?: Verdict
}

export interface RevealedView {
  passed: boolean
  /** What the reader gave. Their own answer is theirs to see again. */
  given: unknown
  explanation?: string
  assertions?: { name: string; passed: boolean }[]
  verdict?: Verdict
}

export interface SittingView {
  id: string
  /** What is written down so far, by Task. A closed window loses none of it (PLAN 3.4). */
  answers: Record<string, { given: unknown; checked: boolean }>
  revealed: boolean
  /**
   * Present only once every question is checked. Before that the window holding the
   * questions does not hold a single result, which is the same discipline that keeps an
   * answer out of the renderer.
   */
  results?: Record<string, RevealedView>
}

function testIn(course: Course, testId: string, slug: string): Test {
  const test = course.tests[testId]
  if (!test) throw new Error(`no test "${testId}" in course "${slug}"`)
  return test
}

/**
 * The first sitting's id, before there is a row to read one from.
 *
 * A fixed string rather than a fresh one each time this is called. A minted id would change
 * between the read that opened the Test and the write that held the first answer, and two
 * answers to the same Test would land in two different sittings, neither of them complete.
 * Every later sitting gets a real id, because a retake has rows to be told apart from.
 */
const FIRST = 'first'

/** The sitting the reader is in, drawn from the held rows. Starts a first one if needed. */
export function sittingFor(slug: string, course: Course, progress: Progress, testId: string): SittingView {
  const test = testIn(course, testId, slug)
  const id = progress.currentSitting(slug, testId) ?? FIRST
  const rows = progress.held(slug, testId, id)

  const answers: Record<string, { given: unknown; checked: boolean }> = {}
  for (const row of rows) {
    if (test.tasks.includes(row.taskId)) answers[row.taskId] = { given: row.given, checked: row.checked }
  }

  const revealed = test.tasks.every((taskId) => answers[taskId]?.checked === true)
  if (!revealed) return { id, answers, revealed }

  const results: Record<string, RevealedView> = {}
  for (const row of rows) {
    const result = row.result as CheckResult | undefined
    if (!result || !test.tasks.includes(row.taskId)) continue
    results[row.taskId] = {
      passed: result.outcome.outcome === 'pass',
      given: row.given,
      ...(result.outcome.explanation === undefined ? {} : { explanation: result.outcome.explanation }),
      ...(result.outcome.assertions === undefined ? {} : { assertions: result.outcome.assertions }),
      ...(result.verdict === undefined ? {} : { verdict: result.verdict }),
    }
  }
  return { id, answers, revealed, results }
}

/**
 * Write an answer down without checking it.
 *
 * Called as the reader works, because a Test with a project-depth submission can take a
 * day, and losing that to a closed lid is the kind of failure that stops somebody trusting
 * an app. An answer already checked is never overwritten.
 */
export function holdAnswer(
  slug: string,
  course: Course,
  progress: Progress,
  testId: string,
  taskId: string,
  given: unknown,
): SittingView {
  taskIn(course, testId, taskId, slug)
  const sitting = sittingFor(slug, course, progress, testId)
  if (sitting.answers[taskId]?.checked !== true) {
    progress.hold({ courseSlug: slug, testId, taskId, sittingId: sitting.id, given, checked: false })
  }
  return sittingFor(slug, course, progress, testId)
}

/**
 * Record a checked question, and hold its result.
 *
 * The Attempt is written now, because the run happened now. What is held back is only the
 * telling: nothing about this reaches the reader until the last question is checked.
 */
export function checkedTask(
  slug: string,
  course: Course,
  progress: Progress,
  testId: string,
  taskId: string,
  given: unknown,
  result: CheckResult,
): SittingView {
  const task = taskIn(course, testId, taskId, slug)
  const test = testIn(course, testId, slug)
  const sitting = sittingFor(slug, course, progress, testId)

  progress.recordAttempt({
    courseSlug: slug,
    taskId,
    objectiveId: task.objective,
    depth: task.depth,
    check: task.check,
    outcome: result.outcome.outcome,
    sittingId: sitting.id,
    ...(result.verdict === undefined ? {} : { verdictJson: JSON.stringify(result.verdict) }),
  })
  progress.hold({ courseSlug: slug, testId, taskId, sittingId: sitting.id, given, checked: true, result })

  const attempted = progress.attemptedTaskIds(slug)
  if (test.tasks.every((id) => attempted.has(id))) progress.earnTick(slug, testId, 'test')

  return sittingFor(slug, course, progress, testId)
}

/**
 * Start a fresh sitting, with nothing shown.
 *
 * The old rows stay where they are and so do the Attempts they made. Both sittings are in
 * the record, and the missed list reads the latest, because a retake is another go rather
 * than a correction of the first one.
 */
export function retakeTest(slug: string, course: Course, progress: Progress, testId: string): SittingView {
  const test = testIn(course, testId, slug)
  const id = randomUUID()
  // A sitting exists once it has a row, so the first Task carries an empty one. Without it
  // `currentSitting` would still hand back the sitting just finished.
  const first = test.tasks[0]
  if (first !== undefined) {
    progress.hold({ courseSlug: slug, testId, taskId: first, sittingId: id, given: null, checked: false })
  }
  return sittingFor(slug, course, progress, testId)
}

/**
 * The questions this one builds on, with the reader's own answers to them.
 *
 * The one exception to the Grader's amnesia (PLAN 3.15). A Task that `follows` another is
 * marked on what the reader themselves put, not on what was correct, so a wrong part a
 * followed by a right method in part b passes part b. The correct answers are not here and
 * must never be: this is error carried forward, not a second chance at part a.
 */
export function earlierAnswers(
  slug: string,
  course: Course,
  progress: Progress,
  testId: string,
  taskId: string,
): { id: string; prompt: string; given: unknown }[] {
  const follows = course.tasks[taskId]?.follows ?? []
  if (follows.length === 0) return []
  const sitting = sittingFor(slug, course, progress, testId)
  return follows.flatMap((earlier) => {
    const task = course.tasks[earlier]
    const held = sitting.answers[earlier]
    if (!task || !held) return []
    return [{ id: earlier, prompt: task.prompt, given: held.given }]
  })
}

// ---------------------------------------------------------------- taking things away

/**
 * The Test a removal would leave with nothing in it.
 *
 * A Test page vanishing from a Course somebody is part way through leaves a hole in the
 * contents, so a removal that would empty one is not allowed: the Constructor writes a
 * replacement question instead. This is what the caller asks before it picks which work to
 * send (PLAN 3.15, phase 6).
 */
export function emptiesATest(course: Course, taskId: string): string | undefined {
  for (const test of Object.values(course.tests)) {
    if (test.tasks.length === 1 && test.tasks[0] === taskId) return test.id
  }
  return undefined
}

/** Every Task reachable from one Module's Tests. */
export function tasksUnder(course: Course, moduleId: string): string[] {
  const module = course.modules.find((entry) => entry.id === moduleId)
  if (!module) return []
  const testIds = module.pages.filter((page) => page.type === 'test').map((page) => page.id)
  return testIds.flatMap((id) => course.tests[id]?.tasks ?? [])
}

/**
 * Void every Attempt under a Module.
 *
 * What removing a Module does to the record. An Attempt against a question that no longer
 * exists is a mark for something nobody can look at, so it is voided rather than left
 * dangling. Voiding rewrites an outcome and never adds a row, so the missed list and the
 * struggling count both stop seeing it (PLAN 3.4).
 */
export function voidUnder(slug: string, course: Course, progress: Progress, moduleId: string): string[] {
  const tasks = tasksUnder(course, moduleId)
  for (const taskId of tasks) progress.voidAttempts(slug, taskId)
  return tasks
}
