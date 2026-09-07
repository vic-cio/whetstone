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

/** What a Project takes back. A closed set, unlike a Task's `accepts`, which is extensions. */
export const PROJECT_ACCEPTS = ['folder', 'links'] as const
export type ProjectAccepts = (typeof PROJECT_ACCEPTS)[number]

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
  /**
   * The Tasks this one builds on, inside the same Test. The run marking this Task is shown
   * those questions and the reader's own answers to them, not the correct ones, so a wrong
   * part a followed by a right method in part b passes part b. This is the rule a real
   * examiner uses, and without it one mistake costs two questions.
   *
   * The parser requires each id to sit earlier in the same Test, which is also what makes a
   * cycle impossible.
   */
  follows: z.array(id('tsk')).optional(),
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

/** The six kinds the host answers by itself. A Task and a Try both draw from this set. */
export type DeterministicKind = z.infer<typeof deterministicKind>

// ---------------------------------------------------------------- try

/**
 * A `try` block: a question inside a Lesson, answered in place and never recorded
 * (docs/adr/0013). It carries no objective and no depth, because nothing measures it,
 * and no `check`, because a Lesson never reaches a Grader. It is always deterministic.
 */
export const TrySchema = z
  .object({
    id: id('try'),
    prompt: z.string().min(1),
    explanation: z.string().optional(),
  })
  .and(deterministicKind)
export type Try = z.infer<typeof TrySchema>

/** Anything the host can answer on its own: a deterministic Task, or a Try. */
export type Answerable = Try | (Extract<Task, { check: 'deterministic' }> & DeterministicKind)

// ---------------------------------------------------------------- pages

export const TestSchema = z.object({
  id: id('tst'),
  title: z.string().min(1),
  module: id('mod'),
  tasks: z.array(id('tsk')).min(1),
  /** How long the Constructor thinks the sitting takes. Nothing counts down. */
  minutes: z.number().int().positive().optional(),
})
export type Test = z.infer<typeof TestSchema>

export const LessonFrontmatterSchema = z.object({
  id: id('les'),
  title: z.string().min(1),
  module: id('mod'),
  objectives: z.array(id('obj')).min(1),
  minutes: z.number().int().positive().optional(),
})

/**
 * The fixed block set a Lesson is built from. Prose is everything between the blocks.
 * The set is closed on purpose: a Course that could invent a block would stop looking
 * like the same product as every other Course.
 */
export type LessonBlock =
  | { block: 'prose'; markdown: string }
  | { block: 'callout'; kind: string; markdown: string }
  | { block: 'diagram'; src: string; alt: string }
  | { block: 'try'; question: Try }
  | { block: 'app'; id: string; height?: number }
  | { block: 'resource'; id: string }

export interface Lesson {
  id: string
  title: string
  module: string
  objectives: string[]
  minutes?: number
  body: string
  /** The Lesson in order, prose and blocks together. This is what the reader draws. */
  blocks: LessonBlock[]
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

/**
 * A Project: an open-ended assignment covering a theme or the whole Course.
 *
 * The reader does it outside the app with ordinary tools, then comes back and submits a
 * folder and a list of links. A Project is a top-level array in the manifest and not a
 * Page type, because a Page type reaches into the Module, the rail, the tick rules, the
 * next-page logic and the keyboard navigation, and a section below the last Module reaches
 * none of them.
 *
 * The criteria are written with the brief, so they exist before the reader starts and the
 * work is finishable.
 */
const ProjectSchema = z.object({
  id: id('prj'),
  title: z.string().min(1),
  /** The assignment, in prose. */
  brief: z.string().min(1),
  criteria: z.array(rubricCriterion).min(1),
  accepts: z.array(z.enum(PROJECT_ACCEPTS)).min(1),
})
export type Project = z.infer<typeof ProjectSchema>

/**
 * A tag the library filters on. Lowercase and hyphenated, because free text alone drifts
 * into `ml`, `machine-learning` and `ML`, and three spellings of one tag filter nothing.
 * The Constructor is shown the tags already in the library and told to reuse one that fits.
 */
const tag = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'a tag is lowercase and hyphenated, such as "signals"')

export const ManifestSchema = z.object({
  formatVersion: z.literal(1),
  id: z.string().min(1),
  title: z.string().min(1),
  subject: z.string().min(1),
  summary: z.string().min(1),
  toolkitVersion: z.string().min(1),
  /**
   * The Course's own library: files under `lib/` that the host inlines into every one of
   * its Mini-apps, in this order (docs/adr/0019). This is how a Course carries a feature
   * the toolkit does not have, without pasting it into each app and without the app
   * learning anything about the subject.
   */
  library: z.array(z.string().min(1)).default([]),
  objectives: z.array(ObjectiveSchema).min(1),
  /** The Rungs this Course actually uses, drawn from the fixed scale. */
  ladder: z.array(z.enum(DEPTHS)).min(1),
  /** What the library filters on. Free text, so that the next niche Course still fits. */
  tags: z.array(tag).default([]),
  /**
   * A short Course. This is a field and not a tag, because it changes behaviour rather than
   * describing the Course: a small Course carries no Projects.
   */
  small: z.boolean().default(false),
  projects: z.array(ProjectSchema).default([]),
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

// ---------------------------------------------------------------- what the renderer sees

/**
 * A Task with its answer removed.
 *
 * Answering happens in the main process, so an answer never crosses into the renderer and
 * a recorded Attempt cannot be bypassed by the page that asked the question. Everything
 * the user is meant to see survives: options, items, criteria, and the assertion names.
 */
export interface PublicTask {
  id: string
  objective: string
  depth: Depth
  check: Check
  kind: string
  prompt: string
  options?: string[]
  items?: string[]
  units?: string
  app?: string
  assertions?: string[]
  accepts?: string[]
  rubric?: { id: string; criterion: string }[]
}

/** A Try with its answer removed, for the same reason. */
export interface PublicTry {
  id: string
  kind: string
  prompt: string
  options?: string[]
  items?: string[]
  units?: string
  app?: string
  assertions?: string[]
}

const ASKED = ['options', 'items', 'units', 'app', 'assertions', 'accepts', 'rubric'] as const

function shown(source: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const key of ASKED) if (source[key] !== undefined) out[key] = source[key]
  return out
}

export function publicTask(task: Task): PublicTask {
  const source = task as unknown as Record<string, unknown>
  return {
    id: task.id,
    objective: task.objective,
    depth: task.depth,
    check: task.check,
    kind: (source['kind'] as string) ?? '',
    prompt: task.prompt,
    ...shown(source),
  }
}

export function publicTry(question: Try): PublicTry {
  const source = question as unknown as Record<string, unknown>
  return {
    id: question.id,
    kind: (source['kind'] as string) ?? '',
    prompt: question.prompt,
    ...shown(source),
  }
}
