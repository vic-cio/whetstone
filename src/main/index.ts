import { app, BrowserWindow, ipcMain, nativeTheme, net, protocol, shell } from 'electron'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { fileURLToPath } from 'node:url'

import { appFrame, coursesRoot, listCourses, loadCourse, openCourse, progress, setTick } from './courseStore'
import { fileInCourse } from '../shared/courseFile'
import { POLICY } from '../shared/miniapp'
import { answerTask, answerTry, reachedEndOfLesson } from './study'
import type { PageType } from '../shared/format'

const here = fileURLToPath(new URL('.', import.meta.url))

/**
 * Images a Lesson points at live in the Course folder, which is outside the app. They
 * reach the page through a scheme of their own rather than by widening the renderer's
 * access: this serves files under the courses root and refuses everything else.
 */
protocol.registerSchemesAsPrivileged([
  { scheme: 'whetstone-course', privileges: { standard: true, secure: true, supportFetchAPI: true } },
  { scheme: 'whetstone-app', privileges: { standard: true, secure: true } },
])

function serveCourseFile(request: Request): Promise<Response> {
  const url = new URL(request.url)
  const root = join(coursesRoot(), decodeURIComponent(url.hostname))
  const file = fileInCourse(root, decodeURIComponent(url.pathname))
  if (file === undefined) return Promise.resolve(new Response('not found', { status: 404 }))
  return net.fetch(pathToFileURL(file).toString())
}

/**
 * The document a Mini-app runs in, served rather than handed to the renderer as a string.
 *
 * A frame written with `srcdoc` inherits the host page's Content Security Policy, and the
 * host page denies inline scripts, so a Mini-app served that way could never run. A scheme
 * of its own gives the frame a response with its own policy, and `sandbox="allow-scripts"`
 * still leaves it on an opaque origin with no reach into the host.
 */
function serveMiniApp(request: Request): Response {
  const url = new URL(request.url)
  const headers = {
    'Content-Type': 'text/html; charset=utf-8',
    'Content-Security-Policy': POLICY,
  }
  try {
    const document = appFrame(decodeURIComponent(url.hostname), decodeURIComponent(url.pathname).replace(/^\/+/, ''))
    return new Response(document, { headers })
  } catch (cause) {
    // A Course the parser accepted always has its mini-apps, so this is a broken folder
    // rather than a broken app, and saying so beats an empty rectangle.
    return new Response(`<p>${(cause as Error).message}</p>`, { status: 404, headers })
  }
}

function createWindow(): void {
  const window = new BrowserWindow({
    width: 1180,
    height: 820,
    minWidth: 720,
    show: false,
    title: 'Whetstone',
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#f5f4f1',
    webPreferences: {
      preload: join(here, '../preload/index.mjs'),
      // The renderer runs untrusted generated content in sandboxed frames, so it gets
      // no Node access of its own and reaches the main process only over typed IPC.
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  window.once('ready-to-show', () => window.show())

  // A development affordance: render once, write a screenshot, and exit. This lets the
  // real window be checked without a person at the keyboard, and it does nothing unless
  // WHETSTONE_CAPTURE names a file to write.
  const capture = process.env['WHETSTONE_CAPTURE']
  if (capture) {
    const theme = process.env['WHETSTONE_THEME']
    if (theme === 'light' || theme === 'dark') nativeTheme.themeSource = theme

    // WHETSTONE_CAPTURE_STEPS is a JSON array of expressions run in the page, one per
    // step, so a capture can reach a Lesson or a Test rather than only the first screen.
    const steps: string[] = JSON.parse(process.env['WHETSTONE_CAPTURE_STEPS'] ?? '[]')
    const wait = (ms: number): Promise<void> => new Promise((done) => setTimeout(done, ms))
    // How long to leave between steps. A capture that has to wait for a sandboxed frame
    // to draw and report needs longer than one that only clicks through pages.
    const pause = Number(process.env['WHETSTONE_CAPTURE_WAIT'] ?? 600)

    // Whatever happens, this run ends.
    setTimeout(() => app.exit(1), 30_000)

    window.webContents.once('did-finish-load', () => {
      void (async () => {
        await wait(900)
        for (const step of steps) {
          // A step that misses is reported and skipped. A capture must always produce a
          // png: a hung one is a debugging session, not a check.
          const failure = await window.webContents.executeJavaScript(
            `(() => { try { ${step}; return '' } catch (error) { return String(error) } })()`,
            true,
          )
          if (failure !== '') console.error(`capture step failed: ${step} -> ${failure}`)
          await wait(pause)
        }
        const image = await window.webContents.capturePage()
        const { writeFileSync } = await import('node:fs')
        writeFileSync(capture, image.toPNG())
        writeFileSync(`${capture}.txt`, await window.webContents.executeJavaScript('document.body.innerText'))
        // A capture can also carry a value out of the page. A step puts it on
        // `window.__probe`, and it lands beside the png as JSON. This is how the sandbox
        // check reads what a sealed frame managed to reach.
        writeFileSync(
          `${capture}.json`,
          await window.webContents.executeJavaScript('JSON.stringify(window.__probe ?? null)', true),
        )
        app.quit()
      })()
    })
  }

  // A Course's Resources are links out. They open in the real browser, never in the app.
  window.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })

  const devServer = process.env['ELECTRON_RENDERER_URL']
  if (devServer) void window.loadURL(devServer)
  else void window.loadFile(join(here, '../renderer/index.html'))
}

app.whenReady().then(() => {
  protocol.handle('whetstone-course', serveCourseFile)
  protocol.handle('whetstone-app', (request) => serveMiniApp(request))

  // One handler per thing the reader can do. Answering happens here rather than in the
  // renderer, so an answer never crosses the bridge and an Attempt cannot be skipped.
  ipcMain.handle('courses:list', () => listCourses())
  ipcMain.handle('courses:open', (_event, slug: string) => openCourse(slug))

  ipcMain.handle(
    'progress:setTick',
    (_event, slug: string, pageId: string, pageType: PageType, ticked: boolean) =>
      setTick(slug, pageId, pageType, ticked),
  )
  ipcMain.handle('progress:reachedEnd', (_event, slug: string, lessonId: string) => {
    const course = loadCourse(slug)
    reachedEndOfLesson(slug, course, progress(), lessonId)
    return openCourse(slug)
  })

  ipcMain.handle(
    'tasks:answer',
    (_event, slug: string, testId: string, taskId: string, given: unknown) => {
      const course = loadCourse(slug)
      return answerTask(slug, course, progress(), testId, taskId, given)
    },
  )
  ipcMain.handle(
    'tries:answer',
    (_event, slug: string, lessonId: string, tryId: string, given: unknown) =>
      answerTry(loadCourse(slug), lessonId, tryId, given),
  )

  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
