import { describe, it, expect, beforeAll } from 'vitest'
import { cpSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { EXTERNAL, POLICY, frameSource, readToolkit } from '../src/shared/miniapp'
import { parseCourse } from '../src/shared/parseCourse'
import type { Course } from '../src/shared/format'

const ROOT = join(import.meta.dirname, '..')
const FIXTURE = join(ROOT, 'fixtures', 'courses', 'gradients-by-hand')
const PROBE = join(ROOT, 'fixtures', 'courses-sealed', 'sandbox-probe')

/** A copy of the fixture Course somewhere writable, for the cases that need a broken one. */
function copyFixture(): string {
  const dir = join(mkdtempSync(join(tmpdir(), 'whetstone-')), 'course')
  cpSync(FIXTURE, dir, { recursive: true })
  return dir
}

let course: Course
beforeAll(() => {
  const result = parseCourse(FIXTURE)
  if (!result.ok) throw new Error(`fixture did not parse: ${JSON.stringify(result.errors)}`)
  course = result.course
})

describe('the sealed frame', () => {
  it('carries the policy, the toolkit, and then the mini-app', () => {
    const frame = frameSource(FIXTURE, 'slope-explorer')

    expect(frame).toContain(POLICY)
    expect(POLICY).toContain("default-src 'none'")
    expect(POLICY).toContain("connect-src 'none'")

    // The toolkit arrives before the mini-app, or `Kit` would not exist when it runs.
    const toolkit = frame.indexOf('whetstone-toolkit')
    const app = frame.indexOf('Kit.plot')
    expect(toolkit).toBeGreaterThan(-1)
    expect(app).toBeGreaterThan(toolkit)

    // Everything is inline. The frame has no way to fetch anything, so anything it points
    // at outside itself would silently render wrong.
    expect(EXTERNAL.test(frame)).toBe(false)
  })

  it('refuses a mini-app that reaches outside itself', () => {
    const dir = copyFixture()
    writeFileSync(
      join(dir, 'apps', 'slope-explorer', 'index.html'),
      '<script src="https://example.com/plot.js"></script>',
    )
    const result = parseCourse(dir)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.errors.some((error) => error.file === 'apps/slope-explorer/index.html')).toBe(true)
  })
})

describe('test 18 — the host injects the course’s pinned toolkit, not the app’s', () => {
  it('uses the copy in the course folder', () => {
    const dir = copyFixture()
    const pinned = join(dir, 'toolkit')
    writeFileSync(
      join(pinned, 'kit.js'),
      '/* whetstone-toolkit 0.9.0 */\nwindow.Kit = { version: "0.9.0", bridge: { ready: function () {} } }\n',
    )
    writeFileSync(join(pinned, 'kit.css'), '/* whetstone-toolkit 0.9.0 */\n:root { --kit-ink: #000; }\n')

    const manifest = JSON.parse(readFileSync(join(dir, 'course.json'), 'utf8')) as Record<string, unknown>
    manifest['toolkitVersion'] = '0.9.0'
    writeFileSync(join(dir, 'course.json'), JSON.stringify(manifest, null, 2))

    const result = parseCourse(dir)
    expect(result.ok).toBe(true)

    const frame = frameSource(dir, 'slope-explorer')
    expect(frame).toContain('whetstone-toolkit 0.9.0')
    expect(frame).toContain('version: "0.9.0"')
    // Nothing from this build's toolkit reached the frame.
    expect(frame).not.toContain('Kit.pieces')
    expect(frame).not.toContain('whetstone-toolkit 1.0.0')
  })

  it('refuses a pinned copy that disagrees with the manifest', () => {
    const dir = copyFixture()
    writeFileSync(join(dir, 'toolkit', 'kit.js'), '/* whetstone-toolkit 2.0.0 */\n')
    const result = parseCourse(dir)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.errors.map((error) => error.message).join(' ')).toContain('but course.json says 1.0.0')
  })
})

describe('test 17 — a mini-app built from the toolkit has no colour of its own', () => {
  const NAMED = /\b(?:white|black|red|green|blue|gray|grey|orange|yellow|purple|silver)\b/i
  const HEX = /#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})\b/
  const apps = readdirSync(join(FIXTURE, 'apps'))

  it('has mini-apps to check', () => {
    expect(apps.length).toBeGreaterThan(1)
  })

  for (const id of apps) {
    it(`${id} names no colour and no face`, () => {
      const source = readFileSync(join(FIXTURE, 'apps', id, 'index.html'), 'utf8')
      expect(HEX.test(source)).toBe(false)
      expect(NAMED.test(source)).toBe(false)
      expect(source).not.toContain('font-family')
      expect(source).not.toContain('rgb(')
      expect(source).not.toContain('hsl(')
    })

    it(`${id} leaves the sandbox only through the bridge`, () => {
      const source = readFileSync(join(FIXTURE, 'apps', id, 'index.html'), 'utf8')
      expect(source).not.toContain('postMessage')
      expect(source).toContain('Kit.bridge.ready()')
    })
  }

  it('the toolkit defines its palette for both themes', () => {
    const toolkit = readToolkit(join(FIXTURE, 'toolkit'))
    expect(toolkit?.version).toBe('1.0.0')
    expect(toolkit?.css).toContain('prefers-color-scheme: dark')
    // The frame follows the theme on its own, so the host sends it nothing.
    expect(toolkit?.js).not.toContain('prefers-color-scheme')
  })
})

describe('the app block', () => {
  it('keeps the space a lesson holds for it', () => {
    const lesson = course.lessons['les-what-a-derivative-measures']
    const block = lesson?.blocks.find((item) => item.block === 'app')
    expect(block).toEqual({ block: 'app', id: 'slope-explorer', height: 320 })
  })

  it('names a mini-app the course actually has', () => {
    expect(course.apps).toContain('slope-explorer')
    expect(course.tasks['tsk-place-the-factors']).toMatchObject({ app: 'factor-placement' })
    expect(course.tasks['tsk-write-backward']).toMatchObject({ app: 'backward-pass' })
  })
})

describe('the probe course', () => {
  /**
   * The hostile mini-app gets past the validator on purpose, by building its external
   * reference at runtime. That is the whole reason test 7 exists: the sandbox has to hold
   * for a mini-app the validator did not catch.
   */
  it('parses, so the sandbox is the only thing standing in its way', () => {
    const result = parseCourse(PROBE)
    expect(result.ok).toBe(true)
  })
})
