import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import matter from 'gray-matter'
import type { ZodType } from 'zod'

import {
  ManifestSchema,
  TaskSchema,
  TestSchema,
  LessonFrontmatterSchema,
  ResourceSchema,
} from './format'
import type { Course, CourseError, Lesson, ParseResult, Resource, Task, Test } from './format'

/**
 * Read a Course folder into memory, or say precisely what is wrong with it.
 *
 * This is the real interface between an arbitrary agent's output and the reader
 * (docs/adr/0004, docs/adr/0009), so it is deliberately strict and never throws:
 * a malformed Course produces errors naming the file and the field, not a crash.
 */
export function parseCourse(dir: string): ParseResult {
  const errors: CourseError[] = []
  const fail = (file: string, message: string, field?: string): void => {
    errors.push(field === undefined ? { file, message } : { file, field, message })
  }

  // ---------------------------------------------------------------- manifest

  const manifest = readJson(dir, 'course.json', ManifestSchema, fail)
  if (!manifest) return { ok: false, errors }

  // ---------------------------------------------------------------- tasks, tests, lessons

  const tasks: Record<string, Task> = {}
  for (const file of jsonFilesIn(dir, 'tasks')) {
    const task = readJson(dir, file, TaskSchema, fail)
    if (!task) continue
    if (tasks[task.id]) fail(file, `duplicate task id "${task.id}"`, 'id')
    else tasks[task.id] = task
  }

  const tests: Record<string, Test> = {}
  for (const file of jsonFilesIn(dir, 'tests')) {
    const test = readJson(dir, file, TestSchema, fail)
    if (!test) continue
    if (tests[test.id]) fail(file, `duplicate test id "${test.id}"`, 'id')
    else tests[test.id] = test
  }

  const lessons: Record<string, Lesson> = {}
  for (const file of filesIn(dir, 'lessons', '.md')) {
    const lesson = readLesson(dir, file, fail)
    if (!lesson) continue
    if (lessons[lesson.id]) fail(file, `duplicate lesson id "${lesson.id}"`, 'id')
    else lessons[lesson.id] = lesson
  }

  const resources: Record<string, Resource> = {}
  if (existsSync(join(dir, 'resources.json'))) {
    const list = readJson(dir, 'resources.json', ResourceSchema.array(), fail)
    for (const resource of list ?? []) resources[resource.id] = resource
  }

  const apps = existsSync(join(dir, 'apps'))
    ? readdirSync(join(dir, 'apps'), { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
    : []

  // ---------------------------------------------------------------- cross-references

  const objectiveIds = new Set(manifest.objectives.map((objective) => objective.id))
  const ladder = new Set(manifest.ladder)

  for (const [id, task] of Object.entries(tasks)) {
    const file = `tasks/${id}.json`
    if (!objectiveIds.has(task.objective)) {
      fail(file, `names an objective the course does not declare: "${task.objective}"`, 'objective')
    }
    // The Ladder is per-Course and drawn from the fixed scale. A Task at a Depth the
    // Course does not use would never be reachable, so it is an error rather than a hint.
    if (!ladder.has(task.depth)) {
      fail(file, `depth "${task.depth}" is not in this course's ladder [${manifest.ladder.join(', ')}]`, 'depth')
    }
    if ('app' in task && typeof task.app === 'string' && !apps.includes(task.app)) {
      fail(file, `refers to a mini-app that does not exist: "${task.app}"`, 'app')
    }
  }

  for (const [id, test] of Object.entries(tests)) {
    const file = `tests/${id}.json`
    for (const taskId of test.tasks) {
      if (!tasks[taskId]) fail(file, `names a task that does not exist: "${taskId}"`, 'tasks')
    }
  }

  // Every recorded Task must be reachable from a Test, or it can never be attempted.
  const reachable = new Set(Object.values(tests).flatMap((test) => test.tasks))
  for (const id of Object.keys(tasks)) {
    if (!reachable.has(id)) fail(`tasks/${id}.json`, 'is not named by any test, so it can never be reached', 'id')
  }

  for (const [id, lesson] of Object.entries(lessons)) {
    const file = `lessons/${id}.md`
    for (const objective of lesson.objectives) {
      if (!objectiveIds.has(objective)) {
        fail(file, `names an objective the course does not declare: "${objective}"`, 'objectives')
      }
    }
    for (const app of lesson.apps) {
      if (!apps.includes(app)) fail(file, `embeds a mini-app that does not exist: "${app}"`, 'app')
    }
    for (const resource of lesson.resources) {
      if (!resources[resource]) fail(file, `cites a resource that does not exist: "${resource}"`, 'resource')
    }
    // A `try` is not a Task and must not be mistaken for one (docs/adr/0013).
    for (const tryId of lesson.tries) {
      if (tasks[tryId]) {
        fail(file, `try block "${tryId}" collides with a recorded task id; a lesson holds no recorded tasks`, 'try')
      }
    }
  }

  // ---------------------------------------------------------------- pages

  const moduleIds = new Set(manifest.modules.map((module) => module.id))
  const seenPages = new Set<string>()
  for (const [index, module] of manifest.modules.entries()) {
    for (const [pageIndex, page] of module.pages.entries()) {
      const field = `modules[${index}].pages[${pageIndex}]`
      if (seenPages.has(page.id)) fail('course.json', `page "${page.id}" appears more than once`, field)
      seenPages.add(page.id)

      const found = page.type === 'lesson' ? lessons[page.id] : tests[page.id]
      if (!found) {
        fail('course.json', `${page.type} page "${page.id}" has no file in ${page.type}s/`, field)
        continue
      }
      if (found.module !== module.id) {
        fail(
          `${page.type}s/${page.id}${page.type === 'lesson' ? '.md' : '.json'}`,
          `says it belongs to "${found.module}" but is listed under "${module.id}"`,
          'module',
        )
      }
    }
  }

  for (const [id, lesson] of Object.entries(lessons)) {
    if (!moduleIds.has(lesson.module)) {
      fail(`lessons/${id}.md`, `names a module the course does not declare: "${lesson.module}"`, 'module')
    } else if (!seenPages.has(id)) {
      fail(`lessons/${id}.md`, 'is not listed as a page in any module, so it can never be opened', 'id')
    }
  }
  for (const [id, test] of Object.entries(tests)) {
    if (!moduleIds.has(test.module)) {
      fail(`tests/${id}.json`, `names a module the course does not declare: "${test.module}"`, 'module')
    } else if (!seenPages.has(id)) {
      fail(`tests/${id}.json`, 'is not listed as a page in any module, so it can never be opened', 'id')
    }
  }

  for (const [index, entry] of manifest.suggestedOrder.entries()) {
    if (!seenPages.has(entry)) {
      fail('course.json', `suggested order names "${entry}", which is not a page`, `suggestedOrder[${index}]`)
    }
  }

  if (errors.length > 0) return { ok: false, errors }
  return {
    ok: true,
    course: { ...manifest, path: dir, lessons, tests, tasks, resources, apps },
  }
}

// ---------------------------------------------------------------- helpers

type Fail = (file: string, message: string, field?: string) => void

function readJson<T>(dir: string, file: string, schema: ZodType<T>, fail: Fail): T | undefined {
  const path = join(dir, file)
  let raw: string
  try {
    raw = readFileSync(path, 'utf8')
  } catch {
    fail(file, 'is missing or could not be read')
    return undefined
  }

  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch (cause) {
    fail(file, `is not valid JSON: ${(cause as Error).message}`)
    return undefined
  }

  const parsed = schema.safeParse(value)
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const field = issue.path.join('.')
      fail(file, issue.message, field === '' ? undefined : field)
    }
    return undefined
  }
  return parsed.data
}

const DIRECTIVE = /^:::(\w+)\{([^}]*)\}/gm

function readLesson(dir: string, file: string, fail: Fail): Lesson | undefined {
  let raw: string
  try {
    raw = readFileSync(join(dir, file), 'utf8')
  } catch {
    fail(file, 'is missing or could not be read')
    return undefined
  }

  let front: Record<string, unknown>
  let body: string
  try {
    const parsed = matter(raw)
    front = parsed.data
    body = parsed.content
  } catch (cause) {
    fail(file, `has malformed frontmatter: ${(cause as Error).message}`)
    return undefined
  }

  const parsed = LessonFrontmatterSchema.safeParse(front)
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const field = issue.path.join('.')
      fail(file, issue.message, field === '' ? undefined : field)
    }
    return undefined
  }

  const tries: string[] = []
  const apps: string[] = []
  const resources: string[] = []
  for (const match of body.matchAll(DIRECTIVE)) {
    const [, name = '', attributes = ''] = match
    const id = /\bid=([^\s}]+)/.exec(attributes)?.[1]
    const src = /\bsrc=([^\s}]+)/.exec(attributes)?.[1]
    switch (name) {
      case 'try':
        if (id) tries.push(id)
        else fail(file, 'a try block has no id', 'try')
        break
      case 'app':
        if (id) apps.push(id)
        else fail(file, 'an app block has no id', 'app')
        break
      case 'resource':
        if (id) resources.push(id)
        else fail(file, 'a resource block has no id', 'resource')
        break
      case 'task':
        fail(file, 'holds a task block; recorded tasks belong to a test, not a lesson', 'task')
        break
      case 'callout':
      case 'diagram':
        if (name === 'diagram' && !src) fail(file, 'a diagram block has no src', 'diagram')
        break
      default:
        fail(file, `unknown block ":::${name}"; the block set is prose, callout, diagram, try, app, resource`, name)
    }
  }

  const { id, title, module, objectives, minutes } = parsed.data
  return {
    id,
    title,
    module,
    objectives,
    ...(minutes === undefined ? {} : { minutes }),
    body,
    tries,
    apps,
    resources,
  }
}

function filesIn(dir: string, sub: string, extension: string): string[] {
  const path = join(dir, sub)
  if (!existsSync(path) || !statSync(path).isDirectory()) return []
  return readdirSync(path)
    .filter((name) => name.endsWith(extension))
    .map((name) => relative(dir, join(path, name)))
    .sort()
}

const jsonFilesIn = (dir: string, sub: string): string[] => filesIn(dir, sub, '.json')
