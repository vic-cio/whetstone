import { contextBridge, ipcRenderer } from 'electron'
import type { IpcRendererEvent } from 'electron'

import type { Answer, BuildResult } from '../main/build'
import type { BrokenCourse, CourseSummary, OpenResult } from '../main/courseStore'
import type { Moment } from '../shared/harness'
import type { Answered, Checked } from '../main/answering'
import type { DefectReport, Ground, Submission, Thread } from '../main/progress'
import type { PublicTask } from '../shared/format'
import type { Removal } from '../shared/remove'
import type { Evaluation } from '../shared/defect'
import type { Revision, Work } from '../main/revise'
import type { TutorReply } from '../main/tutor'
import type { Outcome } from '../shared/grade'
import type { PageType } from '../shared/format'
import type { CourseView, SittingView } from '../main/study'

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
    say: (run: string, text: string, harnessId: string, model: string): Promise<Answer> =>
      ipcRenderer.invoke('brief:say', run, text, harnessId, model),
    outline: (run: string, harnessId: string, model: string): Promise<Answer> =>
      ipcRenderer.invoke('brief:outline', run, harnessId, model),
    build: (run: string, harnessId: string, model: string, brief: string): Promise<BuildResult> =>
      ipcRenderer.invoke('brief:build', run, harnessId, model, brief),
    cancel: (): Promise<void> => ipcRenderer.invoke('brief:cancel'),
    discard: (): Promise<void> => ipcRenderer.invoke('brief:discard'),
  },

  /**
   * What a Run is doing, as it does it.
   *
   * Every run reports on one channel, so a listener is told which run each Moment came
   * from and draws only its own. Without that, grading a Task with the tutor panel open
   * puts the Grader's words into the tutor's reply and a Grader failure sets the tutor's
   * error line. The id is the one the caller minted with `newRunId` and passed in.
   */
  runs: {
    watch: (listen: (run: string, moment: Moment) => void): (() => void) => {
      const relay = (_event: IpcRendererEvent, run: string, moment: Moment): void => listen(run, moment)
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
      run: string,
      slug: string,
      testId: string,
      taskId: string,
      given: unknown,
      grading?: { harnessId: string; model: string; submission?: string[] },
    ): Promise<Answered> =>
      ipcRenderer.invoke('tasks:answer', run, slug, testId, taskId, given, grading),
    /**
     * Choose the files a `submission` Task is answered with. The dialog is filtered by the
     * Task's own `accepts`. What comes back are paths, held by the page only until it
     * submits them, because the Grader copies them into the Attempt folder itself.
     */
    attach: (accepts: string[]): Promise<string[]> => ipcRenderer.invoke('tasks:attach', accepts),

    /**
     * A Test is a sitting (docs/adr/0022). The four calls below are that sitting: read what
     * is written down, write an answer down, check one, and start again.
     *
     * `check` comes back with no outcome in it. What the page never holds it cannot show
     * early, which is the same rule that keeps a Task's answer out of the renderer.
     */
    sitting: (slug: string, testId: string): Promise<SittingView> =>
      ipcRenderer.invoke('tasks:sitting', slug, testId),
    hold: (slug: string, testId: string, taskId: string, given: unknown): Promise<SittingView> =>
      ipcRenderer.invoke('tasks:hold', slug, testId, taskId, given),
    check: (
      run: string,
      slug: string,
      testId: string,
      taskId: string,
      given: unknown,
      grading?: { harnessId: string; model: string; submission?: string[] },
    ): Promise<Checked> => ipcRenderer.invoke('tasks:check', run, slug, testId, taskId, given, grading),
    retake: (slug: string, testId: string): Promise<SittingView> =>
      ipcRenderer.invoke('tasks:retake', slug, testId),
  },

  /** The Tutor. Every call here starts with the reader pressing something. */
  tutor: {
    thread: (slug: string, pageId: string): Promise<{ thread?: Thread; attached: string[] }> =>
      ipcRenderer.invoke('tutor:thread', slug, pageId),
    attach: (chatId: string): Promise<string[]> => ipcRenderer.invoke('tutor:attach', chatId),
    ask: (
      run: string,
      slug: string,
      pageId: string,
      question: string,
      harnessId: string,
      model: string,
    ): Promise<TutorReply> =>
      ipcRenderer.invoke('tutor:ask', run, slug, pageId, question, harnessId, model),
  },

  /** Coming back to things. Both of these are offline and free (PLAN 3.15). */
  review: {
    draw: (slug: string): Promise<{ testId: string; task: PublicTask }[]> =>
      ipcRenderer.invoke('review:draw', slug),
  },

  course: {
    /** Add a Rung, or write a remediation block. A Constructor run against a Course. */
    revise: (
      run: string,
      slug: string,
      harnessId: string,
      model: string,
      work: Work,
    ): Promise<Revision> => ipcRenderer.invoke('course:revise', run, slug, harnessId, model, work),
  },

  /**
   * A Project. Done outside the app, brought back as a folder and some links, and answered
   * with one written response. There is no thread and no mark (PLAN 3.15, phase 6).
   */
  projects: {
    pick: (): Promise<string | undefined> => ipcRenderer.invoke('projects:pick'),
    list: (slug: string, projectId: string): Promise<Submission[]> =>
      ipcRenderer.invoke('projects:list', slug, projectId),
    submit: (
      run: string,
      slug: string,
      projectId: string,
      folder: string | undefined,
      links: string[],
      harnessId: string,
      model: string,
    ): Promise<{ at: 'reviewed'; submissions: Submission[] } | { at: 'trouble'; message: string }> =>
      ipcRenderer.invoke('projects:submit', run, slug, projectId, folder, links, harnessId, model),
  },

  settings: {
    roles: (): Promise<
      Record<'constructor' | 'tutor' | 'grader' | 'reviewer', { harnessId: string; model: string }>
    > =>
      ipcRenderer.invoke('settings:roles'),
    setRole: (role: string, harnessId: string, model: string): Promise<void> =>
      ipcRenderer.invoke('settings:setRole', role, harnessId, model),
    /** What a build may spend. The user's own number, kept between builds. */
    buildCap: (): Promise<number> => ipcRenderer.invoke('settings:buildCap'),
    setBuildCap: (usd: number): Promise<number> => ipcRenderer.invoke('settings:setBuildCap', usd),
    spending: (): Promise<{ kind: string; runs: number; usd: number }[]> =>
      ipcRenderer.invoke('settings:spending'),
  },

  /**
   * A defect report. Filing one records a claim; it never changes an outcome.
   *
   * Reading it is a run, and what that run says settles nothing: the reader upholds the
   * report or drops it, and only `uphold` touches the record (PLAN 3.15).
   */
  defects: {
    file: (slug: string, taskId: string, ground: Ground, note: string): Promise<string> =>
      ipcRenderer.invoke('defects:file', slug, taskId, ground, note),
    list: (slug: string): Promise<DefectReport[]> => ipcRenderer.invoke('defects:list', slug),
    evaluate: (
      run: string,
      slug: string,
      reportId: string,
      harnessId: string,
      model: string,
    ): Promise<Evaluation> =>
      ipcRenderer.invoke('defects:evaluate', run, slug, reportId, harnessId, model),
    uphold: (
      slug: string,
      reportId: string,
      overridden: boolean,
    ): Promise<
      { ok: true; taskId: string; note: string; lastInItsTest: boolean } | { ok: false; message: string }
    > => ipcRenderer.invoke('defects:uphold', slug, reportId, overridden),
    drop: (reportId: string): Promise<void> => ipcRenderer.invoke('defects:drop', reportId),
    /** What removing a Module does to the record, before the run that removes it. */
    voidModule: (slug: string, moduleId: string): Promise<string[]> =>
      ipcRenderer.invoke('defects:voidModule', slug, moduleId),
  },
  tries: {
    answer: (slug: string, lessonId: string, tryId: string, given: unknown): Promise<Outcome> =>
      ipcRenderer.invoke('tries:answer', slug, lessonId, tryId, given),
  },
}

export type WhetstoneApi = typeof api

contextBridge.exposeInMainWorld('whetstone', api)
