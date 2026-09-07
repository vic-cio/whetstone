import { randomUUID } from 'node:crypto'
import { cpSync, existsSync, readdirSync } from 'node:fs'
import { basename, join } from 'node:path'

import { guardFolder, sayChanged } from '../shared/guard'
import { tutorPrompt } from '../shared/prompts'
import { harnessById } from './build'
import { start } from './harness'
import { chatDir, furnish, readerProfile, shadowDir } from './workspace'
import type { Moment } from '../shared/harness'

/**
 * The Tutor.
 *
 * It is not a chat model with a window. It is an agent briefed by whoever wrote the
 * material, working inside the material: its working directory is the Course folder, it
 * reads the `AGENTS.md` the Constructor wrote there, and it reads the snapshot of what the
 * reader was doing when they asked (PLAN 3.8, 3.7).
 *
 * It changes nothing. Three layers stop it and this file owns the third: the Course is
 * copied before the spawn and put back after it, because the two above are the harness's
 * and a recorded run showed that a refusal in those never reaches the app.
 *
 * Nothing here runs on its own. A conversation starts cold when the reader sends the first
 * message and ends when they close it. There is no resident process and no warm pool.
 */

/** What one Tutor turn may cost. A conversation is many turns, and each one is capped. */
const CAP = 0.25

export interface Turn {
  who: 'you' | 'tutor'
  text: string
}

export interface TutorReply {
  ok: boolean
  text: string
  usd: number
  /** Said when the run changed the Course and it was put back. Almost always absent. */
  reverted?: string
  message?: string
}

/** Where this conversation keeps its attachments, its snapshot and its skills. */
export const chatFolder = (chatId: string): string => chatDir(chatId)

/**
 * Copy what the reader gave the Tutor into the conversation's own folder.
 *
 * A photo of handwritten working or a drawn diagram is an ordinary input the run opens
 * with its own tools, so there is no separate path for a picture. It never goes into the
 * Course folder, so a shared Course carries none of it (PLAN 3.7).
 */
export function attach(chatId: string, files: string[]): string[] {
  const dir = join(chatFolder(chatId), 'attached')
  for (const file of files) {
    if (!existsSync(file)) continue
    cpSync(file, join(dir, basename(file)))
  }
  return attached(chatId)
}

export function attached(chatId: string): string[] {
  const dir = join(chatFolder(chatId), 'attached')
  return existsSync(dir) ? readdirSync(dir).sort() : []
}

export const newChat = (): string => randomUUID()

export interface AskOptions {
  chatId: string
  courseDir: string
  slug: string
  harnessId: string
  model: string
  question: string
  /** Continue the same conversation rather than starting another one. */
  resume?: string
  live: { openLesson?: string; openTest?: string; openTask?: string; pagesDone: number; pageCount: number }
}

/**
 * One turn of a Tutor conversation.
 *
 * The Course is the working directory and the conversation's folder is added beside it, so
 * the run can read the material it is talking about and the picture the reader just took
 * of their working, and can write to neither.
 */
export async function ask(
  options: AskOptions,
  onMoment: (moment: Moment) => void,
): Promise<TutorReply & { session: string }> {
  const harness = harnessById(options.harnessId)
  if (!harness) {
    return { ok: false, text: '', usd: 0, session: '', message: 'That harness is not configured.' }
  }

  const folder = chatFolder(options.chatId)
  const furnished = furnish(folder, 'tutoring', {
    updated: new Date().toISOString(),
    course: options.slug,
    ...(options.live.openLesson === undefined ? {} : { openLesson: options.live.openLesson }),
    ...(options.live.openTest === undefined ? {} : { openTest: options.live.openTest }),
    ...(options.live.openTask === undefined ? {} : { openTask: options.live.openTask }),
    pagesDone: options.live.pagesDone,
    pageCount: options.live.pageCount,
    attached: attached(options.chatId),
    online: true,
  })

  const guard = guardFolder(options.courseDir, shadowDir(options.chatId))
  let text = ''

  try {
    const running = start(
      {
        harness,
        model: options.model,
        profile: readerProfile('tutor', options.courseDir, CAP, [folder], options.chatId),
        prompt: tutorPrompt({
          folder,
          skills: furnished.skills,
          attached: attached(options.chatId),
          question: options.question,
        }),
        ...(options.resume === undefined ? {} : { resume: options.resume }),
      },
      (moment) => {
        if (moment.at === 'says') text += moment.text
        onMoment(moment)
      },
    )
    const outcome = await running.done
    const changes = guard.check()

    return {
      ok: outcome.ok,
      text,
      usd: outcome.usd,
      session: outcome.session,
      ...(changes.length === 0 ? {} : { reverted: sayChanged(changes) }),
      ...(outcome.message === undefined ? {} : { message: outcome.message }),
    }
  } finally {
    guard.release()
  }
}
