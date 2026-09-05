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
} from '../shared/format'
import type { Outcome } from '../shared/grade'
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
}

export function courseView(slug: string, course: Course, progress: Progress): CourseView {
  const ticks = progress.ticks(slug)

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
  const test = course.tests[testId]
  if (!test) throw new Error(`no test "${testId}" in course "${slug}"`)
  if (!test.tasks.includes(taskId)) throw new Error(`task "${taskId}" is not in test "${testId}"`)
  const task = course.tasks[taskId]
  if (!task) throw new Error(`no task "${taskId}" in course "${slug}"`)

  const outcome = answerDeterministic(task, given)
  progress.recordAttempt({
    courseSlug: slug,
    taskId,
    objectiveId: task.objective,
    depth: task.depth,
    check: task.check,
    outcome: outcome.outcome,
  })

  const attempted = progress.attemptedTaskIds(slug)
  if (test.tasks.every((id) => attempted.has(id))) progress.earnTick(slug, testId, 'test')

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
