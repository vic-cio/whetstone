import { app } from 'electron'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

import { agentDir, roleFile } from './harness'
import { offerSkills, seedSkills } from '../shared/staging'
import { writeLive } from '../shared/snapshot'
import type { AgentProfile, Role } from '../shared/harness'
import type { Live } from '../shared/snapshot'

/**
 * The folders the app gives a run for its own use.
 *
 * None of them is a Course. A Tutor reads a Course and may not change a byte of it
 * (PLAN 3.14), so everything the run needs that is not Course content lives out here: the
 * skills it was given, the snapshot of what the reader is doing, the files the reader
 * attached, and the copy the Course is put back from if the run writes anyway.
 */

function under(what: string, id: string): string {
  const dir = join(app.getPath('userData'), what, id)
  mkdirSync(dir, { recursive: true })
  return dir
}

/** One Tutor conversation's folder: its attachments, its snapshot, its skills. */
export const chatDir = (id: string): string => under('chats', id)

/** One Attempt's folder: the Task, what the reader did, and the Rubric to score it by. */
export const attemptDir = (id: string): string => under('attempts', id)

/** Where a Course is copied to before a run, so it can be put back after one. */
export const shadowDir = (id: string): string => under('shadow', id)

/**
 * Where a harness may keep its own session state.
 *
 * Found by running one. `pi` writes a `.pi/` folder into its working directory unless it is
 * told otherwise, and that directory is a Course or a Course being built: for a build it
 * would travel into the library, and for a Tutor it would trip the guard that puts a
 * changed Course back.
 */
export const stateFor = (id: string): string => under('harness-state', id)

/**
 * Lay out a folder for a run: its skills, and the snapshot of what the reader is doing.
 *
 * Both are files the prompt names. Nothing here depends on a harness having a plugin
 * system, a discovery folder, or a way to be told anything except a path (docs/adr/0021).
 */
export function furnish(dir: string, set: string, live: Live): { skills: string[]; live: string } {
  seedSkills(dir, join(agentDir(), 'skills', set))
  const path = writeLive(dir, live)
  return { skills: offerSkills(dir), live: path }
}

/**
 * A role that reads and answers and does nothing else.
 *
 * `restricted` as well as an allowance of `read` alone, because two mechanisms that must
 * both fail is the point of PLAN 3.14, and because a recorded run proved that the second
 * one catches a call the first never offered.
 */
export function readerProfile(
  role: Role,
  cwd: string,
  budgetUsd: number,
  alsoRead: string[],
  /**
   * Keyed to the conversation rather than to the spawn. A new folder per spawn means the
   * next turn looks for its own session in a directory that has never seen one, and the
   * harness says "no session found matching ..." and starts again.
   */
  conversation = 'once',
): AgentProfile {
  return {
    role,
    cwd,
    plugins: [],
    can: ['read'],
    budgetUsd,
    restricted: true,
    instructions: roleFile(role),
    alsoRead,
    stateDir: stateFor(`${role}-${conversation}`),
  }
}
