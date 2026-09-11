import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { BrowserWindow } from 'electron'

/**
 * Driving a real `sandbox="allow-scripts"` frame in a hidden `BrowserWindow`, the same
 * sealed-frame machinery a Mini-app runs in for a reader. Shared by the Mini-app execution
 * gate (`executionGate.ts`) and the runtime boot-verify (`runtimeFetch.ts`, docs/adr/0026),
 * since both need to prove real code actually runs before something ships.
 *
 * Pages are written to temp files rather than `data:` URLs: `BrowserWindow.loadURL` hard-fails
 * (`ERR_INVALID_URL`) once a `data:` URL gets into the multi-megabyte range, which an inlined
 * language runtime reaches easily. `srcdoc` is not an option either — it inherits the host
 * page's CSP, which is why production does not use it (`src/main/index.ts`).
 */

export interface Booted {
  win: BrowserWindow
  frame: Electron.WebFrameMain
  /** Removes the temp files this boot wrote. Call once the caller is done with `win`/`frame`. */
  cleanup: () => void
}

/** An error-catching header, spliced in ahead of the page's own script so a throw on line one is caught. */
export function withErrorProbe(html: string): string {
  const probe =
    '<script>window.__gateErrors = [];' +
    'window.addEventListener("error", function (e) { window.__gateErrors.push(String(e.message)) })</script>'
  return html.includes('<body>') ? html.replace('<body>', `<body>${probe}`) : probe + html
}

function harnessPage(innerHtmlPath: string): string {
  return [
    '<!doctype html><html><body>',
    `<iframe id="frame" sandbox="allow-scripts" src="file://${innerHtmlPath}"></iframe>`,
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

export async function pollUntil(win: BrowserWindow, expression: string, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const value = (await win.webContents.executeJavaScript(expression)) as boolean
    if (value) return true
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  return false
}

/** Boot one sealed-frame page for real. `undefined` if the frame never attached. */
export async function boot(html: string): Promise<Booted | undefined> {
  const win = new BrowserWindow({ show: false, webPreferences: { sandbox: true, contextIsolation: true } })
  const dir = mkdtempSync(join(tmpdir(), 'whetstone-sandbox-'))
  const innerPath = join(dir, 'inner.html')
  const outerPath = join(dir, 'outer.html')
  writeFileSync(innerPath, html)
  writeFileSync(outerPath, harnessPage(innerPath))
  const cleanup = (): void => rmSync(dir, { recursive: true, force: true })

  await win.loadFile(outerPath)
  const frame = win.webContents.mainFrame.frames[0]
  if (!frame) {
    win.destroy()
    cleanup()
    return undefined
  }
  return { win, frame, cleanup }
}
