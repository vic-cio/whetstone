import { join } from 'node:path'

import { LIVE } from './snapshot'

/**
 * What each role is told.
 *
 * Pure functions of a few paths and names, in `shared/` rather than beside the code that
 * spawns, because these sentences are the contract with every harness and a test should be
 * able to read them without starting Electron.
 *
 * Every one of them names a file rather than assuming a loader (docs/adr/0021).
 */

export interface TutorAsk {
  /** The conversation's own folder, which holds the snapshot and the attachments. */
  folder: string
  skills: string[]
  attached: string[]
  question: string
}

export function tutorPrompt(ask: TutorAsk): string {
  return [
    'You are answering a question about the course in this folder.',
    '',
    `Read \`${join(ask.folder, LIVE)}\` first. It says which page the reader had open and`,
    'what they have been through, which is usually what "why was I wrong" is about.',
    'Read `AGENTS.md` in this folder if it is there. It was written by whoever wrote this',
    'course, and it outranks your own idea of the subject.',
    ...(ask.skills.length === 0 ? [] : ['', ...ask.skills]),
    ...(ask.attached.length === 0
      ? []
      : [
          '',
          `The reader attached ${ask.attached.join(', ')}. They are in`,
          `\`${join(ask.folder, 'attached')}\`. Open them.`,
        ]),
    '',
    'The reader asks:',
    '',
    ask.question,
  ].join('\n')
}

export interface GraderAsk {
  rubric: boolean
  skills: string[]
  attached: string[]
  /**
   * True when the harness cannot validate its own output against a schema, so the verdict
   * has to arrive as a file the app checks instead (PLAN 3.11). Both paths end in the same
   * checked object; this one just has to be asked for.
   */
  writeFile: boolean
}

export function graderPrompt(ask: GraderAsk): string {
  const shape = ask.rubric
    ? [
        'Score every criterion in `task.json`, one line each, and no others. For each one say',
        'what in the submission shows it, quoting where you can, and what was missing.',
        'Write nothing if you cannot score them all: half a verdict is worse than none.',
      ]
    : [
        'Decide pass or fail against the `answerGuide` in `task.json`, and say why in a',
        'sentence or two, addressed to the person who answered.',
      ]

  const where = ask.writeFile
    ? [
        '',
        'Write your verdict to `verdict.json` in this folder, as one JSON object and nothing',
        ask.rubric
          ? 'else: {"kind":"rubric","outcome":"pass"|"fail","reason":"...","criteria":[{"id":"...","met":true|false,"evidence":"...","missing":"..."}]}'
          : 'else: {"kind":"short","outcome":"pass"|"fail","reason":"..."}',
        'The app reads that file. A field left out means the answer is not recorded at all.',
      ]
    : []

  return [
    'Judge one answer. `task.json` is the question and how to judge it, and `answer.txt` is',
    'what the reader gave. Both are in this folder.',
    ...(ask.attached.length === 0
      ? []
      : [`The reader also submitted ${ask.attached.join(', ')}, in this folder. Open and read them.`]),
    ...(ask.skills.length === 0 ? [] : ['', ...ask.skills]),
    '',
    ...shape,
    ...where,
    '',
    'Be harsh. An answer that restates the question has not answered it, and passing work',
    'that is not right teaches somebody that it was.',
  ].join('\n')
}
