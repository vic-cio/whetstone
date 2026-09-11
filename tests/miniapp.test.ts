import { describe, it, expect, beforeAll } from 'vitest'
import { cpSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { EXTERNAL, POLICY, TOOLKIT_VERSION, codeblockFrameSource, frameSource, readToolkit } from '../src/shared/miniapp'
import { parseCourse } from '../src/shared/parseCourse'
import type { Course } from '../src/shared/format'

const ROOT = join(import.meta.dirname, '..')
const FIXTURE = join(ROOT, 'fixtures', 'courses', 'gradients-by-hand')
const CHESS = join(ROOT, 'fixtures', 'courses', 'forks-and-pins')
const PROBE = join(ROOT, 'fixtures', 'courses-sealed', 'sandbox-probe')
/** None of these fixtures pin a runtime, so an empty cache is all `frameSource` ever needs here. */
const CACHE_ROOT = mkdtempSync(join(tmpdir(), 'whetstone-runtime-cache-'))

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
    const frame = frameSource(FIXTURE, 'slope-explorer', CACHE_ROOT)

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

    const frame = frameSource(dir, 'slope-explorer', CACHE_ROOT)
    expect(frame).toContain('whetstone-toolkit 0.9.0')
    expect(frame).toContain('version: "0.9.0"')
    // Nothing from this build's toolkit reached the frame.
    expect(frame).not.toContain('Kit.pieces')
    expect(frame).not.toContain('whetstone-toolkit 1.0.0')
  })

  it('keeps every pinned copy in step with the toolkit this build ships', () => {
    // The pinned copy is a copy. One that drifted from the build would make every check
    // against it meaningless, and nothing else would notice.
    const shipped = readToolkit(join(ROOT, 'toolkit'))
    expect(shipped?.version).toBe(TOOLKIT_VERSION)
    for (const dir of [FIXTURE, CHESS]) {
      const pinned = readToolkit(join(dir, 'toolkit'))
      expect(pinned?.js).toBe(shipped?.js)
      expect(pinned?.css).toBe(shipped?.css)
    }
  })

  it('carries the widgets every subject needs', () => {
    // A widget in the toolkit is one that any Course could want. A list put in order by
    // dragging is one of those, and it was a gap the toolkit carried for a version.
    const toolkit = readToolkit(join(ROOT, 'toolkit'))
    expect(toolkit?.js).toContain('function order(options)')
    expect(toolkit?.js).toContain("order: order,")
    expect(toolkit?.css).toContain('.k-order')
  })

  it('carries no course’s subject in it', () => {
    // The toolkit is the same in every Course, so nothing about one subject may be in it.
    // A board and a set of chess rules belong to the Course that wanted them.
    const toolkit = readToolkit(join(ROOT, 'toolkit'))
    expect(toolkit?.js).not.toContain('function board(')
    expect(toolkit?.js).not.toContain('rnbqkbnr')
    expect(toolkit?.js).not.toContain('Chess')
  })

  it('refuses a pinned copy that disagrees with the manifest', () => {
    const dir = copyFixture()
    writeFileSync(join(dir, 'toolkit', 'kit.js'), '/* whetstone-toolkit 2.0.0 */\n')
    const result = parseCourse(dir)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.errors.map((error) => error.message).join(' ')).toContain(
      `but course.json says ${TOOLKIT_VERSION}`,
    )
  })
})

describe('test 17 — a mini-app built from the toolkit has no colour of its own', () => {
  /**
   * A colour is a problem where it styles something. The same words are ordinary English
   * elsewhere: a chess mini-app says "white to move" and means the player, not a shade.
   */
  const STYLED = /(?:color|background|fill|stroke|border|shadow)[^;{}\n]*\b(?:white|black|red|green|blue|gray|grey|orange|yellow|purple|silver)\b/i
  const HEX = /#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})\b/
  const courses = [FIXTURE, CHESS]
  const apps = courses.flatMap((dir) =>
    readdirSync(join(dir, 'apps')).map((id) => ({ dir, id, source: readFileSync(join(dir, 'apps', id, 'index.html'), 'utf8') })),
  )

  it('has mini-apps in more than one course to check', () => {
    expect(apps.length).toBeGreaterThan(3)
    expect(new Set(apps.map((app) => app.dir)).size).toBe(courses.length)
  })

  for (const app of apps) {
    it(`${app.id} names no colour and no face`, () => {
      expect(HEX.test(app.source)).toBe(false)
      expect(STYLED.test(app.source)).toBe(false)
      expect(app.source).not.toContain('font-family')
      expect(app.source).not.toContain('rgb(')
      expect(app.source).not.toContain('hsl(')
    })

    it(`${app.id} leaves the sandbox only through the toolkit`, () => {
      expect(app.source).not.toContain('postMessage')
      expect(app.source).toContain('Kit.bridge.ready()')
    })
  }

  it('the toolkit defines its palette for both themes', () => {
    for (const dir of courses) {
      const toolkit = readToolkit(join(dir, 'toolkit'))
      expect(toolkit?.css).toContain('prefers-color-scheme: dark')
      // The frame follows the theme on its own, so the host sends it nothing.
      expect(toolkit?.js).not.toContain('prefers-color-scheme')
    }
    expect(readToolkit(join(FIXTURE, 'toolkit'))?.version).toBe(TOOLKIT_VERSION)
    expect(readToolkit(join(CHESS, 'toolkit'))?.version).toBe(TOOLKIT_VERSION)
  })
})

describe('the Lesson codeblock frame (docs/adr/0026)', () => {
  it('carries the policy, the toolkit, then a Kit.codeblock call built from the block', () => {
    const frame = codeblockFrameSource(FIXTURE, { lang: 'js', start: 'console.log(1)' }, CACHE_ROOT)

    expect(frame).toContain(POLICY)
    const toolkit = frame.indexOf('whetstone-toolkit')
    const call = frame.indexOf('Kit.codeblock(')
    expect(toolkit).toBeGreaterThan(-1)
    expect(call).toBeGreaterThan(toolkit)
    expect(frame).toContain('"lang":"js"')
    expect(frame).toContain('"start":"console.log(1)"')
    expect(frame).toContain('Kit.bridge.ready()')
  })

  it('escapes a literal "</script>" in the starting code so it cannot close the tag early', () => {
    const frame = codeblockFrameSource(FIXTURE, { lang: 'js', start: '"</script><script>evil()</script>"' }, CACHE_ROOT)
    expect(frame).not.toContain('</script><script>evil()')
    // The real closing tag for the generated script is still there, just once.
    expect(frame.match(/<\/script>/g)?.length).toBeGreaterThan(0)
  })
})

describe('the app block', () => {
  it('keeps the space a lesson holds for it', () => {
    const lesson = course.lessons['les-what-a-derivative-measures']
    const block = lesson?.blocks.find((item) => item.block === 'app')
    expect(block).toEqual({ block: 'app', id: 'slope-explorer', height: 320 })
  })

  it('holds the chess course’s walkthrough', () => {
    const result = parseCourse(CHESS)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const lesson = result.course.lessons['les-the-knight-fork']
    expect(lesson?.blocks).toContainEqual({ block: 'app', id: 'fork-walkthrough', height: 560 })
    expect(result.course.tasks['tsk-find-the-fork']).toMatchObject({ app: 'find-the-fork' })
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

describe('a course’s own library', () => {
  /**
   * A Course carries the code the toolkit does not have (docs/adr/0019). The host inlines
   * what `course.json` lists under `library`, in that order, into every Mini-app in that
   * Course and into no other.
   */
  it('inlines what the course listed, in the order it listed it', () => {
    const frame = frameSource(CHESS, 'find-the-fork', CACHE_ROOT)
    const chess = frame.indexOf('window.Chess = ')
    const css = frame.indexOf('.b-grid {')
    const board = frame.indexOf('window.Board = ')
    const app = frame.indexOf('Board({ mount:')
    expect(chess).toBeGreaterThan(0)
    expect(css).toBeGreaterThan(0)
    // The toolkit comes first, then the library in the course's order, then the app.
    expect(frame.indexOf('whetstone-toolkit')).toBeLessThan(chess)
    expect(chess).toBeLessThan(board)
    expect(board).toBeLessThan(app)
  })

  it('gives a course nothing another course listed', () => {
    const other = frameSource(FIXTURE, 'slope-explorer', CACHE_ROOT)
    expect(other).not.toContain('window.Chess = ')
    expect(other).not.toContain('window.Board = ')
  })

  it('refuses a library file that is not there', () => {
    const dir = copyFixture()
    const manifest = JSON.parse(readFileSync(join(dir, 'course.json'), 'utf8')) as Record<string, unknown>
    manifest['library'] = ['nowhere.js']
    writeFileSync(join(dir, 'course.json'), JSON.stringify(manifest, null, 2))
    const result = parseCourse(dir)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.errors).toContainEqual({
      file: 'course.json',
      field: 'library[0]',
      message: 'names lib/nowhere.js, which is not there',
    })
  })

  it('refuses a library entry that is a path, or is neither js nor css', () => {
    const dir = copyFixture()
    const manifest = JSON.parse(readFileSync(join(dir, 'course.json'), 'utf8')) as Record<string, unknown>
    manifest['library'] = ['../../etc/passwd', 'notes.txt']
    writeFileSync(join(dir, 'course.json'), JSON.stringify(manifest, null, 2))
    const result = parseCourse(dir)
    expect(result.ok).toBe(false)
    if (result.ok) return
    const said = result.errors.map((error) => error.message).join(' ')
    expect(said).toContain('must be a file directly inside lib/')
    expect(said).toContain('is neither a .js nor a .css file')
  })

  it('leaves a course with no library alone', () => {
    const result = parseCourse(FIXTURE)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.course.library).toEqual([])
  })
})
