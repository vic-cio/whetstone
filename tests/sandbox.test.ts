import { describe, it, expect, beforeAll } from 'vitest'
import { execFileSync } from 'node:child_process'
import { DatabaseSync } from 'node:sqlite'
import { existsSync, mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/**
 * Test 7. The sandbox boundary, checked in the real runtime.
 *
 * A unit test cannot prove an iframe boundary, so this one builds the app, runs it, opens
 * the Lesson holding the hostile Mini-app in `fixtures/courses-sealed/`, and reads back
 * what that Mini-app managed to reach. Everything on the path is the real thing: the real
 * parser, the real frame, the real policy, the real `sandbox` attribute.
 *
 * The hostile Mini-app gets past the validator on purpose. The validator that refuses an
 * external reference is one layer; this is the layer underneath it.
 */

const ROOT = join(import.meta.dirname, '..')
const ELECTRON = join(ROOT, 'node_modules', '.bin', 'electron')

/** Click the library row for one course, by its title rather than by its place. */
const open = (title: string): string =>
  `Array.from(document.querySelectorAll(".crow")).filter(function (b) { return b.textContent.indexOf(${JSON.stringify(title)}) >= 0 })[0].click()`

interface Message {
  kit?: string
  type?: string
  value?: Record<string, string>
}

let messages: Message[] = []
let page = ''
let attempts: { taskId: string; outcome: string }[] = []
let ran = false

beforeAll(() => {
  if (!existsSync(ELECTRON)) return
  const work = mkdtempSync(join(tmpdir(), 'whetstone-sandbox-'))
  const shot = join(work, 'probe.png')
  const db = join(work, 'probe.db')

  execFileSync('npx', ['electron-vite', 'build'], { cwd: ROOT, stdio: 'pipe' })
  execFileSync(ELECTRON, ['.'], {
    cwd: ROOT,
    stdio: 'pipe',
    timeout: 90_000,
    env: {
      ...process.env,
      WHETSTONE_COURSES: join(ROOT, 'fixtures', 'courses-sealed'),
      WHETSTONE_DB: db,
      WHETSTONE_CAPTURE: shot,
      WHETSTONE_CAPTURE_WAIT: '1500',
      WHETSTONE_CAPTURE_STEPS: JSON.stringify([
        // The listener has to be in the page, because a message posted out of the frame
        // is delivered to this window and nowhere else.
        'window.__probe = []; window.addEventListener("message", function (e) { window.__probe.push(e.data) })',
        // The course that declares the chess service comes first, so the page text this
        // run ends on is still the hostile course's verdict.
        open('Chess service probe'),
        'document.querySelectorAll(".lname")[0].click()',
        'document.querySelector(".back").click()',
        open('Sandbox probe'),
        'document.querySelectorAll(".lname")[0].click()',
        // Then the Test, from the rail, whose mini-app reports on its own. One run then
        // follows a report from inside the frame all the way to a recorded Attempt.
        'Array.from(document.querySelectorAll(".rail button")).filter(function (b) { return b.textContent.indexOf("The report arrives") === 0 })[0].click()',
      ]),
    },
  })

  messages = JSON.parse(readFileSync(`${shot}.json`, 'utf8')) as Message[]
  page = readFileSync(`${shot}.txt`, 'utf8')

  const store = new DatabaseSync(db, { readOnly: true })
  attempts = store.prepare('SELECT taskId, outcome FROM attempts').all() as typeof attempts
  store.close()
  ran = true
}, 180_000)

/** The hostile mini-app's report, picked by what is in it rather than by its place. */
const report = (): Record<string, string> => {
  const answer = messages.find((message) => message.type === 'answer' && message.value?.['origin'] !== undefined)
  if (!answer?.value) throw new Error('the hostile mini-app never reported')
  return answer.value
}

describe.runIf(existsSync(ELECTRON))('test 7 — a sealed mini-app reaches nothing', () => {
  it('ran the hostile mini-app in a real frame', () => {
    expect(ran).toBe(true)
    expect(messages.some((message) => message.type === 'ready')).toBe(true)
  })

  it('has no origin of its own', () => {
    expect(report()['origin']).toBe('null')
  })

  it('cannot reach storage', () => {
    expect(report()['storage']).toMatch(/^threw/)
    expect(report()['cookie']).toMatch(/^threw/)
  })

  it('cannot reach the host document or the window above it', () => {
    expect(report()['parentDocument']).toMatch(/^threw/)
    expect(report()['topLocation']).toMatch(/^threw/)
  })

  it('cannot open a window', () => {
    expect(report()['popup']).toMatch(/^(null|threw)/)
  })

  it('cannot reach the network, by fetch or by script', () => {
    expect(report()['fetch']).toMatch(/^(rejected|threw)/)
    expect(report()['script']).toBe('blocked')
  })

  it('cannot reach a service this course did not declare', () => {
    // The host has a chess service and this course does not name it, so the answer is no.
    expect(report()['service']).toMatch(/^refused .*does not declare the "chess" service/)
  })

  it('leaves only by postMessage, and only what it chose to send', () => {
    // Four kinds of message, all from the toolkit: the frame's height, that it had drawn,
    // what it chose to report, and one request the host refused. Nothing else crossed.
    expect(messages.every((message) => message.kit === '1.1.0')).toBe(true)
    expect(new Set(messages.map((message) => message.type))).toEqual(
      new Set(['resize', 'ready', 'answer', 'ask']),
    )
  })
})

/** The service probe's report, picked the same way: by what is in it. */
const served = (): Record<string, string> => {
  const answer = messages.find((message) => message.type === 'answer' && message.value?.['moves'] !== undefined)
  if (!answer?.value) throw new Error('the service probe never reported')
  return answer.value
}

describe.runIf(existsSync(ELECTRON))('a declared service answers, in the real runtime', () => {
  it('answers a course that declared it', () => {
    expect(ran).toBe(true)
    // The rules ran in the main process and the result crossed back into the sealed frame.
    expect(served()['moves']).toBe('e3 e4')
    expect(served()['best']).toMatch(/^[A-Za-z][a-h1-8=+#x-]+$/)
  })

  it('still refuses a service this build does not have', () => {
    expect(served()['unknown']).toMatch(/^refused .*there is no service named "shell"/)
  })
})

describe.runIf(existsSync(ELECTRON))('a report reaches the host and is recorded', () => {
  it('is judged by the host and shown as an outcome', () => {
    expect(ran).toBe(true)
    // The verdict is set in small capitals, so the page reads it back uppercase.
    expect(page).toMatch(/correct/i)
    expect(page).toContain('The report crossed the sandbox and the host judged it.')
  })

  it('records the attempt, because a Test task always records', () => {
    expect(attempts).toEqual([{ taskId: 'tsk-report', outcome: 'pass' }])
  })
})
