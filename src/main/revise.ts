import { cpSync, rmSync } from 'node:fs'
import { join } from 'node:path'

import { inspect, moveOver, offerSkills, repairPrompt, seedSkills, stamp } from '../shared/staging'
import { agentDir, roleFile, start } from './harness'
import { harnessById } from './build'
import { stagingRoot } from './build'
import type { AgentProfile, Moment } from '../shared/harness'
import type { CourseError } from '../shared/format'

/**
 * Changing a Course that already exists.
 *
 * Two runs, and they are the same run with a different instruction: `add-rung` writes Tasks
 * at a Depth the Course does not yet use, and `remediate` writes a block for one Objective
 * the reader keeps failing (PLAN 3.15, phase 5).
 *
 * Neither writes into the library. The Course is copied into staging, the Run works there,
 * the parser is the gate exactly as it is for a build, and only a folder that parses goes
 * back (docs/adr/0020). A Course somebody is part way through is the last thing that should
 * be edited in place by an agent.
 *
 * Progress survives because ids are stable. The Constructor is told never to reuse or
 * rewrite one, and this is the run where that rule earns its keep.
 */

/** A revision is smaller than a build, and its cap says so. */
const CAP = 1.5

export type Revision =
  | { at: 'revised'; usd: number; attempts: number }
  | { at: 'refused'; usd: number; attempts: number; errors: CourseError[]; folder: string }
  | { at: 'trouble'; usd: number; message: string }

function reviser(cwd: string): AgentProfile {
  return {
    role: 'constructor',
    cwd,
    plugins: [],
    can: ['read', 'write', 'web'],
    budgetUsd: CAP,
    restricted: false,
    instructions: roleFile('constructor-build'),
    alsoRead: [],
  }
}

export interface ReviseRequest {
  slug: string
  courseDir: string
  root: string
  harnessId: string
  model: string
  /** What to do: add a Rung at a Depth, or write a remediation block for an Objective. */
  work: { kind: 'add-rung'; depth: string } | { kind: 'remediate'; objective: string; title: string }
}

export async function revise(
  request: ReviseRequest,
  onMoment: (moment: Moment) => void,
): Promise<Revision> {
  const harness = harnessById(request.harnessId)
  if (!harness) return { at: 'trouble', usd: 0, message: 'That harness is not configured.' }

  const folder = join(stagingRoot(), `revise-${Date.now()}`)
  rmSync(folder, { recursive: true, force: true })
  cpSync(request.courseDir, folder, { recursive: true })
  seedSkills(folder, join(agentDir(), 'skills', 'authoring'))

  let usd = 0
  let session: string | undefined
  let errors: CourseError[] = []

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const running = start(
      {
        harness,
        model: request.model,
        profile: reviser(folder),
        prompt: attempt === 1 ? instruction(request, offerSkills(folder)) : repairPrompt(errors),
        ...(session === undefined ? {} : { resume: session }),
      },
      onMoment,
    )
    const outcome = await running.done
    usd += outcome.usd
    if (outcome.session !== '') session = outcome.session
    if (!outcome.ok) {
      return { at: 'trouble', usd, message: outcome.message ?? 'The run did not finish.' }
    }

    stamp(folder, harness.id, request.model)
    const gate = inspect(folder, request.root)
    if (gate.ok) {
      moveOver(folder, request.root, request.slug)
      return { at: 'revised', usd, attempts: attempt }
    }
    errors = gate.errors
    onMoment({ at: 'doing', what: `Checking the course, and asking for ${errors.length} fixes` })
  }

  return { at: 'refused', usd, attempts: 3, errors, folder }
}

/**
 * What the Run is told.
 *
 * Both instructions say the same thing twice over, because it is the thing that breaks a
 * Course somebody is halfway through: add, never rewrite. An id that changes is progress
 * that points at nothing.
 */
function instruction(request: ReviseRequest, skills: string[]): string {
  const keep = [
    'This course already exists and somebody is part way through it. Add to it; change',
    'nothing that is already here. Do not rename an id, do not reuse an id, do not rewrite a',
    'lesson, and do not touch `toolkit/`. Progress is recorded against the ids in these',
    'files, so an id that changes is somebody’s progress pointing at nothing.',
  ]

  const work =
    request.work.kind === 'add-rung'
      ? [
          `Add a Rung at \`${request.work.depth}\` depth.`,
          `Put \`${request.work.depth}\` in the \`ladder\` in course.json, write Tasks at that`,
          'depth for every Objective the course has, and add them to the Tests they belong in.',
          'At least one of them must be `check: deterministic`, whatever the depth.',
        ]
      : [
          `Write a remediation block for \`${request.work.objective}\`, which is "${request.work.title}".`,
          'The reader has failed it three times, so the material there is not working for them.',
          'Add one Lesson that takes a different run at it: a worked example with real numbers,',
          'the smallest case first, or the two ideas introduced in the other order. Add it as a',
          'Page in the Module that Objective lives in, and write two or three new Tasks for it.',
          'Do not repeat the lesson that is already there in different words.',
        ]

  return [...work, '', ...keep, ...(skills.length === 0 ? [] : ['', ...skills])].join('\n')
}
