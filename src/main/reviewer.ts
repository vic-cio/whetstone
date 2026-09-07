import { randomUUID } from 'node:crypto'
import { copyFileSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'

import { harnessById } from './build'
import { roleFile, start } from './harness'
import { furnish, projectDir, stateFor } from './workspace'
import type { AgentProfile, Moment } from '../shared/harness'
import type { Project } from '../shared/format'

/**
 * The Reviewer.
 *
 * A Project is open-ended work done outside the app with ordinary tools. It comes back as a
 * folder and a list of links, and it gets one written response, in the register of a senior
 * colleague reading the work rather than a marker scoring it. No pass, no fail, no number
 * (PLAN 3.15, phase 6).
 *
 * There is no thread. The response is one message and the run is not resumed, and a
 * resubmission is judged by a run that has never seen the last one. If the reader wants to
 * argue with it, they take the criteria, their work and the response to an ordinary chat
 * outside the app.
 */

/** It reads a folder rather than a file, so its cap is larger than the Grader's. */
const CAP = 2

/**
 * What is not copied out of a project folder.
 *
 * A real project folder carries a repository and a package tree, and the first submission
 * would otherwise copy four gigabytes into the app's own data folder. None of it is the
 * work: it is the machinery the work was made with.
 */
const SKIP = new Set([
  '.git',
  '.svn',
  '.hg',
  'node_modules',
  '.venv',
  'venv',
  '__pycache__',
  '.mypy_cache',
  '.pytest_cache',
  '.next',
  '.turbo',
  'dist',
  'build',
  'target',
  '.DS_Store',
])

/** The whole submission, capped. Enough for anything written and not enough for a dataset. */
const LIMIT = 32 * 1024 * 1024

export interface Carried {
  files: number
  /** True when the cap stopped the copy, so the response can say what it did not see. */
  cut: boolean
}

/**
 * Copy a submitted folder into the run's own folder, skipping the machinery and stopping
 * at the cap. Nothing is followed out of the folder: a link is a name here, not a path.
 */
export function carryWork(from: string, into: string): Carried {
  mkdirSync(into, { recursive: true })
  let files = 0
  let bytes = 0
  let cut = false

  const walk = (dir: string): void => {
    if (cut) return
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (cut) return
      if (SKIP.has(entry.name) || entry.name.startsWith('.')) continue
      const path = join(dir, entry.name)
      if (entry.isSymbolicLink()) continue
      const target = join(into, relative(from, path))
      if (entry.isDirectory()) {
        mkdirSync(target, { recursive: true })
        walk(path)
        continue
      }
      if (!entry.isFile()) continue
      const size = statSync(path).size
      if (bytes + size > LIMIT) {
        cut = true
        return
      }
      copyFileSync(path, target)
      bytes += size
      files += 1
    }
  }

  walk(from)
  return { files, cut }
}

function reviewerProfile(cwd: string, id: string): AgentProfile {
  return {
    role: 'reviewer',
    cwd,
    plugins: [],
    // It reads the work and says what it thinks. It writes nothing: the response is the
    // message, and a role that could write into the submission could edit the work.
    can: ['read'],
    budgetUsd: CAP,
    restricted: true,
    instructions: roleFile('reviewer'),
    alsoRead: [],
    stateDir: stateFor(`reviewer-${id}`),
  }
}

export type Reviewed =
  | { at: 'reviewed'; text: string; usd: number }
  /** The run did not finish, or said nothing. Nothing is recorded and the work stands. */
  | { at: 'trouble'; message: string; usd: number }

export async function review(
  ask: { project: Project; folder?: string; links: string[]; harnessId: string; model: string },
  onMoment: (moment: Moment) => void,
): Promise<Reviewed> {
  const harness = harnessById(ask.harnessId)
  if (!harness) return { at: 'trouble', message: 'That harness is not configured.', usd: 0 }

  const id = randomUUID()
  const dir = projectDir(id)
  writeFileSync(join(dir, 'project.json'), `${JSON.stringify(ask.project, null, 2)}\n`)
  writeFileSync(join(dir, 'links.txt'), `${ask.links.join('\n')}\n`)
  const carried = ask.folder === undefined ? { files: 0, cut: false } : carryWork(ask.folder, join(dir, 'work'))

  const furnished = furnish(dir, 'reviewing', {
    updated: new Date().toISOString(),
    course: '',
    openTask: ask.project.id,
    pagesDone: 0,
    pageCount: 0,
    attached: [],
    online: true,
  })

  let said = ''
  const running = start(
    {
      harness,
      model: ask.model,
      profile: reviewerProfile(dir, id),
      prompt: [
        'Read the project in this folder and write one response to the person who did it.',
        '`project.json` is the brief and the criteria they had before they started.',
        carried.files === 0
          ? 'They submitted no folder, only the links in `links.txt`.'
          : `\`work/\` holds the ${carried.files} files they submitted, and \`links.txt\` the links they named.`,
        ...(carried.cut
          ? ['The folder was larger than the app carries, so some of it is not here. Say so if it matters.']
          : []),
        ...(furnished.skills.length === 0 ? [] : ['', ...furnished.skills]),
        '',
        'Write the response as your message. Write nothing to any file, and give no mark,',
        'score or grade of any kind: there is nowhere for one to go.',
      ].join('\n'),
    },
    (moment) => {
      if (moment.at === 'says') said += moment.text
      onMoment(moment)
    },
  )

  const outcome = await running.done
  if (!outcome.ok) {
    return { at: 'trouble', message: outcome.message ?? 'The review did not finish.', usd: outcome.usd }
  }
  if (said.trim() === '') {
    return { at: 'trouble', message: 'The reviewer said nothing, so nothing was recorded.', usd: outcome.usd }
  }
  return { at: 'reviewed', text: said.trim(), usd: outcome.usd }
}
