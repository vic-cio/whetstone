import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { z } from 'zod'

import type { CourseError } from './format'

/**
 * Declared activities: the eight toolkit widgets as data, for the Constructor to author
 * instead of hand-writing a Mini-app's HTML and JavaScript.
 *
 * A bespoke code Mini-app (`apps/<id>/index.html`, written by hand) remains fully
 * supported for anything this schema cannot express. This is an alternative path for the
 * common case, not a replacement.
 *
 * Two bugs shipped in real Courses before this existed: a Task whose expected answer
 * equalled a widget's own untouched starting state (so pressing Answer without doing
 * anything passed), and an `assertions-pass` check that pattern-matched the raw text of
 * the reader's code instead of running it. Both are structurally impossible to declare
 * here: `crossCheckTaskAnswer` rejects the first at build time, and the editor's
 * assertions are a closed comparison DSL that never sees raw text, only a real evaluated
 * result, for the second.
 */

const activityId = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'must be a lowercase, hyphenated id, such as "act-order-the-steps"')

// ---------------------------------------------------------------- widget shapes

const stepsWidget = z.object({
  widget: z.literal('steps'),
  steps: z.array(z.object({ title: z.string().min(1), body: z.string().min(1) })).min(1),
})

const orderWidget = z.object({
  widget: z.literal('order'),
  label: z.string().min(1),
  /** The items, in their correct order. The widget displays them in this order too. */
  items: z.array(z.string().min(1)).min(2),
})

const sliderWidget = z.object({
  widget: z.literal('slider'),
  label: z.string().min(1),
  min: z.number(),
  max: z.number(),
  step: z.number().positive().optional(),
  start: z.number(),
})

const plotWidget = z.object({
  widget: z.literal('plot'),
  label: z.string().min(1),
})

/**
 * A closed comparison DSL, evaluated against the reader's real executed code — never
 * against the raw text of what they typed. `export` names a value or function the code
 * must define; when it is a function, `args` is how it is called before comparing.
 */
const editorCheck = z.discriminatedUnion('type', [
  z.object({ type: z.literal('equals'), value: z.unknown() }),
  z.object({ type: z.literal('range'), min: z.number(), max: z.number() }),
  z.object({ type: z.literal('matches'), pattern: z.string().min(1) }),
])

const editorAssertion = z.object({
  name: z.string().min(1),
  export: z.string().min(1),
  args: z.array(z.unknown()).default([]),
  check: editorCheck,
})

const editorWidget = z.object({
  widget: z.literal('editor'),
  label: z.string().min(1),
  start: z.string(),
  exports: z.array(z.string().min(1)).min(1),
  assertions: z.array(editorAssertion).min(1),
})

const piecesWidget = z.object({
  widget: z.literal('pieces'),
  bankLabel: z.string().min(1),
  pieces: z.array(z.object({ id: z.string().min(1), label: z.string().min(1) })).min(1),
  slots: z.array(z.object({ id: z.string().min(1), label: z.string().min(1) })).min(1),
})

const hotspotWidget = z.object({
  widget: z.literal('hotspot'),
  label: z.string().min(1),
  width: z.number().positive().optional(),
  height: z.number().positive().optional(),
  regions: z
    .array(z.object({ id: z.string().min(1), x: z.number(), y: z.number(), w: z.number(), h: z.number() }))
    .min(1),
})

/**
 * `Kit.sim` inherently needs code — a simulation is defined by its step and draw
 * functions, and no general-purpose data shape covers that honestly. `stepBody`/`drawBody`
 * are function bodies, run the same trusted way `Kit.editor` already runs the reader's
 * code (docs/adr/0016): declared, versioned, and reviewable, but not pretending to be pure
 * data. `start` still is pure data, and still goes through the initial-state invariant.
 */
const simWidget = z.object({
  widget: z.literal('sim'),
  label: z.string().min(1),
  start: z.unknown(),
  stepBody: z.string().min(1),
  drawBody: z.string().min(1),
})

const widgetUnion = z.discriminatedUnion('widget', [
  stepsWidget,
  orderWidget,
  sliderWidget,
  plotWidget,
  editorWidget,
  piecesWidget,
  hotspotWidget,
  simWidget,
])

export const DeclaredActivitySchema = z.object({ id: activityId }).and(widgetUnion)
export type DeclaredActivity = z.infer<typeof DeclaredActivitySchema>

// ---------------------------------------------------------------- deep equal

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (typeof a !== typeof b || a === null || b === null) return false
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false
    return a.every((value, index) => deepEqual(value, b[index]))
  }
  if (typeof a !== 'object') return false
  const left = a as Record<string, unknown>
  const right = b as Record<string, unknown>
  const keys = Object.keys(left)
  if (keys.length !== Object.keys(right).length) return false
  return keys.every((key) => Object.hasOwn(right, key) && deepEqual(left[key], right[key]))
}

// ---------------------------------------------------------------- initial state

/**
 * What the widget reports before the reader touches it — the value a `crossCheckTaskAnswer`
 * expected answer must never equal. `undefined` for a widget with no answerable value at
 * all (`steps`, `plot`) or one whose answer logic lives entirely inside the activity
 * itself rather than a Task's `answer` field (`editor`, `sim` — a sim's Task, if any,
 * compares a value the step function produces, not the sim's own resting state, so there
 * is nothing generic to cross-check against a Task here; its `start` is still checked
 * separately wherever it is used as a widget's own resting configuration).
 */
export function initialAnswer(activity: DeclaredActivity): unknown {
  switch (activity.widget) {
    case 'order':
      return activity.items.map((_, index) => index)
    case 'slider':
      return activity.start
    case 'pieces':
      return activity.pieces.map(() => null)
    case 'hotspot':
      return null
    case 'sim':
      return activity.start
    case 'steps':
    case 'plot':
    case 'editor':
      return undefined
  }
}

// ---------------------------------------------------------------- editor DSL evaluation

function evaluateExports(start: string, exportNames: string[]): Record<string, unknown> | { error: string } {
  const give = exportNames.map((name) => `${name}: typeof ${name} === "undefined" ? undefined : ${name}`)
  const body = `"use strict";\n${start}\n;return {${give.join(',')}};`
  try {
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    return new Function(body)() as Record<string, unknown>
  } catch (cause) {
    return { error: String((cause as Error)?.message ?? cause) }
  }
}

function runCheck(exportsObject: Record<string, unknown>, assertion: z.infer<typeof editorAssertion>): boolean {
  let value: unknown = exportsObject[assertion.export]
  if (typeof value === 'function') {
    try {
      value = (value as (...args: unknown[]) => unknown)(...assertion.args)
    } catch {
      return false
    }
  }
  const check = assertion.check
  if (check.type === 'equals') return deepEqual(value, check.value)
  if (check.type === 'range') return typeof value === 'number' && value >= check.min && value <= check.max
  return typeof value === 'string' && new RegExp(check.pattern).test(value)
}

// ---------------------------------------------------------------- validation

/**
 * The invariants a declared activity must satisfy on its own, without reference to any
 * Task. `crossCheckTaskAnswer`, below, is the one invariant that needs the Task too.
 */
export function activityErrors(activity: DeclaredActivity, file: string): CourseError[] {
  const errors: CourseError[] = []

  if (activity.widget === 'pieces') {
    if (activity.pieces.length !== activity.slots.length) {
      errors.push({
        file,
        field: 'slots',
        message: 'a declared pieces activity needs exactly as many pieces as slots, one for one',
      })
    }
  }

  if (activity.widget === 'editor') {
    const evaluated = evaluateExports(activity.start, activity.exports)
    if (!('error' in evaluated)) {
      const allAlreadyPass = activity.assertions.every((assertion) => runCheck(evaluated, assertion))
      if (allAlreadyPass) {
        errors.push({
          file,
          field: 'start',
          message: 'the starting code already satisfies every assertion, so pressing Run proves nothing',
        })
      }
    }
  }

  return errors
}

/**
 * The one invariant that needs the Task: an `app-result` Task's expected answer must not
 * equal the widget's own untouched starting state, or a reader who presses Answer without
 * doing anything would pass. No escape hatch — this is deliberately strict.
 */
export function crossCheckTaskAnswer(
  task: { kind: string; app?: string; answer?: unknown },
  activity: DeclaredActivity,
  file: string,
): CourseError | undefined {
  if (task.kind !== 'app-result') return undefined
  const initial = initialAnswer(activity)
  if (initial === undefined) return undefined
  if (!deepEqual(task.answer, initial)) return undefined
  return {
    file,
    field: 'answer',
    message: 'equals the widget\'s own untouched starting state, so answering without touching it would pass',
  }
}

// ---------------------------------------------------------------- compiling to a Mini-app

function jsonLit(value: unknown): string {
  return JSON.stringify(value)
}

function compileSteps(activity: Extract<DeclaredActivity, { widget: 'steps' }>): string {
  return [
    '<div id="app"></div>',
    '<script>',
    `Kit.steps({ mount: '#app', steps: ${jsonLit(activity.steps)} })`,
    'Kit.bridge.ready()',
    '</script>',
  ].join('\n')
}

function compileOrder(activity: Extract<DeclaredActivity, { widget: 'order' }>): string {
  return [
    '<div id="app"></div>',
    '<script>',
    `var widget = Kit.order({ mount: '#app', label: ${jsonLit(activity.label)}, items: ${jsonLit(activity.items)} })`,
    "Kit.bridge.action('Answer', function () { return widget.value().order })",
    'Kit.bridge.ready()',
    '</script>',
  ].join('\n')
}

function compileSlider(activity: Extract<DeclaredActivity, { widget: 'slider' }>): string {
  const config: Record<string, unknown> = {
    mount: '#app',
    label: activity.label,
    min: activity.min,
    max: activity.max,
    value: activity.start,
  }
  if (activity.step !== undefined) config.step = activity.step
  return [
    '<div id="app"></div>',
    '<script>',
    `var widget = Kit.slider(${jsonLit(config)})`,
    "Kit.bridge.action('Answer', function () { return widget.value() })",
    'Kit.bridge.ready()',
    '</script>',
  ].join('\n')
}

function compilePlot(activity: Extract<DeclaredActivity, { widget: 'plot' }>): string {
  return [
    '<div id="app"></div>',
    '<script>',
    `Kit.plot({ mount: '#app', label: ${jsonLit(activity.label)} })`,
    'Kit.bridge.ready()',
    '</script>',
  ].join('\n')
}

function compileEditor(activity: Extract<DeclaredActivity, { widget: 'editor' }>): string {
  const lines: string[] = [
    '<div id="app"></div>',
    '<script>',
    // One shared, mechanical runner. Every assertion routes through it, so there is never a
    // place for an assertion to compare against the raw text of what the reader typed.
    'function __dslRun(api, exportName, args, check) {',
    '  var value = api[exportName]',
    '  if (typeof value === "function") value = value.apply(null, args)',
    '  if (check.type === "equals") return JSON.stringify(value) === JSON.stringify(check.value)',
    '  if (check.type === "range") return typeof value === "number" && value >= check.min && value <= check.max',
    '  return typeof value === "string" && new RegExp(check.pattern).test(value)',
    '}',
  ]
  const assertionEntries = activity.assertions.map((assertion, index) => {
    const fnName = `__dslTest${index}`
    lines.push(
      `function ${fnName}(api) { return __dslRun(api, ${jsonLit(assertion.export)}, ${jsonLit(assertion.args)}, ${jsonLit(assertion.check)}) }`,
    )
    return `{ name: ${jsonLit(assertion.name)}, test: ${fnName} }`
  })
  lines.push(
    `var code = Kit.editor({ mount: '#app', label: ${jsonLit(activity.label)}, start: ${jsonLit(activity.start)}, exports: ${jsonLit(activity.exports)}, assertions: [${assertionEntries.join(', ')}] })`,
    "Kit.bridge.action('Check my code', function () { return { passed: code.run() } })",
    'Kit.bridge.ready()',
    '</script>',
  )
  return lines.join('\n')
}

function compilePieces(activity: Extract<DeclaredActivity, { widget: 'pieces' }>): string {
  return [
    '<div id="app"></div>',
    '<script>',
    `var widget = Kit.pieces({ mount: '#app', bankLabel: ${jsonLit(activity.bankLabel)}, pieces: ${jsonLit(activity.pieces)}, slots: ${jsonLit(activity.slots)} })`,
    "var send = Kit.bridge.action('Answer', function () { return widget.value() }, { empty: 'Place every piece first' })",
    'widget.onChange(function () { send.enable(widget.complete()) })',
    'send.enable(false)',
    'Kit.bridge.ready()',
    '</script>',
  ].join('\n')
}

function compileHotspot(activity: Extract<DeclaredActivity, { widget: 'hotspot' }>): string {
  const config: Record<string, unknown> = { mount: '#app', label: activity.label, regions: activity.regions }
  if (activity.width !== undefined) config.width = activity.width
  if (activity.height !== undefined) config.height = activity.height
  return [
    '<div id="app"></div>',
    '<script>',
    `var widget = Kit.hotspot(${jsonLit(config)})`,
    "Kit.bridge.action('Answer', function () { return widget.value() })",
    'Kit.bridge.ready()',
    '</script>',
  ].join('\n')
}

function compileSim(activity: Extract<DeclaredActivity, { widget: 'sim' }>): string {
  return [
    '<div id="app"></div>',
    '<script>',
    `var widget = Kit.sim({`,
    `  mount: '#app', label: ${jsonLit(activity.label)}, state: ${jsonLit(activity.start)},`,
    `  step: function (state) { ${activity.stepBody} },`,
    `  draw: function (ctx, state, size) { ${activity.drawBody} },`,
    `})`,
    "Kit.bridge.action('Answer', function () { return widget.state() })",
    'Kit.bridge.ready()',
    '</script>',
  ].join('\n')
}

/** The declared activity's Mini-app markup — the same shape a hand-written index.html has. */
export function compileActivity(activity: DeclaredActivity): string {
  switch (activity.widget) {
    case 'steps':
      return compileSteps(activity)
    case 'order':
      return compileOrder(activity)
    case 'slider':
      return compileSlider(activity)
    case 'plot':
      return compilePlot(activity)
    case 'editor':
      return compileEditor(activity)
    case 'pieces':
      return compilePieces(activity)
    case 'hotspot':
      return compileHotspot(activity)
    case 'sim':
      return compileSim(activity)
  }
}

// ---------------------------------------------------------------- compiling a whole Course

/**
 * Read every `activities/*.json`, validate it, and write it into `apps/<id>/index.html` —
 * from that point on it is indistinguishable from a hand-written Mini-app to everything
 * downstream (`frameSource`, the execution gate, the parser's own `apps/` checks). Writes
 * nothing for an activity that fails validation, so a broken build never leaves a stale
 * compiled file behind.
 *
 * Pure file I/O, nothing spawned — this can run inside `inspect()`'s synchronous gate.
 */
export function compileDeclaredActivities(courseDir: string): CourseError[] {
  const activitiesDir = join(courseDir, 'activities')
  if (!existsSync(activitiesDir)) return []

  const errors: CourseError[] = []
  const files = readdirSync(activitiesDir).filter((name) => name.endsWith('.json'))

  for (const name of files) {
    const file = `activities/${name}`
    let raw: unknown
    try {
      raw = JSON.parse(readFileSync(join(activitiesDir, name), 'utf8'))
    } catch (cause) {
      errors.push({ file, message: `is not valid JSON: ${(cause as Error).message}` })
      continue
    }

    const parsed = DeclaredActivitySchema.safeParse(raw)
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const field = issue.path.join('.')
        errors.push({ file, message: issue.message, ...(field === '' ? {} : { field }) })
      }
      continue
    }

    const invariantErrors = activityErrors(parsed.data, file)
    if (invariantErrors.length > 0) {
      errors.push(...invariantErrors)
      continue
    }

    const appDir = join(courseDir, 'apps', parsed.data.id)
    mkdirSync(appDir, { recursive: true })
    writeFileSync(join(appDir, 'index.html'), compileActivity(parsed.data))
  }

  return errors
}
