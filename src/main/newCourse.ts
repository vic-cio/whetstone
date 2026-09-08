import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { build, harnessById, open, say, stagingRoot, stopLive } from './build'
import { catalog, installed, registry } from './harness'
import { progress } from './courseStore'
import { HOUSE, trayContents } from '../shared/staging'
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
  /** The conversation the build was told to build, kept so it can be told again. */
  transcript?: string
  harnessId?: string
  model?: string
}

/**
 * What a stopped build leaves behind, so it can be picked up.
 *
 * A run that hits a usage limit stops in the middle, and the limit resets hours later, by
 * which time the app has been closed. So the Brief is written into its own staging folder
 * rather than only held in memory: the session to resume, the conversation the build was
 * given, and which harness it was using. It lives under `.whetstone/`, which is the app's
 * own and is removed at the gate, so it never travels with a Course.
 */
const STATE = 'brief.json'

interface Stopped {
  folder: string
  at: string
  transcript: string
  harnessId: string
  model: string
  session?: string
}

let current: Brief | undefined

/**
 * Whether a build is going.
 *
 * The build runs here, in the main process, so it survives the window navigating away from
 * it. What did not survive was the folder: leaving the New Course screen calls
 * `discardBrief`, which deletes the staging folder the run is writing into. Somebody
 * clicking Home two minutes into a twenty-minute build destroyed it and was told nothing.
 *
 * So a Brief that is building is not discardable. Stop is the only thing that ends a build.
 */
let running: { since: number } | undefined

/**
 * A build that stopped part way, and is being kept.
 *
 * A usage limit is the ordinary case: the run dies mid-course, the limit resets in hours,
 * and everything it wrote is still on disk and still usable. Binning that because somebody
 * closed the failure screen is the difference between an interruption and a loss.
 */
let kept = false

export const buildingNow = (): { building: boolean; since?: number } =>
  running === undefined ? { building: false } : { building: true, since: running.since }

/**
 * The two ends of a build, as one thing rather than two assignments.
 *
 * `buildCourse` calls both, and so does the test that proves a building Brief survives being
 * asked to bin itself. That rule is the reason this state exists, so it is worth being able
 * to check without spawning a harness for twenty minutes.
 */
export function buildStarted(): void {
  running = { since: Date.now() }
}

export function buildEnded(): void {
  running = undefined
}

/** A run reports through here, so the window can draw it as it happens. */
export type Report = (moment: Moment) => void

export function startBrief(): { id: string } {
  // Starting another course is the one thing that throws a stopped build away, because it
  // is the one thing that says the reader is finished with it.
  dropBrief()
  const id = randomUUID()
  const folder = join(stagingRoot(), id)
  current = { id, folder, tray: { files: [], links: [] }, usd: 0 }
  open(folder, current.tray)
  return { id }
}

/**
 * Clear out staging folders nothing is coming back to.
 *
 * A folder is left behind by every Brief: one that was abandoned, one whose app was killed
 * mid-build, one from a course that was built weeks ago. Nothing ever removed them, so they
 * accumulated, each carrying a toolkit, a set of skills and a part-written course.
 *
 * The newest folder holding a stopped build is kept, because that is the one the reader is
 * offered back. Everything else older than a day goes. Nothing from this session is touched,
 * so a Brief being written now is never swept from under it.
 */
export function sweepStaging(): number {
  const root = stagingRoot()
  if (!existsSync(root)) return 0

  const keep = resumable()?.at
  const day = Date.now() - 24 * 60 * 60 * 1000
  let gone = 0

  for (const name of readdirSync(root)) {
    const folder = join(root, name)
    if (folder === keep || folder === current?.folder) continue
    try {
      if (statSync(folder).mtimeMs > day) continue
      // Never a folder holding written work. What is swept is the layout a Brief leaves
      // behind when nothing came of it: a toolkit, a set of skills, an empty tray.
      if (holdsWork(folder)) continue
      rmSync(folder, { recursive: true, force: true })
      gone += 1
    } catch {
      // A folder that will not go is not worth failing a launch over.
    }
  }
  return gone
}

/** Throw the Brief away, stopped build and all. Only a deliberate act calls this. */
export function dropBrief(): void {
  if (running !== undefined) return
  kept = false
  // The stopped build the reader is throwing away is usually not this session's Brief. The
  // app was closed while a usage limit reset, so `current` is empty and the folder is known
  // only from disk. Without this, the folder stayed and the offer came straight back.
  const left = resumable()
  discardBrief()
  if (left !== undefined) rmSync(left.at, { recursive: true, force: true })
}

/** Write down what a stopped build would need to carry on, beside what it has written. */
function remember(brief: Brief): void {
  if (brief.transcript === undefined) return
  const state: Stopped = {
    folder: brief.folder,
    at: new Date().toISOString(),
    transcript: brief.transcript,
    harnessId: brief.harnessId ?? '',
    model: brief.model ?? '',
    ...(brief.session === undefined ? {} : { session: brief.session }),
  }
  mkdirSync(join(brief.folder, HOUSE), { recursive: true })
  writeFileSync(join(brief.folder, HOUSE, STATE), `${JSON.stringify(state, null, 2)}\n`)
}

/**
 * A build that stopped and is still on disk, if there is one.
 *
 * Read from the folders rather than from memory, so it survives the app being closed, which
 * is what happens while a usage limit resets. The newest one wins: the app holds one Brief
 * at a time, so there is only ever one worth offering.
 */
export interface Left {
  at: string
  started: string
  /**
   * False for a build that stopped before the app knew how to write down what it would
   * need. Those cannot be carried on, because the conversation and the harness session are
   * gone, but what they wrote is still on disk and is still the reader's.
   */
  canResume: boolean
}

export function resumable(): Left | undefined {
  const root = stagingRoot()
  if (!existsSync(root)) return undefined

  let best: { folder: string; at: string; canResume: boolean } | undefined
  for (const name of readdirSync(root)) {
    const folder = join(root, name)
    const file = join(folder, HOUSE, STATE)

    if (existsSync(file)) {
      try {
        const state = JSON.parse(readFileSync(file, 'utf8')) as Stopped
        if (!best?.canResume || state.at > best.at) best = { folder, at: state.at, canResume: true }
        continue
      } catch {
        // A half-written state file falls through to the test below, which is about the
        // course rather than about the state.
      }
    }
    // No state, but something was written. A build interrupted by an older version of this
    // app leaves exactly this, and it is still somebody's work.
    if (!existsSync(join(folder, 'course.json'))) continue
    if (best?.canResume) continue
    const at = new Date(statSync(folder).mtimeMs).toISOString()
    if (!best || at > best.at) best = { folder, at, canResume: false }
  }

  return best === undefined ? undefined : { at: best.folder, started: best.at, canResume: best.canResume }
}

/** True when a folder holds something somebody wrote, rather than the layout of a Brief. */
function holdsWork(folder: string): boolean {
  if (existsSync(join(folder, 'course.json'))) return true
  const lessons = join(folder, 'lessons')
  try {
    return existsSync(lessons) && readdirSync(lessons).length > 0
  } catch {
    return false
  }
}

/**
 * Pick a stopped build back up.
 *
 * The folder is where it was, with everything the run had written still in it, and the
 * harness's own session is resumed, so the run carries on rather than starting again.
 */
export function resumeBrief(folder: string): { ok: boolean; transcript?: string; harnessId?: string; model?: string } {
  const file = join(folder, HOUSE, STATE)
  if (!existsSync(file)) return { ok: false }
  try {
    const state = JSON.parse(readFileSync(file, 'utf8')) as Stopped
    current = {
      id: folder.split('/').filter(Boolean).pop() ?? 'resumed',
      folder,
      tray: { files: [], links: [] },
      usd: 0,
      transcript: state.transcript,
      harnessId: state.harnessId,
      model: state.model,
      ...(state.session === undefined ? {} : { session: state.session }),
    }
    kept = true
    return { ok: true, transcript: state.transcript, harnessId: state.harnessId, model: state.model }
  } catch {
    return { ok: false }
  }
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
  'or Test. End with the size: how many Pages, and roughly how many hours of study that is. ' +
  'The person is about to check that against the time they told you they have, which is the ' +
  'cheapest place to find out the course is the wrong size. Write nothing to disk.'

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
  here.transcript = brief
  here.harnessId = harnessId
  here.model = model
  remember(here)
  buildStarted()
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
  buildEnded()
  progress().endRun(run, result.usd, result.ok ? 'ok' : 'failed')

  // A Course that made it into the library leaves nothing behind. One that stopped keeps
  // its folder and everything needed to carry on, until the reader starts another course.
  if (result.ok) {
    kept = false
    current = undefined
  } else {
    kept = true
    remember(here)
  }
  return result
}

/** Stop the run. A cancelled Brief bins its folder: there is no resume (PLAN 3.19). */
/**
 * Stop whatever is going, and bin the Brief. The one thing that ends a build, and it is a
 * press on the build screen rather than a side effect of navigating.
 */
export function cancelBrief(): void {
  stopLive()
  buildEnded()
  discardBrief()
}

/**
 * Bin the Brief and its folder.
 *
 * Refused while a build is going, because that folder is what the run is writing into. This
 * is called whenever the reader leaves the New Course screen, and leaving a screen must not
 * destroy work that takes twenty minutes to make.
 */
export function discardBrief(): void {
  if (running !== undefined) return
  // A build that stopped keeps everything it wrote and everything needed to carry on. It
  // is thrown away when the reader starts another course or says to throw it away, and not
  // because they closed a screen.
  if (kept) return
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
