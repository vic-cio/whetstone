import { randomUUID } from 'node:crypto'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { readEvaluation } from '../shared/defect'
import { publicTask } from '../shared/format'
import { harnessById } from './build'
import { roleFile, start } from './harness'
import { attemptDir, stateFor } from './workspace'
import type { AgentProfile, Moment } from '../shared/harness'
import type { Evaluation } from '../shared/defect'
import type { Ground } from './progress'
import type { Task } from '../shared/format'

/**
 * The Constructor, reading a complaint about one of its own questions.
 *
 * Reporting a Task as broken starts a run (PLAN 3.15, phase 6). The run reads the Task, the
 * note and the ground, and comes back with a quick evaluation: either it agrees, or it
 * names something the reader may have missed.
 *
 * It decides nothing. **The person has the authority to override it**, and until they
 * uphold the report nothing in the record moves. That is why this run is given no ability
 * to write: the Course it is complaining about is not in the folder, and neither is the
 * database.
 */

/** One turn, reading two small files. It is cheaper than a rubric and is capped like one. */
const CAP = 0.1

function evaluatorProfile(cwd: string, id: string): AgentProfile {
  return {
    role: 'constructor',
    cwd,
    plugins: [],
    can: ['read'],
    budgetUsd: CAP,
    restricted: true,
    instructions: roleFile('constructor-defect'),
    alsoRead: [],
    // Keyed to this report. The run is one turn and never resumes, exactly like a Grader's.
    stateDir: stateFor(`defect-${id}`),
  }
}

export interface DefectAsk {
  reportId: string
  task: Task
  ground: Ground
  note: string
  harnessId: string
  model: string
}

export async function evaluate(
  ask: DefectAsk,
  onMoment: (moment: Moment) => void,
): Promise<{ evaluation: Evaluation; usd: number }> {
  const harness = harnessById(ask.harnessId)
  if (!harness) {
    return { evaluation: { at: 'trouble', message: 'That harness is not configured.' }, usd: 0 }
  }

  // Its own folder, holding this one report and nothing else. The same shape as an Attempt
  // folder, for the same reason: a run that reads the whole Course could be argued into
  // rewriting a different part of it.
  const folder = attemptDir(`defect-${randomUUID()}`)
  writeFileSync(join(folder, 'task.json'), `${JSON.stringify(publicTask(ask.task), null, 2)}\n`)
  writeFileSync(
    join(folder, 'report.json'),
    `${JSON.stringify({ ground: ask.ground, note: ask.note }, null, 2)}\n`,
  )

  let said = ''
  const running = start(
    {
      harness,
      model: ask.model,
      profile: evaluatorProfile(folder, ask.reportId),
      prompt: [
        'Read `task.json` and `report.json` in this folder. Somebody says that task is broken.',
        '',
        'Answer with `AGREE` or `DISAGREE` on its own first line, then two or three sentences',
        'addressed to them. Write nothing to any file.',
      ].join('\n'),
    },
    (moment) => {
      if (moment.at === 'says') said += moment.text
      onMoment(moment)
    },
  )

  const outcome = await running.done
  if (!outcome.ok) {
    return {
      evaluation: { at: 'trouble', message: outcome.message ?? 'The run did not finish.' },
      usd: outcome.usd,
    }
  }
  return { evaluation: readEvaluation(said), usd: outcome.usd }
}
