import { randomUUID } from 'node:crypto'
import { cpSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'

import { graderPrompt } from '../shared/prompts'
import { asTrouble, readVerdict, schemaFor } from '../shared/verdict'
import { harnessById } from './build'
import { start } from './harness'
import { attemptDir, furnish, readerProfile } from './workspace'
import type { AgentProfile } from '../shared/harness'
import type { Moment } from '../shared/harness'
import type { Judgement } from '../shared/verdict'
import type { Task } from '../shared/format'

/**
 * The Grader.
 *
 * It judges the Attempts the host cannot: a `model` Task, whose answer has many valid
 * forms, and a `rubric` Task, where a person submitted work. It is spawned in an Attempt
 * folder of its own, holding what it needs and nothing else, so it never reads the Course
 * unless the Task pointed it at something (PLAN 3.10).
 *
 * The contract is in `src/shared/verdict.ts` and it is one rule: a partial verdict is
 * recorded as an error, never as a fail. Everything here is arranged so that a run which
 * goes wrong produces `trouble` and the Attempt stays unanswered.
 */

/** A short answer is one turn. A rubric is a person's work, and is worth more (PLAN 3.12). */
const CAP = { short: 0.1, rubric: 1 }

/**
 * The Grader's allowance.
 *
 * It reads, and on a harness that cannot validate its own output it also writes, because
 * the verdict has to arrive as a file. That write is confined to the Attempt folder, which
 * is the run's working directory and holds nothing but this one Attempt.
 */
function graderProfile(cwd: string, budgetUsd: number, writeFile: boolean, attempt: string): AgentProfile {
  /*
   * The state folder is keyed to the Attempt, not shared across all of them.
   *
   * A Grader run is one turn and never resumes, so it has no session to keep. Sharing one
   * folder meant every Attempt ever judged piled its state into the same place, with the
   * harness free to find a session there that belongs to somebody else's question. The
   * Grader is amnesiac by design, and this is that design in the filesystem.
   */
  const profile = readerProfile('grader', cwd, budgetUsd, [], attempt)
  return writeFile ? { ...profile, can: ['read', 'write'], restricted: false } : profile
}

export interface Grading {
  judgement: Judgement
  usd: number
  /** Where the Attempt folder is, so a run that went wrong can be looked at. */
  folder: string
}

/**
 * Judge one Attempt.
 *
 * `submission` is the files a person attached at `project` depth, already copied into the
 * Attempt folder by the caller. `given` is what they typed or what a Mini-app reported.
 */
export async function judge(
  task: Task,
  given: unknown,
  harnessId: string,
  model: string,
  onMoment: (moment: Moment) => void,
  submission: string[] = [],
  /**
   * The questions this one builds on, with the reader's own answers to them. The one
   * exception to the amnesia above, and a narrow one: the right answers are not in here,
   * so a wrong part a followed by a right method in part b passes part b (PLAN 3.15).
   */
  earlier: { id: string; prompt: string; given: unknown }[] = [],
): Promise<Grading> {
  const id = randomUUID()
  const folder = attemptDir(id)
  const criteria = task.check === 'rubric' ? task.rubric.map((entry) => entry.id) : []

  // The whole of what the Grader is judging, as files. It reads them with its own tools
  // rather than being handed a blob, which is what lets it quote what it read.
  writeFileSync(join(folder, 'task.json'), `${JSON.stringify(publicTask(task), null, 2)}\n`)
  writeFileSync(join(folder, 'answer.txt'), typeof given === 'string' ? given : JSON.stringify(given, null, 2))
  if (earlier.length > 0) {
    writeFileSync(join(folder, 'earlier.json'), `${JSON.stringify(earlier, null, 2)}\n`)
  }
  const attached: string[] = []
  for (const file of submission) {
    if (!existsSync(file)) continue
    cpSync(file, join(folder, basename(file)), { recursive: true })
    attached.push(basename(file))
  }

  const harness = harnessById(harnessId)
  if (!harness) return { judgement: asTrouble('That harness is not configured.'), usd: 0, folder }
  // A harness that cannot check its own output is asked for a file, and the app checks that.
  const writeFile = !harness.validatesOutput

  const furnished = furnish(folder, 'grading', {
    updated: new Date().toISOString(),
    course: '',
    openTask: task.id,
    pagesDone: 0,
    pageCount: 0,
    attached: [],
    online: true,
  })

  let said = ''
  const running = start(
    {
      harness,
      model,
      profile: graderProfile(folder, task.check === 'rubric' ? CAP.rubric : CAP.short, writeFile, id),
      prompt: graderPrompt({
        rubric: task.check === 'rubric',
        skills: furnished.skills,
        attached,
        writeFile,
        earlier: earlier.length > 0,
      }),
      ...(writeFile ? {} : { schema: schemaFor(criteria) }),
    },
    (moment) => {
      if (moment.at === 'says') said += moment.text
      onMoment(moment)
    },
  )

  const outcome = await running.done
  if (!outcome.ok) {
    return { judgement: asTrouble(outcome.message ?? 'The grader did not finish.'), usd: outcome.usd, folder }
  }

  return { judgement: readVerdict(collect(folder, said), criteria), usd: outcome.usd, folder }
}

/**
 * What the Grader produced, from whichever of the two places it landed in.
 *
 * A harness that validates its own structured output returns the object (PLAN 3.11). One
 * that cannot is told to write `verdict.json`, and the app validates that instead. Both end
 * in the same checked object, and a run that did neither ends in trouble.
 */
function collect(folder: string, said: string): unknown {
  const file = join(folder, 'verdict.json')
  if (existsSync(file)) {
    try {
      return JSON.parse(readFileSync(file, 'utf8'))
    } catch {
      return undefined
    }
  }
  // Last resort: the object in what it said. A model that was given a schema and ignored
  // it has usually still produced the thing, and the schema check below is unchanged.
  const start = said.indexOf('{')
  const end = said.lastIndexOf('}')
  if (start < 0 || end <= start) return undefined
  try {
    return JSON.parse(said.slice(start, end + 1))
  } catch {
    return undefined
  }
}

/** The Task as the Grader sees it: the question, and how to judge it. Never the answer set. */
function publicTask(task: Task): Record<string, unknown> {
  const common = { id: task.id, depth: task.depth, prompt: task.prompt }
  if (task.check === 'model') return { ...common, answerGuide: task.answerGuide }
  if (task.check === 'rubric') return { ...common, accepts: task.accepts, rubric: task.rubric }
  return common
}
