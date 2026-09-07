import { app, BrowserWindow, dialog, ipcMain, nativeTheme, net, protocol, shell } from 'electron'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { fileURLToPath } from 'node:url'

import { appFrame, coursesRoot, listCourses, loadCourse, openCourse, progress, setTick } from './courseStore'
import {
  OUTLINE,
  addToTray,
  briefTray,
  buildCourse,
  cancelBrief,
  discardBrief,
  harnesses,
  sendMessage,
  startBrief,
} from './newCourse'
import { removeCourse } from '../shared/remove'
import { answer } from './answering'
import { publicTask } from '../shared/format'
import { reviewSession } from '../shared/again'
import { revise } from './revise'
import { ask, attach, attached, newChat } from './tutor'
import type { Ground } from './progress'
import { fileInCourse } from '../shared/courseFile'
import { POLICY } from '../shared/miniapp'
import { answerTry, reachedEndOfLesson } from './study'
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
  // A capture can ask for a window of its own size, which is the only way to look at a
  // layout that only goes wrong on a wide screen.
  const size = (process.env['WHETSTONE_CAPTURE_SIZE'] ?? '').split('x').map(Number)
  const wide = size.length === 2 && size.every((value) => Number.isFinite(value) && value > 0)

  const window = new BrowserWindow({
    width: wide ? (size[0] as number) : 1180,
    height: wide ? (size[1] as number) : 820,
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

    // Whatever happens, this run ends. A capture that waits on a spawned harness needs
    // longer than one that only clicks through pages, so the limit is settable.
    setTimeout(() => app.exit(1), Number(process.env['WHETSTONE_CAPTURE_LIMIT'] ?? 30_000))

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

  // A Run reports as it goes, so the window draws an answer as it is typed. What crosses
  // is a `Moment`: the app's own words, never a raw event (PLAN 3.6).
  const report = (event: Electron.IpcMainInvokeEvent) => (moment: unknown) =>
    event.sender.send('run:moment', moment)

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

  // Answering. The renderer asks the same thing whichever way a Task is checked; most
  // never reach a model, and the ones that do cost money and were asked for by a press.
  ipcMain.handle(
    'tasks:answer',
    (
      event,
      slug: string,
      testId: string,
      taskId: string,
      given: unknown,
      grading?: { harnessId: string; model: string; submission?: string[] },
    ) =>
      answer(
        {
          slug,
          testId,
          taskId,
          given,
          harnessId: grading?.harnessId ?? '',
          model: grading?.model ?? '',
          ...(grading?.submission === undefined ? {} : { submission: grading.submission }),
        },
        report(event),
      ),
  )

  // ---------------------------------------------------------------- the tutor
  //
  // Nothing here runs on its own. A conversation starts cold when the reader sends the
  // first message and ends when they close it (PLAN 3.5).
  ipcMain.handle('tutor:thread', (_event, slug: string, pageId: string) => ({
    thread: progress().thread(slug, pageId),
    attached: [] as string[],
  }))

  ipcMain.handle('tutor:attach', async (_event, chatId: string) => {
    const picked = await dialog.showOpenDialog({
      title: 'Show the tutor',
      properties: ['openFile', 'multiSelections'],
    })
    return picked.canceled ? attached(chatId) : attach(chatId, picked.filePaths)
  })

  ipcMain.handle(
    'tutor:ask',
    async (
      event,
      slug: string,
      pageId: string,
      question: string,
      harnessId: string,
      model: string,
    ) => {
      const store = progress()
      const held = store.thread(slug, pageId)
      const thread = held ?? { id: newChat(), messages: [] }
      const course = loadCourse(slug)
      const pages = course.modules.flatMap((module) => module.pages)

      // A Tutor turn costs money, so it goes in the ledger. PLAN 3.4 names the Constructor
      // and the Grader only, which would leave the spend figure quietly wrong.
      const run = store.startRun({ kind: 'tutor', courseSlug: slug, harness: harnessId, model })
      const reply = await ask(
        {
          chatId: thread.id,
          courseDir: course.path,
          slug,
          harnessId,
          model,
          question,
          ...(thread.session === undefined ? {} : { resume: thread.session }),
          live: {
            ...(pages.some((page) => page.type === 'lesson' && page.id === pageId)
              ? { openLesson: pageId }
              : { openTest: pageId }),
            pagesDone: store.pagesDone(slug),
            pageCount: pages.length,
          },
        },
        report(event),
      )

      store.endRun(run, reply.usd, reply.ok ? 'ok' : 'failed')

      if (reply.ok && reply.text !== '') {
        thread.messages.push({ who: 'you', text: question }, { who: 'tutor', text: reply.text })
        if (reply.session !== '') thread.session = reply.session
        store.saveThread(slug, pageId, thread)
      }
      return reply
    },
  )

  // A review session. Deterministic Tasks only, drawn at random from Objectives the reader
  // has already touched, so it runs offline and free (PLAN 3.15).
  ipcMain.handle('review:draw', (_event, slug: string) => {
    const course = loadCourse(slug)
    const seen = progress().attemptsFor(slug)
    const testOf = new Map<string, string>()
    for (const test of Object.values(course.tests)) for (const id of test.tasks) testOf.set(id, test.id)

    return reviewSession(course, seen).flatMap((task) => {
      const testId = testOf.get(task.id)
      return testId === undefined ? [] : [{ testId, task: publicTask(task) }]
    })
  })

  // Adding a Rung, or writing a remediation block for an Objective that keeps going wrong.
  // Both copy the Course into staging and go through the parser, exactly as a build does.
  ipcMain.handle(
    'course:revise',
    (
      event,
      slug: string,
      harnessId: string,
      model: string,
      work: { kind: 'add-rung'; depth: string } | { kind: 'remediate'; objective: string; title: string },
    ) => {
      const course = loadCourse(slug)
      const run = progress().startRun({ kind: work.kind, courseSlug: slug, harness: harnessId, model })
      return revise(
        { slug, courseDir: course.path, root: coursesRoot(), harnessId, model, work },
        report(event),
      ).then((result) => {
        progress().endRun(run, result.usd, result.at === 'revised' ? 'ok' : 'failed')
        return result
      })
    },
  )

  // A claim that a Task is broken, on three grounds. It records a claim and never changes
  // an outcome, which is the whole difference between this and an appeal (PLAN 3.15).
  ipcMain.handle(
    'defects:file',
    (_event, slug: string, taskId: string, ground: Ground, note: string) =>
      progress().fileDefect({ courseSlug: slug, taskId, ground, note }),
  )
  ipcMain.handle(
    'tries:answer',
    (_event, slug: string, lessonId: string, tryId: string, given: unknown) =>
      answerTry(loadCourse(slug), lessonId, tryId, given),
  )

  // ---------------------------------------------------------------- building a course

  ipcMain.handle('harnesses:list', () => harnesses())

  // Which harness and model each role uses. One row per role (PLAN 3.12), remembered, and
  // the model list belongs to the harness so switching one resets the other.
  ipcMain.handle('settings:roles', () => {
    const store = progress()
    const read = (role: string): { harnessId: string; model: string } => ({
      harnessId: store.setting(`${role}.harness`) ?? '',
      model: store.setting(`${role}.model`) ?? '',
    })
    return { constructor: read('constructor'), tutor: read('tutor'), grader: read('grader') }
  })
  ipcMain.handle('settings:setRole', (_event, role: string, harnessId: string, model: string) => {
    progress().setSetting(`${role}.harness`, harnessId)
    progress().setSetting(`${role}.model`, model)
  })
  ipcMain.handle('brief:start', () => startBrief())
  ipcMain.handle('brief:tray', () => briefTray())
  ipcMain.handle('brief:discard', () => discardBrief())
  ipcMain.handle('brief:cancel', () => cancelBrief())

  ipcMain.handle('brief:attach', async () => {
    const picked = await dialog.showOpenDialog({
      title: 'Material for this course',
      properties: ['openFile', 'multiSelections'],
    })
    return picked.canceled ? briefTray() : addToTray(picked.filePaths, [])
  })
  ipcMain.handle('brief:link', (_event, url: string) => addToTray([], [url]))

  ipcMain.handle('brief:say', (event, text: string, harnessId: string, model: string) =>
    sendMessage(text, harnessId, model, report(event)),
  )
  ipcMain.handle('brief:outline', (event, harnessId: string, model: string) =>
    sendMessage(OUTLINE, harnessId, model, report(event)),
  )
  ipcMain.handle('brief:build', (event, harnessId: string, model: string, brief: string) =>
    buildCourse(coursesRoot(), harnessId, model, brief, report(event)),
  )

  ipcMain.handle('courses:remove', (_event, slug: string) =>
    removeCourse(
      coursesRoot(),
      slug,
      (name) => progress().forget(name),
      (folder) => shell.trashItem(folder),
    ),
  )
  // A failed build leaves its folder where it is, so there has to be a way to open it.
  ipcMain.handle('courses:reveal', (_event, folder: string) => shell.showItemInFolder(folder))

  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
