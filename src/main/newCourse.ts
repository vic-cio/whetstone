import { randomUUID } from 'node:crypto'
import { existsSync, rmSync } from 'node:fs'
import { join } from 'node:path'

import { build, harnessById, open, say, stagingRoot, stopLive } from './build'
import { catalog, installed, registry } from './harness'
import { progress } from './courseStore'
import { trayContents } from '../shared/staging'
import type { BuildResult, Choice, Tray } from './build'
import type { Moment } from '../shared/harness'
import type { Answer } from './build'

/**
 * One Brief, from the first message to the Course landing in the library.
 *
 * A Brief is a conversation and the app holds one at a time, because the screen holds one
 * at a time. Its folder is made when the Brief opens and becomes the staging folder if the
 * user goes on to build, which is what lets a file attached in the conversation be
 * something the build can read (PLAN 3.19).
 */

interface Brief {
  id: string
  folder: string
  /** The harness's own session, so every message is one conversation rather than several. */
  session?: string
  tray: Tray
  usd: number
}

let current: Brief | undefined

/** A run reports through here, so the window can draw it as it happens. */
export type Report = (moment: Moment) => void

export function startBrief(): { id: string } {
  discardBrief()
  const id = randomUUID()
  const folder = join(stagingRoot(), id)
  current = { id, folder, tray: { files: [], links: [] }, usd: 0 }
  open(folder, current.tray)
  return { id }
}

/** Add a file or a link to the tray. Both are copied into staging, where a run can read them. */
export function addToTray(files: string[], links: string[]): string[] {
  if (!current) return []
  current.tray.files.push(...files)
  current.tray.links.push(...links)
  // The folder is laid out again rather than added to, so the tray on disk is the tray.
  open(current.folder, current.tray)
  return trayContents(current.folder)
}

export function briefTray(): string[] {
  return current ? trayContents(current.folder) : []
}

/**
 * What each Run costs at most.
 *
 * A Brief message is small; a build is minutes of work. The build cap is the user's, set in
 * the New Course screen and kept in settings, because three dollars is a guess about a
 * model whose price the app does not know: a cheap one never reaches it and an expensive
 * one on a long course stops halfway. A message stays cheap whatever the build is set to.
 */
const FALLBACK = 3
export const buildCap = (): number => {
  const set = Number(progress().setting('constructor.cap') ?? '')
  return Number.isFinite(set) && set > 0 ? set : FALLBACK
}
const caps = (): { talk: number; build: number } => {
  const build = buildCap()
  return { build, talk: Math.min(0.4, build) }
}

function choiceFor(harnessId: string, model: string, capUsd: number): Choice {
  return { harnessId, model, capUsd }
}

export async function sendMessage(prompt: string, harnessId: string, model: string, report: Report): Promise<Answer> {
  if (!current) return { ok: false, text: '', session: '', usd: 0, message: 'There is no course being planned.' }
  const brief = current

  const run = progress().startRun({ kind: 'brief', harness: harnessId, model })
  const answer = await say(brief.folder, choiceFor(harnessId, model, caps().talk), prompt, brief.session, report)
  progress().endRun(run, answer.usd, answer.ok ? 'ok' : 'failed')

  if (answer.session !== '') brief.session = answer.session
  brief.usd += answer.usd
  return answer
}

/** The outline is a message in the same conversation, not a different kind of thing. */
export const OUTLINE =
  'Propose the course now, as a message. Give the one-sentence goal, the Objectives, the ' +
  'Ladder with a line on why those Rungs, and the Modules with their Pages marked as Lesson ' +
  'or Test. Write nothing to disk.'

export async function buildCourse(
  root: string,
  harnessId: string,
  model: string,
  brief: string,
  report: Report,
): Promise<BuildResult> {
  if (!current) {
    return { ok: false, folder: '', errors: [], attempts: 0, usd: 0, message: 'There is no course being planned.' }
  }
  const here = current
  const run = progress().startRun({ kind: 'build', harness: harnessId, model })

  const result = await build(
    here.folder,
    root,
    choiceFor(harnessId, model, caps().build),
    brief,
    here.session,
    report,
  )
  here.usd += result.usd
  progress().endRun(run, result.usd, result.ok ? 'ok' : 'failed')

  // A Course that made it into the library leaves nothing behind. One that did not keeps
  // its folder, so it can be opened, until the next build replaces it.
  if (result.ok) current = undefined
  return result
}

/** Stop the run. A cancelled Brief bins its folder: there is no resume (PLAN 3.19). */
export function cancelBrief(): void {
  stopLive()
  discardBrief()
}

export function discardBrief(): void {
  if (current && existsSync(current.folder)) rmSync(current.folder, { recursive: true, force: true })
  current = undefined
}

/** What Settings and the build line show: every harness, and whether it is on the machine. */
export async function harnesses(): Promise<{
  harnesses: { id: string; label: string; models: string[]; installed: boolean }[]
  errors: string[]
}> {
  const found = registry()
  const catalogues = await Promise.all(found.harnesses.map((entry) => catalog(entry)))
  return {
    harnesses: found.harnesses.map((entry, index) => ({
      id: entry.id,
      label: entry.label,
      // The registry's own handful first, because it is the curated one, then whatever the
      // CLI says it can reach. A model that is in both is listed once.
      models: [
        ...entry.models,
        ...(catalogues[index] ?? []).filter((model) => !entry.models.includes(model)),
      ],
      // A harness that is not installed is still listed, greyed, naming what to install.
      // Hiding it leaves the user guessing.
      installed: installed(entry),
    })),
    errors: found.errors,
  }
}

export const known = (id: string): boolean => harnessById(id) !== undefined
