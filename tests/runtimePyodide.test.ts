import { describe, it, expect, beforeAll } from 'vitest'
import { execFileSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/**
 * Fetching and boot-verifying the real Pyodide runtime (docs/adr/0026), against the real
 * network and the real sandboxed-frame machinery — everything `tests/runtimeFetch.test.ts`
 * mocks out. This is the check that actually proves Python's stdlib import system works
 * against a zip mounted the way `runtimeBootstrapScript` mounts it, not just that
 * `fetchRuntime`'s own bookkeeping is correct.
 *
 * Needs the real Electron sandbox (`sandboxHarness.ts`), so this drives it through the same
 * narrow entry point `tests/executionGate.test.ts` uses for the same reason
 * (`WHETSTONE_RUNTIME_CHECK`, `src/main/index.ts`), and needs real network access to
 * jsdelivr's CDN — skips itself if that is not available rather than failing the suite.
 */

const ROOT = join(import.meta.dirname, '..')
const ELECTRON = join(ROOT, 'node_modules', '.bin', 'electron')

let ready = false

beforeAll(async () => {
  if (!existsSync(ELECTRON)) return
  execFileSync('npx', ['electron-vite', 'build'], { cwd: ROOT, stdio: 'pipe' })
  try {
    const response = await fetch('https://cdn.jsdelivr.net/pyodide/v0.26.1/full/pyodide.js', { method: 'HEAD' })
    ready = response.ok
  } catch {
    ready = false
  }
}, 120_000)

function runFetch(lang: string, cacheRoot: string): { ok: boolean; ref?: { lang: string; version: string }; error?: string } {
  const box = mkdtempSync(join(tmpdir(), 'whetstone-runtime-check-'))
  const outputPath = join(box, 'result.json')
  execFileSync(ELECTRON, ['.'], {
    cwd: ROOT,
    stdio: 'pipe',
    timeout: 120_000,
    env: {
      ...process.env,
      WHETSTONE_RUNTIME_CHECK: lang,
      WHETSTONE_RUNTIME_OUTPUT: outputPath,
      WHETSTONE_RUNTIME_CACHE: cacheRoot,
    },
  })
  return JSON.parse(readFileSync(outputPath, 'utf8'))
}

describe('fetching and boot-verifying python for real', () => {
  it('fetches every asset, boots Pyodide in the real sandbox, caches it, and proves the stdlib import system works', () => {
    if (!ready) return
    const cacheRoot = mkdtempSync(join(tmpdir(), 'whetstone-runtime-cache-'))
    const result = runFetch('python', cacheRoot)
    expect(result.ok).toBe(true)
    expect(result.ref).toEqual({ lang: 'python', version: '0.26.1' })

    const cachedFiles = readdirSync(join(cacheRoot, 'python@0.26.1')).sort()
    expect(cachedFiles).toEqual(
      ['pyodide-lock.json', 'pyodide.asm.js', 'pyodide.asm.wasm', 'pyodide.js', 'python_stdlib.zip'].sort(),
    )
  }, 150_000)

  it('refuses a language not on the allowlist, without touching the network', () => {
    if (!ready) return
    const cacheRoot = mkdtempSync(join(tmpdir(), 'whetstone-runtime-cache-'))
    const result = runFetch('ruby', cacheRoot)
    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/ruby.*allowlist|allowlist.*ruby/i)
    expect(existsSync(cacheRoot) ? readdirSync(cacheRoot) : []).toEqual([])
  }, 30_000)
})

/**
 * The end-to-end path a real Course takes: `frameSource` inlines the cached runtime,
 * `Kit.bridge.ready()` waits for it, and `Kit.run('python', ...)` produces real output —
 * all through the exact `checkMiniApp` machinery the build pipeline itself runs, not a
 * standalone probe page.
 */
function makePythonCourse(cacheRoot: string): string {
  const dir = join(mkdtempSync(join(tmpdir(), 'whetstone-python-course-')), 'course')
  mkdirSync(join(dir, 'toolkit'), { recursive: true })
  mkdirSync(join(dir, 'apps', 'py'), { recursive: true })
  cpSync(join(ROOT, 'toolkit', 'kit.js'), join(dir, 'toolkit', 'kit.js'))
  cpSync(join(ROOT, 'toolkit', 'kit.css'), join(dir, 'toolkit', 'kit.css'))
  writeFileSync(
    join(dir, 'course.json'),
    JSON.stringify({ formatVersion: 1, runtimes: [{ lang: 'python', version: '0.26.1' }] }),
  )
  writeFileSync(
    join(dir, 'apps', 'py', 'index.html'),
    [
      '<div id="app"></div>',
      '<script>',
      'var out = Kit.run(\'python\', \'import json\\nresult = json.dumps({"ok": True})\', { exports: [\'result\'] })',
      'if (!out.ok || out.api.result !== \'{"ok": true}\') {',
      '  throw new Error("python did not run correctly: " + JSON.stringify(out))',
      '}',
      "Kit.bridge.action('Answer', function () { return 'done' })",
      'Kit.bridge.ready()',
      '</script>',
    ].join('\n'),
  )
  return dir
}

describe('a Mini-app that actually calls Kit.run(\'python\', ...)', () => {
  it('boots for real, waits for the runtime, and Kit.run returns real Python output', () => {
    if (!ready) return
    const cacheRoot = mkdtempSync(join(tmpdir(), 'whetstone-runtime-cache-'))
    expect(runFetch('python', cacheRoot).ok).toBe(true)

    const courseDir = makePythonCourse(cacheRoot)
    const outputPath = join(courseDir, '..', 'gate-result.json')
    execFileSync(ELECTRON, ['.'], {
      cwd: ROOT,
      stdio: 'pipe',
      timeout: 60_000,
      env: {
        ...process.env,
        WHETSTONE_GATE_CHECK: `${courseDir}::py`,
        WHETSTONE_GATE_OUTPUT: outputPath,
        WHETSTONE_RUNTIME_CACHE: cacheRoot,
      },
    })
    const result = JSON.parse(readFileSync(outputPath, 'utf8')) as { errors: { message: string }[]; crash?: string }
    expect(result.crash).toBeUndefined()
    expect(result.errors).toEqual([])
  }, 90_000)
})
