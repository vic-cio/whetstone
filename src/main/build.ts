import { app } from 'electron'
import { existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { TOOLKIT_VERSION } from '../shared/miniapp'
import { compileDeclaredActivities } from '../shared/declaredActivity'
import { checkAllMiniApps } from './executionGate'
import { substancePrompt, thin } from '../shared/substance'
import {
  BRIEF,
  inspect,
  moveIn,
  offerSkills,
  prepare,
  repairPrompt,
  sizeLine,
  stamp,
  trayContents,
} from '../shared/staging'
import { adapterFor, agentDir, registry, roleFile, start } from './harness'
import { tagsInLibrary } from './courseStore'
import { stateFor } from './workspace'
import type { AgentProfile, Harness, Moment } from '../shared/harness'
import type { CourseError } from '../shared/format'

/**
 * Building a Course.
 *
 * Four stages and the user is in charge at each one (PLAN 3.19): the Brief is a
 * conversation, the outline is a message in it, the build writes into staging, and only a
 * folder the parser accepts moves into the library.
 *
 * The Constructor is spawned three different ways here and they are three profiles over
 * one spawn layer, not three code paths. Two of them write nothing at all.
 */

/** How many times a Run is asked to fix its own Course before the build fails (PLAN 3.19). */
const REPAIRS = 3

/**
 * How many times a Run is asked to deepen a Course that parses but is thin.
 *
 * Two, and then the Course goes in whatever it says. Each round is another whole run, and
 * the second one is where the returns stop: a run that has twice been told its lessons are
 * short and has twice written 400 words is not going to write 700 on the third ask.
 */
const DEEPENINGS = 2

/**
 * The run that is going on now, if there is one.
 *
 * The app spawns one at a time, because the screen holds one at a time, so cancelling is
 * stopping this rather than looking one up. A build's repair attempt replaces it.
 */
let live: import('./harness').Running | undefined

/** Stop whatever is running. A cancelled Run bins its staging folder, so it cannot wait. */
export function stopLive(): void {
  live?.cancel()
  live = undefined
}

/**
 * A conversation's name, taken from its own folder.
 *
 * The Brief and the build it becomes are one conversation, so they must share the place the
 * harness keeps its sessions. Keying that to the spawn instead produced a build that asked
 * to resume the Brief and was told "no session found", every time.
 */
const conversation = (folder: string): string => folder.split('/').filter(Boolean).pop() ?? 'once'

/** The toolkit this build ships, which the app copies into staging before the Run starts. */
function toolkitDir(): string {
  const packaged = join(process.resourcesPath ?? '', 'toolkit')
  if (existsSync(packaged)) return packaged
  const here = fileURLToPath(new URL('.', import.meta.url))
  return join(here, '..', '..', 'toolkit')
}

/**
 * Where a Brief's folder is made. It becomes the staging folder if the user goes on to
 * build, and it is in the app's data folder rather than the courses root, so a half-written
 * Course is never in the library even for a moment (PLAN 3.19).
 *
 * `WHETSTONE_STAGING` moves it, the way `WHETSTONE_DB` moves the database, so a capture run
 * writes nothing into the real one.
 */
export function stagingRoot(): string {
  const root = process.env['WHETSTONE_STAGING'] ?? join(app.getPath('userData'), 'staging')
  mkdirSync(root, { recursive: true })
  return root
}

export interface Tray {
  files: string[]
  links: string[]
}

export interface Choice {
  harnessId: string
  model: string
  capUsd: number
}

export function harnessById(id: string): Harness | undefined {
  return registry().harnesses.find((entry) => entry.id === id)
}

/**
 * The Constructor answering, which is what a Brief message and an outline both are.
 *
 * It writes nothing. A conversation about what to learn has no reason to put a file
 * anywhere, and a role that cannot write cannot half-build a Course out of a question.
 */
function answering(cwd: string, capUsd: number, conversation: string): AgentProfile {
  return {
    role: 'constructor',
    cwd,
    // No plugin bundle. The skills are files in the working folder and the prompt names
    // them, which is the one delivery every harness can manage (PLAN 3.9).
    plugins: [],
    can: ['read', 'web'],
    budgetUsd: capUsd,
    // `--restricted` would take the web away, and a Brief is the one place the web is the
    // point. What keeps this run from writing is that it was granted no ability to.
    restricted: false,
    instructions: roleFile('constructor-brief'),
    alsoRead: [],
    stateDir: stateFor(conversation),
  }
}

/** The Constructor building. It writes files, and it still runs nothing and sends nothing. */
function building(cwd: string, capUsd: number, conversation: string): AgentProfile {
  return {
    role: 'constructor',
    cwd,
    plugins: [],
    can: ['read', 'write', 'web'],
    budgetUsd: capUsd,
    restricted: false,
    instructions: roleFile('constructor-build'),
    alsoRead: [],
    stateDir: stateFor(conversation),
  }
}

export interface Answer {
  ok: boolean
  text: string
  session: string
  usd: number
  message?: string
}

/**
 * One exchange in the Brief.
 *
 * Each message is its own spawn, resumed into the same session so the conversation is one
 * conversation. Nothing is generated until the user presses Build the course.
 */
export async function say(
  folder: string,
  choice: Choice,
  prompt: string,
  resume: string | undefined,
  onMoment: (moment: Moment) => void,
): Promise<Answer> {
  const harness = harnessById(choice.harnessId)
  if (!harness) return { ok: false, text: '', session: '', usd: 0, message: 'That harness is not configured.' }

  let text = ''
  const request = {
    harness,
    model: choice.model,
    profile: answering(folder, choice.capUsd, conversation(folder)),
    prompt,
    ...(resume === undefined ? {} : { resume }),
  }
  live = start(request, (moment) => {
    if (moment.at === 'says') text += moment.text
    onMoment(moment)
  })
  const outcome = await live.done
  live = undefined
  return {
    ok: outcome.ok,
    text,
    session: outcome.session,
    usd: outcome.usd,
    ...(outcome.message === undefined ? {} : { message: outcome.message }),
  }
}

export interface BuildResult {
  ok: boolean
  slug?: string
  /** Where staging is, so a failed build can be opened rather than only described. */
  folder: string
  errors: CourseError[]
  attempts: number
  usd: number
  message?: string
}

/**
 * The build itself.
 *
 * One Run, one Course, into a folder outside the library. A folder the parser refuses goes
 * back to the same session with the errors, at most three times, and if it still will not
 * parse the build fails and staging stays where it is.
 *
 * A folder that parses meets a second gate. `thin()` measures whether there is enough here
 * to learn from, and a Course that is too thin goes back to the same session with what was
 * measured. That gate asks and never refuses: after two rounds the Course moves into the
 * library whatever it says, because thinness is a matter of degree and a Course somebody
 * waited minutes for beats a Course that met a threshold.
 */
export async function build(
  folder: string,
  root: string,
  choice: Choice,
  brief: string,
  resume: string | undefined,
  onMoment: (moment: Moment) => void,
): Promise<BuildResult> {
  const harness = harnessById(choice.harnessId)
  if (!harness) {
    return { ok: false, folder, errors: [], attempts: 0, usd: 0, message: 'That harness is not configured.' }
  }

  let usd = 0
  let session = resume
  let errors: CourseError[] = []
  let complaints: CourseError[] = []
  let deepenings = 0

  for (let attempt = 1; attempt <= REPAIRS + DEEPENINGS; attempt += 1) {
    const prompt =
      attempt === 1
        ? firstPrompt(folder, brief)
        : errors.length > 0
          ? repairPrompt(errors)
          : substancePrompt(complaints)
    const request = {
      harness,
      model: choice.model,
      profile: building(folder, choice.capUsd, conversation(folder)),
      prompt,
      ...(session === undefined ? {} : { resume: session }),
    }
    live = start(request, onMoment)
    const outcome = await live.done
    live = undefined
    usd += outcome.usd
    if (outcome.session !== '') session = outcome.session

    if (!outcome.ok) {
      return {
        ok: false,
        folder,
        errors,
        attempts: attempt,
        usd,
        ...(outcome.message === undefined ? {} : { message: outcome.message }),
      }
    }

    // Written before the check, so the folder the parser reads is the folder that moves in.
    stamp(folder, harness.id, choice.model)

    // A declared activity compiles to an ordinary apps/<id>/index.html before the parser
    // ever sees it, so everything downstream — the parser's own apps/ checks, the
    // execution gate below, frameSource at runtime — treats it exactly like a hand-written
    // Mini-app. Compiling can fail (the initial-state invariant, a malformed DSL
    // assertion), and those failures are gate errors like any other.
    const compileErrors = compileDeclaredActivities(folder)
    if (compileErrors.length > 0) {
      errors = compileErrors
      complaints = []
      onMoment({ at: 'doing', what: `Checking the course, and asking for ${errors.length} fix${errors.length === 1 ? '' : 'es'}` })
      continue
    }

    const gate = inspect(folder, root)
    if (gate.ok) {
      // A Mini-app that exists, holds no external reference and matches the pinned
      // toolkit can still throw on line one, draw no way to answer, or draw a button
      // nobody can read. Booting it for real, once, at build time, is the only way to
      // know (build-time only: a later toolkit update is not re-checked, since acting on
      // a failure needs the Constructor, which may be unavailable or out of credit).
      const executionErrors = gate.course.apps.length > 0 ? await checkAllMiniApps(folder, gate.course.apps) : []
      if (executionErrors.length > 0) {
        errors = executionErrors
        complaints = []
        onMoment({ at: 'doing', what: `Checking the course, and asking for ${errors.length} fix${errors.length === 1 ? '' : 'es'}` })
        continue
      }

      // Said out loud, because a course that tours its subject in an afternoon parses
      // exactly as well as one that teaches it, and the difference is a count.
      onMoment({ at: 'doing', what: `Read the course: ${sizeLine(gate.course)}` })
      errors = []
      complaints = thin(gate.course)

      // Thin, and there is a round left to say so in. The run wrote this course and is
      // the only thing that can deepen it, so it goes back to the same session.
      if (complaints.length > 0 && deepenings < DEEPENINGS) {
        deepenings += 1
        onMoment({
          at: 'doing',
          what: `Reading what is there, and asking for ${complaints.length} thing${complaints.length === 1 ? '' : 's'} to be deeper`,
        })
        continue
      }

      moveIn(folder, root, gate.slug, adapterFor(harness)?.litter ?? [])
      return { ok: true, slug: gate.slug, folder, errors: [], attempts: attempt, usd }
    }
    errors = gate.errors
    complaints = []
    // Each attempt is a line in the feed, in the app's own words, with what was wrong.
    onMoment({ at: 'doing', what: `Checking the course, and asking for ${errors.length} fix${errors.length === 1 ? '' : 'es'}` })
  }

  return {
    ok: false,
    folder,
    errors,
    attempts: REPAIRS,
    usd,
    message: 'The course still does not parse after three tries, so nothing was added to the library.',
  }
}

/** Lay out staging and say what the Run is for. The brief is the conversation so far. */
export function open(folder: string, tray: Tray): void {
  prepare(folder, toolkitDir(), join(agentDir(), 'skills', 'authoring'), tray)
}

/**
 * The tags already in the library.
 *
 * Free tags alone drift into `ml`, `machine-learning` and `ML`, and three spellings of one
 * tag filter nothing. A fixed vocabulary would be wrong for the next niche Course, so the
 * run is shown what is there and told to reuse one that fits (PLAN 3.15, phase 6).
 */
function tagLine(): string[] {
  const tags = tagsInLibrary()
  return tags.length === 0
    ? ['Tag the course in `tags`. There is nothing in the library yet, so pick your own.']
    : [
        `The library already uses these tags: ${tags.join(', ')}.`,
        'Reuse the ones that fit before inventing a new one. A tag is lowercase and hyphenated.',
      ]
}

function firstPrompt(folder: string, brief: string): string {
  const tray = trayContents(folder)
  const attached =
    tray.length === 0
      ? []
      : [
          '',
          `The user attached material. It is in \`${BRIEF}/\`: ${tray.join(', ')}.`,
          'Read all of it. Cite every link in resources.json with one line on why it is worth',
          `the reader's time. The \`${BRIEF}/\` folder is your input and is not part of the`,
          'course; the app removes it before the course is added to the library.',
        ]

  return [
    'Write a course into this folder. It is empty apart from `toolkit/`.',
    '',
    // Written in this order on purpose. A run told to produce a whole course at once reads
    // everything before it commits to anything, and a run that then stops has left nothing
    // at all. Asking for the manifest first buys an early, cheap write: the shape is
    // settled, the ids exist, and a run that dies halfway leaves the repair loop something
    // to work on. Measured: a first attempt made seventeen tool calls, all of them reads,
    // and wrote nothing in thirteen minutes.
    'Work in this order, and write each file as you finish it rather than at the end.',
    '',
    '1. `course.json`, first and on its own. Decide the objectives, the ladder and the',
    '   modules, and write it. Everything after this refers to the ids you put in it.',
    '2. The lessons, one file at a time.',
    '3. The tasks and the tests.',
    '4. Any mini-apps, and `resources.json`.',
    '5. `AGENTS.md`, last, when you know what you have written.',
    '',
    ...tagLine(),
    '',
    `The toolkit is already there and is version ${TOOLKIT_VERSION}. Put exactly that string`,
    'in `toolkitVersion` in course.json, and do not write or read anything under `toolkit/`:',
    'the skill below is its reference and it is complete.',
    '',
    ...offerSkills(folder),
    '',
    'This is the brief, in the user’s own words:',
    '',
    brief,
    ...attached,
  ].join('\n')
}
