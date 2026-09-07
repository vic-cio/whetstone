import { contextBridge, ipcRenderer } from 'electron'
import type { IpcRendererEvent } from 'electron'

import type { Answer, BuildResult } from '../main/build'
import type { BrokenCourse, CourseSummary, OpenResult } from '../main/courseStore'
import type { Moment } from '../shared/harness'
import type { Answered } from '../main/answering'
import type { Ground, Thread } from '../main/progress'
import type { PublicTask } from '../shared/format'
import type { Removal } from '../shared/remove'
import type { Revision } from '../main/revise'
import type { TutorReply } from '../main/tutor'
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
    /** Share a Course. It is a folder, so it is a zip of that folder and nothing else. */
    export: (slug: string): Promise<{ ok: boolean; file?: string; message?: string }> =>
      ipcRenderer.invoke('courses:export', slug),
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
    /**
     * Answer a Task. `grading` is only read when the Task's Check is not deterministic,
     * which is most of the time it is not read at all.
     */
    answer: (
      slug: string,
      testId: string,
      taskId: string,
      given: unknown,
      grading?: { harnessId: string; model: string; submission?: string[] },
    ): Promise<Answered> => ipcRenderer.invoke('tasks:answer', slug, testId, taskId, given, grading),
  },

  /** The Tutor. Every call here starts with the reader pressing something. */
  tutor: {
    thread: (slug: string, pageId: string): Promise<{ thread?: Thread; attached: string[] }> =>
      ipcRenderer.invoke('tutor:thread', slug, pageId),
    attach: (chatId: string): Promise<string[]> => ipcRenderer.invoke('tutor:attach', chatId),
    ask: (
      slug: string,
      pageId: string,
      question: string,
      harnessId: string,
      model: string,
    ): Promise<TutorReply> => ipcRenderer.invoke('tutor:ask', slug, pageId, question, harnessId, model),
  },

  /** Coming back to things. Both of these are offline and free (PLAN 3.15). */
  review: {
    draw: (slug: string): Promise<{ testId: string; task: PublicTask }[]> =>
      ipcRenderer.invoke('review:draw', slug),
  },

  course: {
    /** Add a Rung, or write a remediation block. A Constructor run against a Course. */
    revise: (
      slug: string,
      harnessId: string,
      model: string,
      work: { kind: 'add-rung'; depth: string } | { kind: 'remediate'; objective: string; title: string },
    ): Promise<Revision> => ipcRenderer.invoke('course:revise', slug, harnessId, model, work),
  },

  settings: {
    roles: (): Promise<Record<'constructor' | 'tutor' | 'grader', { harnessId: string; model: string }>> =>
      ipcRenderer.invoke('settings:roles'),
    setRole: (role: string, harnessId: string, model: string): Promise<void> =>
      ipcRenderer.invoke('settings:setRole', role, harnessId, model),
    spending: (): Promise<{ kind: string; runs: number; usd: number }[]> =>
      ipcRenderer.invoke('settings:spending'),
  },

  defects: {
    file: (slug: string, taskId: string, ground: Ground, note: string): Promise<string> =>
      ipcRenderer.invoke('defects:file', slug, taskId, ground, note),
  },
  tries: {
    answer: (slug: string, lessonId: string, tryId: string, given: unknown): Promise<Outcome> =>
      ipcRenderer.invoke('tries:answer', slug, lessonId, tryId, given),
  },
}

export type WhetstoneApi = typeof api

contextBridge.exposeInMainWorld('whetstone', api)
