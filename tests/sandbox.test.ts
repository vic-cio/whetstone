import { describe, it, expect, beforeAll } from 'vitest'
import { execFileSync } from 'node:child_process'
import { DatabaseSync } from 'node:sqlite'
import { existsSync, mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { TOOLKIT_VERSION } from '../src/shared/miniapp'

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

/**
 * Click the library row for one course, by its title rather than by its place. The row is
 * a container holding two destinations, so what is clicked is the one that opens it.
 */
const open = (title: string): string =>
  `Array.from(document.querySelectorAll(".crow")).filter(function (b) { return b.textContent.indexOf(${JSON.stringify(title)}) >= 0 })[0].querySelector(".cgo").click()`

interface Message {
  kit?: string
  type?: string
  value?: Record<string, string>
}

let messages: Message[] = []
let page = ''
let attempts: { taskId: string; outcome: string }[] = []
let runs = -1
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
      // Each `until:` below gives up after this, so a real regression comes back as a
      // false probe rather than as a run that hangs to the hard limit.
      WHETSTONE_CAPTURE_UNTIL: '20000',
      WHETSTONE_CAPTURE_LIMIT: '75000',
      WHETSTONE_CAPTURE_STEPS: JSON.stringify([
        // The listener has to be in the page, because a message posted out of the frame
        // is delivered to this window and nowhere else.
        'window.__probe = []; window.addEventListener("message", function (e) { window.__probe.push(e.data) })',
        open('Sandbox probe'),
        'document.querySelectorAll(".lname")[0].click()',
        // The sealed frame has to load and run before it can ask for a review, and how
        // long that takes is not fixed: on a busy machine it passes 1500ms. So wait for
        // the ask itself, which the listener above records, rather than for a pause.
        'until:window.__probe.some(function (m) { return m && m.type === "review" })',
        // One pause, for the host to answer the ask. The pause runs after every step, so
        // a step that does nothing is how a capture waits.
        '0',
        // While the lesson is open, note whether the host held the review the hostile
        // mini-app asked for. The shot at the end is of a different page.
        'window.__probe.push({ type: "sawReview", value: document.body.innerText.indexOf("nothing happens until you press") >= 0 })',
        // Then the Test, from the rail, whose mini-app reports on its own. One run then
        // follows a report from inside the frame all the way to a recorded Attempt.
        'Array.from(document.querySelectorAll(".rail button")).filter(function (b) { return b.textContent.indexOf("The report arrives") === 0 })[0].click()',
        // That frame loads on its own schedule too. Wait for its report, which carries
        // what the task asks for, and then one pause for the host to judge and record it.
        'until:window.__probe.some(function (m) { return m && m.value && m.value.placed === "ok" })',
        '0',
        // Opening the tutor is not asking it anything. The panel draws, a thread is read
        // from the database, and nothing is spawned (test 15).
        'document.querySelector(".tstub").click()',
        'until:document.querySelector(".tcompose") !== null',
        'window.__probe.push({ type: "sawTutor", value: document.querySelectorAll(".tcompose textarea").length })',
      ]),
    },
  })

  messages = JSON.parse(readFileSync(`${shot}.json`, 'utf8')) as Message[]
  page = readFileSync(`${shot}.txt`, 'utf8')

  const store = new DatabaseSync(db, { readOnly: true })
  attempts = store.prepare('SELECT taskId, outcome FROM attempts').all() as typeof attempts
  runs = (store.prepare('SELECT COUNT(*) AS n FROM runs').get() as { n: number }).n
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

  it('cannot see another course’s library', () => {
    // The chess Course lists chess.js and board.js and gets them in its own frames. This
    // course lists no library, so neither name exists here (docs/adr/0019).
    expect(report()['library']).toBe('undefined undefined')
  })

  it('leaves only by postMessage, and only what it chose to send', () => {
    // Four kinds of message and nothing else crossed: the frame's height, that it had
    // drawn, what it chose to report, and a review it asked for without being pressed.
    expect(new Set(messages.map((message) => message.type))).toEqual(
      new Set(['resize', 'ready', 'answer', 'review', 'sawReview', 'sawTutor']),
    )
    // The toolkit's own messages carry its version. The hostile one does not, because it
    // went around the toolkit, and that is the point: `kit` is not a credential. What the
    // host actually checks is that the message came from this frame's own window.
    const mine = new Set(['review', 'sawReview', 'sawTutor'])
    const toolkit = messages.filter((message) => !mine.has(message.type ?? ''))
    expect(toolkit.every((message) => message.kit === TOOLKIT_VERSION)).toBe(true)
    expect(messages.find((message) => message.type === 'review')?.kit).toBe('1')
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

/**
 * Test 14: a Mini-app cannot cause a spawn. A review starts only from the user's button.
 *
 * The hostile Mini-app asks for a review by posting the message itself, going around
 * `Kit.bridge.action`, which will not send one without a press. So this is the case the
 * toolkit cannot cover, and the host has to.
 */
describe('tests 14 and 15 — nothing spends the user’s money on its own', () => {
  it('ran', () => {
    expect(ran, 'the app did not run').toBe(true)
  })

  it('holds a review a mini-app asked for, rather than acting on it', () => {
    const noted = messages.find((message) => message.type === 'sawReview')
    expect(noted, 'the probe did not run').toBeDefined()
    expect(noted?.value).toBe(true)
  })

  it('opens the tutor without asking it anything', () => {
    // Test 15's second half. The panel is there and its composer is drawn, and no process
    // has been started: a conversation begins with the first message, not with the panel.
    expect(messages.find((message) => message.type === 'sawTutor')?.value).toBe(1)
  })

  it('starts nothing, through all of that, so nothing was spent', () => {
    // Test 15. Every spawn writes a row here before the process starts, so an empty table
    // is the whole claim: opening a course, a lesson, a test, answering a task, a review a
    // mini-app asked for, and opening the tutor started no Constructor, Tutor or Grader.
    expect(runs).toBe(0)
    expect(attempts.length).toBeGreaterThan(0)
  })
})
