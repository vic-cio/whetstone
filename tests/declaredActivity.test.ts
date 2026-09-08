import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, afterEach } from 'vitest'

import {
  DeclaredActivitySchema,
  initialAnswer,
  activityErrors,
  crossCheckTaskAnswer,
  compileActivity,
  compileDeclaredActivities,
} from '../src/shared/declaredActivity'

/**
 * The declared-activity schema replaces hand-written Mini-app code for the eight toolkit
 * widgets, for the common case. Its whole point is making the two bugs NEXT.md describes
 * unrepresentable: a Task whose expected answer equals a widget's own starting state, and
 * an `assertions-pass` check that pattern-matches raw code text instead of running it.
 */

describe('DeclaredActivitySchema', () => {
  it('accepts a valid order activity', () => {
    const parsed = DeclaredActivitySchema.safeParse({
      id: 'act-put-in-order',
      widget: 'order',
      label: 'Put the steps in order',
      items: ['first', 'second', 'third'],
    })
    expect(parsed.success).toBe(true)
  })

  it('rejects an unknown widget kind', () => {
    const parsed = DeclaredActivitySchema.safeParse({ id: 'act-x', widget: 'chart', label: 'x' })
    expect(parsed.success).toBe(false)
  })
})

describe('initialAnswer', () => {
  it('is the identity order for a fresh order activity, distinct from any shuffle', () => {
    const activity = DeclaredActivitySchema.parse({
      id: 'act-order',
      widget: 'order',
      label: 'Order these',
      items: ['a', 'b', 'c'],
    })
    expect(initialAnswer(activity)).toEqual([0, 1, 2])
  })

  it('is the declared start value for a slider', () => {
    const activity = DeclaredActivitySchema.parse({
      id: 'act-slider',
      widget: 'slider',
      label: 'Pick a value',
      min: 0,
      max: 10,
      start: 4,
    })
    expect(initialAnswer(activity)).toBe(4)
  })

  it('is undefined for steps and plot, which are never answerable', () => {
    const steps = DeclaredActivitySchema.parse({
      id: 'act-steps',
      widget: 'steps',
      steps: [{ title: 'One', body: 'First' }],
    })
    const plot = DeclaredActivitySchema.parse({ id: 'act-plot', widget: 'plot', label: 'A curve' })
    expect(initialAnswer(steps)).toBeUndefined()
    expect(initialAnswer(plot)).toBeUndefined()
  })

  it('is null for hotspot, which starts unclicked', () => {
    const activity = DeclaredActivitySchema.parse({
      id: 'act-hotspot',
      widget: 'hotspot',
      label: 'Find it',
      regions: [{ id: 'r1', x: 0, y: 0, w: 0.5, h: 0.5 }],
    })
    expect(initialAnswer(activity)).toBeNull()
  })

  it('is an all-null placement for pieces, which starts with everything in the bank', () => {
    const activity = DeclaredActivitySchema.parse({
      id: 'act-pieces',
      widget: 'pieces',
      bankLabel: 'Pieces',
      pieces: [{ id: 'p1', label: 'One' }, { id: 'p2', label: 'Two' }],
      slots: [{ id: 's1', label: 'Slot 1' }, { id: 's2', label: 'Slot 2' }],
    })
    expect(initialAnswer(activity)).toEqual([null, null])
  })
})

describe('activityErrors: the universal initial-state invariant', () => {
  it('is silent on a well-formed order activity', () => {
    const activity = DeclaredActivitySchema.parse({
      id: 'act-order',
      widget: 'order',
      label: 'Order these',
      items: ['a', 'b', 'c'],
    })
    expect(activityErrors(activity, 'activities/act-order.json')).toEqual([])
  })

  it('rejects a pieces activity whose declared expected mapping leaves a slot empty', () => {
    const activity = DeclaredActivitySchema.parse({
      id: 'act-pieces',
      widget: 'pieces',
      bankLabel: 'Pieces',
      pieces: [{ id: 'p1', label: 'One' }],
      slots: [{ id: 's1', label: 'Slot 1' }, { id: 's2', label: 'Slot 2' }],
    })
    // one piece, two slots: the piece can never fill both, so completion is impossible
    const errors = activityErrors(activity, 'activities/act-pieces.json')
    expect(errors.length).toBeGreaterThan(0)
  })

  it('rejects a declared editor activity whose starting code already satisfies every assertion', () => {
    const activity = DeclaredActivitySchema.parse({
      id: 'act-editor',
      widget: 'editor',
      label: 'square(x)',
      start: 'function square(x) { return x * x }',
      exports: ['square'],
      assertions: [{ name: 'squares 3', export: 'square', check: { type: 'equals', value: 9 }, args: [3] }],
    })
    const errors = activityErrors(activity, 'activities/act-editor.json')
    expect(errors.length).toBeGreaterThan(0)
    expect(errors[0]?.message).toMatch(/already/i)
  })

  it('accepts a declared editor activity whose starting code does not yet satisfy an assertion', () => {
    const activity = DeclaredActivitySchema.parse({
      id: 'act-editor',
      widget: 'editor',
      label: 'square(x)',
      start: 'function square(x) { return 0 }',
      exports: ['square'],
      assertions: [{ name: 'squares 3', export: 'square', check: { type: 'equals', value: 9 }, args: [3] }],
    })
    expect(activityErrors(activity, 'activities/act-editor.json')).toEqual([])
  })

  it('never lets an editor assertion be written against the raw text of the code', () => {
    // The DSL only ever carries {export, check}, so there is no field an assertion could use
    // to pattern-match the source text — this is a schema-shape assertion, not a runtime one.
    const activity = DeclaredActivitySchema.parse({
      id: 'act-editor',
      widget: 'editor',
      label: 'x',
      start: 'function f() { return 1 }',
      exports: ['f'],
      assertions: [{ name: 'n', export: 'f', check: { type: 'equals', value: 2 }, args: [] }],
    })
    if (activity.widget !== 'editor') throw new Error('expected editor')
    for (const assertion of activity.assertions) {
      expect(Object.keys(assertion)).toEqual(expect.arrayContaining(['name', 'export', 'check']))
      expect(Object.keys(assertion)).not.toContain('test')
      expect(Object.keys(assertion)).not.toContain('code')
    }
  })
})

describe('crossCheckTaskAnswer: expected answer must not equal the widget\'s own starting state', () => {
  const orderActivity = DeclaredActivitySchema.parse({
    id: 'act-order',
    widget: 'order',
    label: 'Order these',
    items: ['a', 'b', 'c'],
  })

  it('fails when an app-result Task\'s answer equals the identity order untouched', () => {
    const error = crossCheckTaskAnswer(
      { kind: 'app-result', app: 'act-order', answer: [0, 1, 2] } as never,
      orderActivity,
      'tasks/tsk-order.json',
    )
    expect(error).toBeDefined()
    expect(error?.message).toMatch(/initial|untouched|starting/i)
  })

  it('passes when the expected answer requires the widget to actually change', () => {
    const error = crossCheckTaskAnswer(
      { kind: 'app-result', app: 'act-order', answer: [2, 0, 1] } as never,
      orderActivity,
      'tasks/tsk-order.json',
    )
    expect(error).toBeUndefined()
  })

  it('is silent for a Task kind other than app-result', () => {
    const error = crossCheckTaskAnswer(
      { kind: 'assertions-pass', app: 'act-order', assertions: ['x'] } as never,
      orderActivity,
      'tasks/tsk-order.json',
    )
    expect(error).toBeUndefined()
  })
})

describe('compileActivity', () => {
  it('renders an order activity as a Mini-app that reports via Kit.bridge.action, never a raw button', () => {
    const activity = DeclaredActivitySchema.parse({
      id: 'act-order',
      widget: 'order',
      label: 'Order these',
      items: ['a', 'b', 'c'],
    })
    const markup = compileActivity(activity)
    expect(markup).toContain('Kit.order(')
    expect(markup).toContain('Kit.bridge.action(')
    expect(markup).toContain('Kit.bridge.ready()')
    expect(markup).not.toMatch(/<button(?!\s+class)/)
  })

  it('renders a declared editor activity using the equals/range/matches DSL, never test(api)', () => {
    const activity = DeclaredActivitySchema.parse({
      id: 'act-editor',
      widget: 'editor',
      label: 'square(x)',
      start: 'function square(x) { return 0 }',
      exports: ['square'],
      assertions: [{ name: 'squares 3', export: 'square', check: { type: 'equals', value: 9 }, args: [3] }],
    })
    const markup = compileActivity(activity)
    expect(markup).toContain('Kit.editor(')
    expect(markup).not.toContain('test: function')
    expect(markup).not.toContain('.indexOf(')
  })
})

describe('compileDeclaredActivities: end-to-end file compilation', () => {
  let dir: string

  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true })
  })

  it('compiles a valid activities/*.json into apps/<id>/index.html', () => {
    dir = mkdtempSync(join(tmpdir(), 'whetstone-activity-'))
    mkdirSync(join(dir, 'activities'), { recursive: true })
    writeFileSync(
      join(dir, 'activities', 'act-order.json'),
      JSON.stringify({ id: 'act-order', widget: 'order', label: 'Order these', items: ['a', 'b', 'c'] }),
    )

    const errors = compileDeclaredActivities(dir)
    expect(errors).toEqual([])
    expect(existsSync(join(dir, 'apps', 'act-order', 'index.html'))).toBe(true)
    const written = readFileSync(join(dir, 'apps', 'act-order', 'index.html'), 'utf8')
    expect(written).toContain('Kit.order(')
  })

  it('reports an error and writes nothing when an activity fails the initial-state invariant', () => {
    dir = mkdtempSync(join(tmpdir(), 'whetstone-activity-'))
    mkdirSync(join(dir, 'activities'), { recursive: true })
    writeFileSync(
      join(dir, 'activities', 'act-editor.json'),
      JSON.stringify({
        id: 'act-editor',
        widget: 'editor',
        label: 'square(x)',
        start: 'function square(x) { return x * x }',
        exports: ['square'],
        assertions: [{ name: 'squares 3', export: 'square', check: { type: 'equals', value: 9 }, args: [3] }],
      }),
    )

    const errors = compileDeclaredActivities(dir)
    expect(errors.length).toBeGreaterThan(0)
    expect(existsSync(join(dir, 'apps', 'act-editor', 'index.html'))).toBe(false)
  })

  it('does nothing when there is no activities/ folder', () => {
    dir = mkdtempSync(join(tmpdir(), 'whetstone-activity-'))
    expect(compileDeclaredActivities(dir)).toEqual([])
  })
})
