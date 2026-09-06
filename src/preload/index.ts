import { contextBridge, ipcRenderer } from 'electron'

import type { BrokenCourse, CourseSummary, OpenResult } from '../main/courseStore'
import type { Outcome } from '../shared/grade'
import type { ServiceReply } from '../shared/services'
import type { PageType } from '../shared/format'
import type { CourseView } from '../main/study'

/**
 * The only bridge out of the renderer. One namespace per feature, no generic `invoke`,
 * so the surface the renderer can reach stays readable and small.
 *
 * Answering lives on the other side of this line. The renderer sends what the user did
 * and receives an outcome; it never holds the answer and cannot record an Attempt itself.
 */
const api = {
  courses: {
    list: (): Promise<{ courses: CourseSummary[]; broken: BrokenCourse[] }> =>
      ipcRenderer.invoke('courses:list'),
    open: (slug: string): Promise<OpenResult> => ipcRenderer.invoke('courses:open', slug),
  },
  progress: {
    setTick: (slug: string, pageId: string, pageType: PageType, ticked: boolean): Promise<CourseView> =>
      ipcRenderer.invoke('progress:setTick', slug, pageId, pageType, ticked),
    reachedEnd: (slug: string, lessonId: string): Promise<OpenResult> =>
      ipcRenderer.invoke('progress:reachedEnd', slug, lessonId),
  },
  tasks: {
    answer: (
      slug: string,
      testId: string,
      taskId: string,
      given: unknown,
    ): Promise<{ outcome: Outcome; ticked: boolean }> =>
      ipcRenderer.invoke('tasks:answer', slug, testId, taskId, given),
  },
  services: {
    /**
     * A Mini-app asking the host for something a sealed frame cannot carry. The renderer
     * only carries the question across; the main process decides whether to answer it.
     */
    ask: (slug: string, service: string, request: unknown): Promise<ServiceReply> =>
      ipcRenderer.invoke('services:ask', slug, service, request),
  },
  tries: {
    answer: (slug: string, lessonId: string, tryId: string, given: unknown): Promise<Outcome> =>
      ipcRenderer.invoke('tries:answer', slug, lessonId, tryId, given),
  },
}

export type WhetstoneApi = typeof api

contextBridge.exposeInMainWorld('whetstone', api)
