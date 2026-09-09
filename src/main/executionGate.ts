import { BrowserWindow, nativeTheme } from 'electron'

import { frameSource } from '../shared/miniapp'
import type { CourseError } from '../shared/format'

/**
 * Booting a Mini-app for real, at build time, instead of only reading its markup.
 *
 * `parseCourse` catches a Mini-app that is missing or reaches outside itself, but nothing
 * before this checked that the JavaScript parses, that it draws, that pressing its action
 * button sends anything, or that its button is legible in both themes. Two real Courses
 * shipped anyway: a Task whose expected answer equalled a widget's untouched starting
 * state (closed structurally for declared activities by `crossCheckTaskAnswer`, but a
 * bespoke, hand-written Mini-app has no declared activity to check that against), and
 * buttons invisible in dark theme because they inherited the frame's ink on the user
 * agent's default light face.
 *
 * A unit test cannot prove an iframe boundary (`tests/sandbox.test.ts`'s own reasoning),
 * so this drives a real, hidden `BrowserWindow` through the same sealed frame a Mini-app
 * runs in for a reader, generically: it never knows what a specific app does, only that
 * the toolkit's own contract (`Kit.bridge.ready()`, `Kit.bridge.action`'s `.k-btn`) holds.
 */

const READY_TIMEOUT_MS = 5_000
const ACTION_TIMEOUT_MS = 4_000
const POLL_INTERVAL_MS = 100
const MIN_CONTRAST = 3

/** An error-catching header, spliced in ahead of the toolkit so a throw on line one is caught. */
function withErrorProbe(html: string): string {
  const probe =
    '<script>window.__gateErrors = [];' +
    'window.addEventListener("error", function (e) { window.__gateErrors.push(String(e.message)) })</script>'
  return html.includes('<body>') ? html.replace('<body>', `<body>${probe}`) : probe + html
}

/**
 * The outer harness page. The Mini-app is loaded into a real `sandbox="allow-scripts"`
 * iframe on a `data:` URL, the same way `MiniApp.tsx` loads it (just against a
 * self-contained page instead of the `whetstone-app://` protocol, since staging is not a
 * Course the store has opened yet). `data:`, not `srcdoc`: `srcdoc` inherits the host
 * page's CSP, which is why production does not use it either (`src/main/index.ts`).
 */
function harnessPage(innerHtml: string): string {
  const encoded = Buffer.from(innerHtml, 'utf8').toString('base64')
  return [
    '<!doctype html><html><body>',
    `<iframe id="frame" sandbox="allow-scripts" src="data:text/html;base64,${encoded}"></iframe>`,
    '<script>',
    'window.__gate = { events: [] }',
    'window.addEventListener("message", function (event) {',
    '  var frame = document.getElementById("frame")',
    '  if (!frame || event.source !== frame.contentWindow) return',
    '  window.__gate.events.push(event.data)',
    '})',
    '</script>',
    '</body></html>',
  ].join('\n')
}

async function pollUntil(win: BrowserWindow, expression: string, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const value = (await win.webContents.executeJavaScript(expression)) as boolean
    if (value) return true
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS))
  }
  return false
}

const CONTRAST_SCRIPT = `(function () {
  function luminance(color) {
    var parts = (color.match(/[\\d.]+/g) || ['0', '0', '0']).slice(0, 3).map(function (part) {
      var value = Number(part) / 255
      return value <= 0.03928 ? value / 12.92 : Math.pow((value + 0.055) / 1.055, 2.4)
    })
    return 0.2126 * parts[0] + 0.7152 * parts[1] + 0.0722 * parts[2]
  }
  function ratio(a, b) {
    var l1 = luminance(a) + 0.05
    var l2 = luminance(b) + 0.05
    return l1 > l2 ? l1 / l2 : l2 / l1
  }
  var failures = []
  var buttons = document.querySelectorAll('button')
  for (var i = 0; i < buttons.length; i += 1) {
    var style = getComputedStyle(buttons[i])
    var value = ratio(style.color, style.backgroundColor)
    if (value < ${MIN_CONTRAST}) {
      failures.push((buttons[i].textContent || 'a button') + ' is ' + value.toFixed(2) + ':1')
    }
  }
  return failures
})()`

interface Booted {
  win: BrowserWindow
  frame: Electron.WebFrameMain
}

async function boot(html: string): Promise<Booted | undefined> {
  const win = new BrowserWindow({ show: false, webPreferences: { sandbox: true, contextIsolation: true } })
  const page = harnessPage(withErrorProbe(html))
  await win.loadURL(`data:text/html;base64,${Buffer.from(page, 'utf8').toString('base64')}`)
  const frame = win.webContents.mainFrame.frames[0]
  if (!frame) {
    win.destroy()
    return undefined
  }
  return { win, frame }
}

/**
 * One Mini-app, checked. Errors are shaped exactly like a parse error — a file and a
 * message — so they flow through the same repair loop (`src/main/build.ts`) a Constructor
 * already gets a parse error through, rather than needing a repair path of their own.
 */
export async function checkMiniApp(courseDir: string, appId: string): Promise<CourseError[]> {
  const file = `apps/${appId}/index.html`
  let raw: string
  try {
    raw = frameSource(courseDir, appId)
  } catch (cause) {
    return [{ file, message: String((cause as Error)?.message ?? cause) }]
  }

  const errors: CourseError[] = []
  const booted = await boot(raw)
  if (!booted) return [{ file, message: 'the sealed frame never loaded' }]
  const { win, frame } = booted

  try {
    const ready = await pollUntil(win, 'window.__gate.events.some(function (m) { return m && m.type === "ready" })', READY_TIMEOUT_MS)
    const bootErrors = (await frame.executeJavaScript('window.__gateErrors || []')) as string[]

    if (bootErrors.length > 0) {
      errors.push({ file, message: `throws before drawing: ${bootErrors[0]}` })
    } else if (!ready) {
      errors.push({ file, message: 'never called Kit.bridge.ready(); the activity would look stuck to a reader' })
    } else {
      const buttonCount = (await frame.executeJavaScript('document.querySelectorAll(".k-btn").length')) as number
      if (buttonCount === 0) {
        errors.push({ file, message: 'draws no Kit.bridge.action button; nothing the reader does can ever answer' })
      } else {
        let acted = false
        for (let index = 0; index < buttonCount; index += 1) {
          await frame.executeJavaScript(`document.querySelectorAll(".k-btn")[${index}].click()`)
          const responded = await pollUntil(
            win,
            'window.__gate.events.some(function (m) { return m && (m.type === "answer" || m.type === "review") })',
            ACTION_TIMEOUT_MS,
          )
          if (responded) {
            acted = true
            break
          }
        }
        if (!acted) {
          errors.push({
            file,
            message: 'pressing every action button produced no answer or review; the activity cannot be completed',
          })
        }

        const afterClick = (await frame.executeJavaScript('window.__gateErrors || []')) as string[]
        if (afterClick.length > bootErrors.length) {
          errors.push({ file, message: `throws when acted on: ${afterClick[afterClick.length - 1]}` })
        }
      }
    }
  } finally {
    win.destroy()
  }

  if (errors.length === 0) {
    for (const scheme of ['light', 'dark'] as const) {
      const previous = nativeTheme.themeSource
      nativeTheme.themeSource = scheme
      try {
        const themed = await boot(raw)
        if (themed) {
          try {
            await pollUntil(themed.win, 'window.__gate.events.some(function (m) { return m && m.type === "ready" })', READY_TIMEOUT_MS)
            const failures = (await themed.frame.executeJavaScript(CONTRAST_SCRIPT)) as string[]
            for (const failure of failures) {
              errors.push({ file, message: `a button is unreadable in ${scheme} theme: ${failure}` })
            }
          } finally {
            themed.win.destroy()
          }
        }
      } finally {
        nativeTheme.themeSource = previous
      }
    }
  }

  return errors
}

/** Every Mini-app the Course declares, checked. */
export async function checkAllMiniApps(courseDir: string, appIds: string[]): Promise<CourseError[]> {
  const errors: CourseError[] = []
  for (const appId of appIds) errors.push(...(await checkMiniApp(courseDir, appId)))
  return errors
}
