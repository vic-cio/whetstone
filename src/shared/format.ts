import { z } from 'zod'

/**
 * The Course format.
 *
 * Two rules in here are load-bearing and are the reason this file exists as its own
 * module rather than living inside the parser:
 *
 *  - Depth and Check are independent axes (docs/adr/0002). Any pairing is legal, and
 *    nothing in these schemas may correlate them. `check` alone decides whether a Task
 *    works offline, whether it costs money, and which marker the UI shows.
 *  - A Lesson holds no recorded Tasks (docs/adr/0013). Recorded Tasks live in a Test.
 *    A Lesson's `try` blocks are a different thing and never become an Attempt.
 */

/** The fixed five-point scale. A Course's Ladder is any subset of it. */
export const DEPTHS = ['recall', 'apply', 'construct', 'transfer', 'project'] as const
export type Depth = (typeof DEPTHS)[number]

/** How an answer is judged. This field alone decides offline, cost, and the marker. */
export const CHECKS = ['deterministic', 'model', 'rubric'] as const
export type Check = (typeof CHECKS)[number]

const id = (prefix: string) =>
  z
    .string()
    .regex(
      new RegExp(`^${prefix}-[a-z0-9]+(?:-[a-z0-9]+)*$`),
      `must be a lowercase id beginning "${prefix}-"`,
    )

// ---------------------------------------------------------------- tasks

/** Deterministic kinds. Every one of these is answered by the host, offline and free. */
const multipleChoice = z.object({
  kind: z.literal('multiple-choice'),
  options: z.array(z.string()).min(2),
  answer: z.array(z.number().int().nonnegative()).min(1),
})

/** The Duolingo check: any of a set of accepted forms, compared after normalising. */
const acceptedAnswers = z.object({
  kind: z.literal('accepted-answers'),
  accepted: z.array(z.string()).min(1),
})

const numeric = z.object({
  kind: z.literal('numeric'),
  answer: z.number(),
  tolerance: z.number().nonnegative().default(0),
  units: z.string().optional(),
})

const ordering = z.object({
  kind: z.literal('ordering'),
  items: z.array(z.string()).min(2),
  answer: z.array(z.number().int().nonnegative()).min(2),
})

/** The coding-course check: a Mini-app runs the Constructor's assertions. */
const assertionsPass = z.object({
  kind: z.literal('assertions-pass'),
  app: z.string().min(1),
  assertions: z.array(z.string()).min(1),
})

/** A Mini-app emits a result; the host compares it. The Mini-app never grades itself. */
const appResult = z.object({
  kind: z.literal('app-result'),
  app: z.string().min(1),
  answer: z.unknown(),
})

const deterministicKind = z.discriminatedUnion('kind', [
  multipleChoice,
  acceptedAnswers,
  numeric,
  ordering,
  assertionsPass,
  appResult,
])

const modelKind = z.object({
  kind: z.literal('short-answer'),
  answerGuide: z.string().min(1),
})

const rubricCriterion = z.object({
  id: id('cri'),
  criterion: z.string().min(1),
})

const rubricKind = z.object({
  kind: z.literal('submission'),
  accepts: z.array(z.string()).min(1),
  rubric: z.array(rubricCriterion).min(1),
})

const taskCommon = z.object({
  id: id('tsk'),
  objective: id('obj'),
  /**
   * Depth and check are read independently. There is deliberately no refinement tying
   * one to the other; `depth: 'transfer'` with `check: 'deterministic'` is a good Task.
   */
  depth: z.enum(DEPTHS),
  prompt: z.string().min(1),
  explanation: z.string().optional(),
})

export const TaskSchema = z.union([
  taskCommon.extend({ check: z.literal('deterministic') }).and(deterministicKind),
  taskCommon.extend({ check: z.literal('model') }).and(modelKind),
  taskCommon.extend({ check: z.literal('rubric') }).and(rubricKind),
])
export type Task = z.infer<typeof TaskSchema>

/** True when the host can answer this Task alone, with no network and no cost. */
export function isOffline(task: Pick<Task, 'check'>): boolean {
  return task.check === 'deterministic'
}

// ---------------------------------------------------------------- pages

export const TestSchema = z.object({
  id: id('tst'),
  title: z.string().min(1),
  module: id('mod'),
  tasks: z.array(id('tsk')).min(1),
})
export type Test = z.infer<typeof TestSchema>

export const LessonFrontmatterSchema = z.object({
  id: id('les'),
  title: z.string().min(1),
  module: id('mod'),
  objectives: z.array(id('obj')).min(1),
  minutes: z.number().int().positive().optional(),
})

export interface Lesson {
  id: string
  title: string
  module: string
  objectives: string[]
  minutes?: number
  body: string
  /** Ids of `:::try{}` blocks. These are never Tasks and never produce an Attempt. */
  tries: string[]
  /** Ids of `:::app{}` blocks, each resolving to a folder under apps/. */
  apps: string[]
  /** Ids of `:::resource{}` blocks. */
  resources: string[]
}

// ---------------------------------------------------------------- manifest

export const PAGE_TYPES = ['lesson', 'test'] as const
export type PageType = (typeof PAGE_TYPES)[number]

const PageSchema = z.object({
  type: z.enum(PAGE_TYPES),
  id: z.string().min(1),
})
export type Page = z.infer<typeof PageSchema>

const ModuleSchema = z.object({
  id: id('mod'),
  title: z.string().min(1),
  pages: z.array(PageSchema).min(1),
})
export type Module = z.infer<typeof ModuleSchema>

const ObjectiveSchema = z.object({
  id: id('obj'),
  title: z.string().min(1),
})
export type Objective = z.infer<typeof ObjectiveSchema>

export const ManifestSchema = z.object({
  formatVersion: z.literal(1),
  id: z.string().min(1),
  title: z.string().min(1),
  subject: z.string().min(1),
  summary: z.string().min(1),
  toolkitVersion: z.string().min(1),
  objectives: z.array(ObjectiveSchema).min(1),
  /** The Rungs this Course actually uses, drawn from the fixed scale. */
  ladder: z.array(z.enum(DEPTHS)).min(1),
  modules: z.array(ModuleSchema).min(1),
  suggestedOrder: z.array(z.string()).default([]),
  builtBy: z
    .object({
      harness: z.string(),
      model: z.string(),
      at: z.string(),
    })
    .optional(),
})
export type Manifest = z.infer<typeof ManifestSchema>

export const ResourceSchema = z.object({
  id: id('res'),
  url: z.string().url(),
  title: z.string().min(1),
  type: z.string().min(1),
  why: z.string().min(1),
})
export type Resource = z.infer<typeof ResourceSchema>

// ---------------------------------------------------------------- the whole course

export interface Course extends Manifest {
  /** Absolute path to the Course folder. */
  path: string
  lessons: Record<string, Lesson>
  tests: Record<string, Test>
  tasks: Record<string, Task>
  resources: Record<string, Resource>
  /** Mini-app ids found under apps/. */
  apps: string[]
}

/** One thing wrong with a Course folder, named precisely enough to go and fix it. */
export interface CourseError {
  /** Path relative to the Course folder. */
  file: string
  /** Dotted path to the offending field, when the problem is a field. */
  field?: string
  message: string
}

export type ParseResult = { ok: true; course: Course } | { ok: false; errors: CourseError[] }
