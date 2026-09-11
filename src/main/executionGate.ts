import { nativeTheme } from 'electron'

import { frameSource } from '../shared/miniapp'
import { boot, pollUntil, withErrorProbe } from './sandboxHarness'
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
const MIN_CONTRAST = 3

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

/**
 * One Mini-app, checked. Errors are shaped exactly like a parse error — a file and a
 * message — so they flow through the same repair loop (`src/main/build.ts`) a Constructor
 * already gets a parse error through, rather than needing a repair path of their own.
 */
export async function checkMiniApp(courseDir: string, appId: string, cacheRoot: string): Promise<CourseError[]> {
  const file = `apps/${appId}/index.html`
  let raw: string
  try {
    raw = frameSource(courseDir, appId, cacheRoot)
  } catch (cause) {
    return [{ file, message: String((cause as Error)?.message ?? cause) }]
  }

  const errors: CourseError[] = []
  const booted = await boot(withErrorProbe(raw))
  if (!booted) return [{ file, message: 'the sealed frame never loaded' }]
  const { win, frame, cleanup } = booted

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
    cleanup()
  }

  if (errors.length === 0) {
    for (const scheme of ['light', 'dark'] as const) {
      const previous = nativeTheme.themeSource
      nativeTheme.themeSource = scheme
      try {
        const themed = await boot(withErrorProbe(raw))
        if (themed) {
          try {
            await pollUntil(themed.win, 'window.__gate.events.some(function (m) { return m && m.type === "ready" })', READY_TIMEOUT_MS)
            const failures = (await themed.frame.executeJavaScript(CONTRAST_SCRIPT)) as string[]
            for (const failure of failures) {
              errors.push({ file, message: `a button is unreadable in ${scheme} theme: ${failure}` })
            }
          } finally {
            themed.win.destroy()
            themed.cleanup()
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
export async function checkAllMiniApps(courseDir: string, appIds: string[], cacheRoot: string): Promise<CourseError[]> {
  const errors: CourseError[] = []
  for (const appId of appIds) errors.push(...(await checkMiniApp(courseDir, appId, cacheRoot)))
  return errors
}
