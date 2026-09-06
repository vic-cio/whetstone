import { contextBridge, ipcRenderer } from 'electron'
import type { IpcRendererEvent } from 'electron'

import type { Answer, BuildResult } from '../main/build'
import type { BrokenCourse, CourseSummary, OpenResult } from '../main/courseStore'
import type { Moment } from '../shared/harness'
import type { Removal } from '../shared/remove'
import type { Outcome } from '../shared/grade'
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
    remove: (slug: string): Promise<Removal> => ipcRenderer.invoke('courses:remove', slug),
    reveal: (folder: string): Promise<void> => ipcRenderer.invoke('courses:reveal', folder),
  },

  /**
   * Building a Course. Everything here starts with the user pressing something: a Brief
   * message, an outline, or a build. Nothing on this namespace runs on its own.
   */
  brief: {
    harnesses: (): Promise<{
      harnesses: { id: string; label: string; models: string[]; installed: boolean }[]
      errors: string[]
    }> => ipcRenderer.invoke('harnesses:list'),
    start: (): Promise<{ id: string }> => ipcRenderer.invoke('brief:start'),
    tray: (): Promise<string[]> => ipcRenderer.invoke('brief:tray'),
    attach: (): Promise<string[]> => ipcRenderer.invoke('brief:attach'),
    link: (url: string): Promise<string[]> => ipcRenderer.invoke('brief:link', url),
    say: (text: string, harnessId: string, model: string): Promise<Answer> =>
      ipcRenderer.invoke('brief:say', text, harnessId, model),
    outline: (harnessId: string, model: string): Promise<Answer> =>
      ipcRenderer.invoke('brief:outline', harnessId, model),
    build: (harnessId: string, model: string, brief: string): Promise<BuildResult> =>
      ipcRenderer.invoke('brief:build', harnessId, model, brief),
    cancel: (): Promise<void> => ipcRenderer.invoke('brief:cancel'),
    discard: (): Promise<void> => ipcRenderer.invoke('brief:discard'),
    /** What a Run is doing, as it does it. Returns the way to stop listening. */
    watch: (listen: (moment: Moment) => void): (() => void) => {
      const relay = (_event: IpcRendererEvent, moment: Moment): void => listen(moment)
      ipcRenderer.on('run:moment', relay)
      return () => {
        ipcRenderer.off('run:moment', relay)
      }
    },
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
  tries: {
    answer: (slug: string, lessonId: string, tryId: string, given: unknown): Promise<Outcome> =>
      ipcRenderer.invoke('tries:answer', slug, lessonId, tryId, given),
  },
}

export type WhetstoneApi = typeof api

contextBridge.exposeInMainWorld('whetstone', api)
