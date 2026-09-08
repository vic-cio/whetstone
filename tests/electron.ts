import { tmpdir } from 'node:os'
import { join } from 'node:path'

/**
 * Electron, for a test.
 *
 * `src/main/` imports `electron` at module scope, so until this existed nothing under
 * `src/main/` that touches it could be tested at all: the rules lived in a module vitest
 * could not load. This is the smallest thing that makes them loadable.
 *
 * It is deliberately inert. Anything a test actually depends on is set through the
 * environment the app already honours, such as `WHETSTONE_STAGING` and `WHETSTONE_DB`, so
 * this stub never has to grow behaviour and never has to be kept honest against Electron.
 */
export const app = {
  getPath: (name: string): string => join(tmpdir(), 'whetstone-test', name),
  whenReady: async (): Promise<void> => undefined,
  on: (): void => undefined,
  exit: (): void => undefined,
  quit: (): void => undefined,
}

export const ipcMain = { handle: (): void => undefined, on: (): void => undefined }
export const dialog = { showOpenDialog: async (): Promise<unknown> => ({ canceled: true }) }
export const shell = { openExternal: async (): Promise<void> => undefined }
export const nativeTheme = { themeSource: 'system' }
export const net = { fetch: async (): Promise<unknown> => undefined }
export const protocol = { handle: (): void => undefined, registerSchemesAsPrivileged: (): void => undefined }
export class BrowserWindow {
  static getAllWindows(): unknown[] {
    return []
  }
}
