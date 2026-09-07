import { cpSync, rmSync } from 'node:fs'
import { join } from 'node:path'

import { inspect, moveOver, offerSkills, repairPrompt, seedSkills, stamp } from '../shared/staging'
import { adapterFor, agentDir, roleFile, start } from './harness'
import { harnessById } from './build'
import { stagingRoot } from './build'
import { stateFor } from './workspace'
import type { AgentProfile, Moment } from '../shared/harness'
import type { CourseError } from '../shared/format'

/**
 * Changing a Course that already exists.
 *
 * One run with a different instruction each time. `add-rung` writes Tasks at a Depth the
 * Course does not yet use and `remediate` writes a block for one Objective the reader keeps
 * failing (PLAN 3.15, phase 5). `fix-task` and `remove-task` are what an upheld defect
 * report does, and `rebuild-module` and `remove-module` are the same at Module scale.
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

function reviser(cwd: string, conversation: string): AgentProfile {
  return {
    role: 'constructor',
    cwd,
    plugins: [],
    can: ['read', 'write', 'web'],
    budgetUsd: CAP,
    restricted: false,
    instructions: roleFile('constructor-build'),
    alsoRead: [],
    stateDir: stateFor(conversation),
  }
}

export interface ReviseRequest {
  slug: string
  courseDir: string
  root: string
  harnessId: string
  model: string
  /** What to do. Two kinds add, two mend one Task, and two work at Module scale. */
  work: Work
}

/**
 * The work a revision does.
 *
 * The first two add. The rest change or take away what is already there, which is a
 * different promise to somebody part way through a Course, and they are worded separately
 * below for that reason.
 */
export type Work =
  | { kind: 'add-rung'; depth: string }
  | { kind: 'remediate'; objective: string; title: string }
  | { kind: 'fix-task'; taskId: string; note: string }
  | { kind: 'remove-task'; taskId: string; note: string }
  | { kind: 'rebuild-module'; moduleId: string; title: string; note: string }
  | { kind: 'remove-module'; moduleId: string; title: string; note: string }

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
        profile: reviser(folder, folder.split('/').filter(Boolean).pop() ?? 'once'),
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
      moveOver(folder, request.root, request.slug, adapterFor(harness)?.litter ?? [])
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
  /** For the kinds that add. The strictest rule in the app, and the one it turns on. */
  const addOnly = [
    'This course already exists and somebody is part way through it. Add to it; change',
    'nothing that is already here. Do not rename an id, do not reuse an id, do not rewrite a',
    'lesson, and do not touch `toolkit/`. Progress is recorded against the ids in these',
    'files, so an id that changes is somebody’s progress pointing at nothing.',
  ]

  /**
   * For the kinds that mend or take away.
   *
   * These break the rule above and need their own wording, or a run reading "add, never
   * rewrite" will add a second copy of the broken question and leave the first one there.
   * What holds instead is narrower: change what you were named, and nothing else.
   */
  const namedOnly = [
    'This course already exists and somebody is part way through it. Change exactly what is',
    'named above and nothing else. Every other id stays as it is, every other file stays as',
    'it is, and `toolkit/` is not yours. Progress is recorded against these ids, so an id',
    'that changes anywhere else is somebody’s progress pointing at nothing.',
  ]

  const work = ((): { lines: string[]; keep: string[] } => {
    switch (request.work.kind) {
      case 'add-rung':
        return {
          keep: addOnly,
          lines: [
            `Add a Rung at \`${request.work.depth}\` depth.`,
            `Put \`${request.work.depth}\` in the \`ladder\` in course.json, write Tasks at that`,
            'depth for every Objective the course has, and add them to the Tests they belong in.',
            'At least one of them must be `check: deterministic`, whatever the depth.',
          ],
        }
      case 'remediate':
        return {
          keep: addOnly,
          lines: [
            `Write a remediation block for \`${request.work.objective}\`, which is "${request.work.title}".`,
            'The reader has failed it three times, so the material there is not working for them.',
            'Add one Lesson that takes a different run at it: a worked example with real numbers,',
            'the smallest case first, or the two ideas introduced in the other order. Add it as a',
            'Page in the Module that Objective lives in, and write two or three new Tasks for it.',
            'Do not repeat the lesson that is already there in different words.',
          ],
        }
      case 'fix-task':
        return {
          keep: namedOnly,
          lines: [
            `Mend the task \`${request.work.taskId}\`, in \`tasks/${request.work.taskId}.json\`.`,
            'The reader reported it as broken and said this:',
            '',
            request.work.note,
            '',
            'Rewrite that one file so the question is right and answerable. Keep its id, its',
            'objective and its depth. The Attempts against it are already void, so nobody is',
            'holding a mark from the old wording, and nothing else in the course changes.',
          ],
        }
      case 'remove-task':
        return {
          keep: namedOnly,
          lines: [
            `Remove the task \`${request.work.taskId}\`.`,
            'The reader reported it as broken and said this:',
            '',
            request.work.note,
            '',
            `Delete \`tasks/${request.work.taskId}.json\` and take its id out of the test that`,
            'names it. Leave every other task in that test alone. If taking it out would leave',
            'the test with no tasks at all, do not remove it: write a replacement question in',
            'that same file instead, because a test page vanishing from a course somebody is part',
            'way through leaves a hole in the contents.',
          ],
        }
      case 'rebuild-module':
        return {
          keep: namedOnly,
          lines: [
            `Rebuild the module \`${request.work.moduleId}\`, "${request.work.title}".`,
            'The reader says it is badly written or does not teach what it claims to. They said:',
            '',
            request.work.note,
            '',
            'Rewrite its Lessons and its Tests so they do the job. Keep the module id, keep the',
            'page ids that stay, and keep the objectives the course declares. A page you drop',
            'comes out of `modules` in course.json as well as out of its folder.',
          ],
        }
      default:
        return {
          keep: namedOnly,
          lines: [
            `Remove the module \`${request.work.moduleId}\`, "${request.work.title}".`,
            'The reader says it should not be in this course at all. They said:',
            '',
            request.work.note,
            '',
            'Delete its Lessons and Tests, delete the tasks those tests named, and take the',
            'module out of `modules` in course.json. Take the pages out of `suggestedOrder`',
            'too. An Objective that no longer has a single task belonging to it comes out of',
            '`objectives`. Leave every other module exactly as it is.',
          ],
        }
    }
  })()

  return [...work.lines, '', ...work.keep, ...(skills.length === 0 ? [] : ['', ...skills])].join('\n')
}
