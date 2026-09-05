import { contextBridge, ipcRenderer } from 'electron'

import type { BrokenCourse, CourseSummary } from '../main/courseStore'

/**
 * The only bridge out of the renderer. One namespace per feature, no generic `invoke`,
 * so the surface the renderer can reach stays readable and small.
 */
const api = {
  courses: {
    list: (): Promise<{ courses: CourseSummary[]; broken: BrokenCourse[] }> =>
      ipcRenderer.invoke('courses:list'),
  },
}

export type WhetstoneApi = typeof api

contextBridge.exposeInMainWorld('whetstone', api)
