import { app, BrowserWindow, ipcMain, nativeTheme, shell } from 'electron'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { listCourses } from './courseStore'

const here = fileURLToPath(new URL('.', import.meta.url))

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
    window.webContents.once('did-finish-load', () => {
      setTimeout(() => {
        void window.webContents.capturePage().then(async (image) => {
          const { writeFileSync } = await import('node:fs')
          writeFileSync(capture, image.toPNG())
          writeFileSync(`${capture}.txt`, await window.webContents.executeJavaScript('document.body.innerText'))
          app.quit()
        })
      }, 1500)
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
  ipcMain.handle('courses:list', () => listCourses())

  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
