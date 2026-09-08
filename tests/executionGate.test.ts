import { describe, it, expect, beforeAll } from 'vitest'
import { execFileSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/**
 * The build-time execution gate, checked in the real runtime.
 *
 * A unit test cannot prove an iframe boundary (`tests/sandbox.test.ts`'s own reasoning),
 * so this boots the real app in a narrow mode (`WHETSTONE_GATE_CHECK`) that runs
 * `checkMiniApp` directly against a course folder, with no Constructor build and no UI
 * navigation — the "narrower, faster variant" this gate needed instead of reusing the
 * full `WHETSTONE_CAPTURE*` harness verbatim.
 */

const ROOT = join(import.meta.dirname, '..')
const ELECTRON = join(ROOT, 'node_modules', '.bin', 'electron')

function makeCourse(): string {
  const dir = join(mkdtempSync(join(tmpdir(), 'whetstone-gate-')), 'course')
  mkdirSync(join(dir, 'toolkit'), { recursive: true })
  mkdirSync(join(dir, 'apps'), { recursive: true })
  cpSync(join(ROOT, 'toolkit', 'kit.js'), join(dir, 'toolkit', 'kit.js'))
  cpSync(join(ROOT, 'toolkit', 'kit.css'), join(dir, 'toolkit', 'kit.css'))
  return dir
}

function writeApp(courseDir: string, appId: string, markup: string): void {
  mkdirSync(join(courseDir, 'apps', appId), { recursive: true })
  writeFileSync(join(courseDir, 'apps', appId, 'index.html'), markup)
}

function runGate(courseDir: string, appIds: string[]): { errors: { file: string; message: string }[]; crash?: string } {
  const outputPath = join(courseDir, '..', 'gate-result.json')
  execFileSync(ELECTRON, ['.'], {
    cwd: ROOT,
    stdio: 'pipe',
    timeout: 60_000,
    env: {
      ...process.env,
      WHETSTONE_GATE_CHECK: `${courseDir}::${appIds.join(',')}`,
      WHETSTONE_GATE_OUTPUT: outputPath,
    },
  })
  return JSON.parse(readFileSync(outputPath, 'utf8'))
}

let ready = false

beforeAll(() => {
  if (!existsSync(ELECTRON)) return
  execFileSync('npx', ['electron-vite', 'build'], { cwd: ROOT, stdio: 'pipe' })
  ready = true
}, 120_000)

describe('the execution gate', () => {
  it('passes a Mini-app that boots, reports ready, and answers through Kit.bridge.action', () => {
    if (!ready) return
    const dir = makeCourse()
    writeApp(
      dir,
      'good',
      [
        '<div id="app"></div>',
        '<script>',
        "var widget = Kit.slider({ mount: '#app', label: 'Pick', min: 0, max: 10, value: 3 })",
        "Kit.bridge.action('Answer', function () { return widget.value() })",
        'Kit.bridge.ready()',
        '</script>',
      ].join('\n'),
    )

    const result = runGate(dir, ['good'])
    expect(result.crash).toBeUndefined()
    expect(result.errors).toEqual([])
  }, 60_000)

  it('fails a Mini-app that throws before it ever draws', () => {
    if (!ready) return
    const dir = makeCourse()
    writeApp(dir, 'throws', '<div id="app"></div>\n<script>\nthrow new Error("boom on line one")\n</script>')

    const result = runGate(dir, ['throws'])
    expect(result.errors.length).toBeGreaterThan(0)
    expect(result.errors[0]?.message).toMatch(/throws before drawing/)
  }, 60_000)

  it('fails a Mini-app that draws no way to answer', () => {
    if (!ready) return
    const dir = makeCourse()
    writeApp(dir, 'stuck', '<div id="app"></div>\n<script>\nKit.bridge.ready()\n</script>')

    const result = runGate(dir, ['stuck'])
    expect(result.errors.length).toBeGreaterThan(0)
    expect(result.errors[0]?.message).toMatch(/no Kit\.bridge\.action button/)
  }, 60_000)

  it('fails a Mini-app whose action button is styled unreadable', () => {
    if (!ready) return
    const dir = makeCourse()
    // Uses the real Kit.bridge.action button (so the functional check passes) but
    // overrides its colours to pale-on-pale — the trap NEXT.md describes, reproduced with
    // real CSS specificity rather than a bare unclassed button.
    writeApp(
      dir,
      'unreadable',
      [
        '<style>.k-btn { color: #f5f5f5 !important; background-color: #f0f0f0 !important; }</style>',
        '<div id="app"></div>',
        '<script>',
        "var widget = Kit.slider({ mount: '#app', label: 'Pick', min: 0, max: 10, value: 3 })",
        "Kit.bridge.action('Answer', function () { return widget.value() })",
        'Kit.bridge.ready()',
        '</script>',
      ].join('\n'),
    )

    const result = runGate(dir, ['unreadable'])
    expect(result.errors.some((error) => /unreadable/.test(error.message))).toBe(true)
  }, 60_000)
})
