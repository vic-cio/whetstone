import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

/**
 * The live snapshot: how an agent sees what the reader is doing, with no API to ask.
 *
 * It is written once, immediately before a spawn, and never otherwise (PLAN 3.7). Strudel++
 * rewrites its equivalent every 500 milliseconds because a harness sits open beside a live
 * editor. Nothing is listening here for the rest of the time, so a background writer would
 * be work done for nobody, and a file rewritten twice a second is a file that is wrong
 * every other time somebody reads it.
 *
 * It goes in the folder the run was given for its own use, never in the Course folder. The
 * Course is content the Constructor wrote and the Tutor may not change a byte of it
 * (PLAN 3.14), and a file the app rewrites before every message is a change.
 */

export const LIVE = '.whetstone-live.json'

export interface Live {
  updated: string
  course: string
  /** The Page open when the user asked. This is what "why was I wrong" is usually about. */
  openLesson?: string
  openTest?: string
  openTask?: string
  lastVerdict?: { taskId: string; outcome: string; at: string }
  /**
   * Which Pages are ticked. Not an ability estimate: the app keeps none and would not put
   * one in front of an agent if it did (PLAN 3.4).
   */
  pagesDone: number
  pageCount: number
  /** What the reader attached to this conversation, by name, so the run knows to look. */
  attached: string[]
  online: boolean
}

/** Write the snapshot where a run can read it, and return the path it was told to read. */
export function writeLive(dir: string, live: Live): string {
  const file = join(dir, LIVE)
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, `${JSON.stringify(live, null, 2)}\n`)
  return file
}
