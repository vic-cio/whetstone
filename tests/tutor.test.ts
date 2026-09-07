import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { LIVE, writeLive } from '../src/shared/snapshot'
import { graderPrompt, tutorPrompt } from '../src/shared/prompts'
import { parseCourse } from '../src/shared/parseCourse'

/**
 * Test 13: the Constructor writes a Course-level `AGENTS.md`, and a Tutor spawn reads it
 * before answering.
 *
 * What a test can hold is the first half and the instruction that produces the second: the
 * file is there, the rule that asks for it is in the Constructor's own instructions, and
 * the Tutor is told to read it before it answers. That the model then does was checked with
 * a real spawn, which quoted the lesson back.
 */

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..')

describe('a course carries its own teacher', () => {
  it('is asked for, in the words the Constructor is given', () => {
    const build = readFileSync(join(ROOT, 'agent', 'roles', 'constructor-build.md'), 'utf8')
    expect(build).toContain("Write the Course's own `AGENTS.md`")
    expect(build).toContain('misconceptions')
  })

  it('is in every course the app ships, and says the things the tutor needs', () => {
    for (const slug of ['gradients-by-hand', 'forks-and-pins']) {
      const file = join(ROOT, 'fixtures', 'courses', slug, 'AGENTS.md')
      expect(existsSync(file), `${slug} has no AGENTS.md`).toBe(true)
      const text = readFileSync(file, 'utf8')
      // The three things only the author of the material can say (PLAN 3.8).
      expect(text).toMatch(/notation/i)
      expect(text).toMatch(/misconception/i)
      expect(text).toContain('outranks')
    }
  })

  it('is not content, so it does not change how a course parses', () => {
    const result = parseCourse(join(ROOT, 'fixtures', 'courses', 'gradients-by-hand'))
    expect(result.ok).toBe(true)
  })
})

describe('what the tutor is told', () => {
  let box = ''
  beforeAll(() => {
    box = mkdtempSync(join(tmpdir(), 'whetstone-tutor-'))
  })
  afterAll(() => rmSync(box, { recursive: true, force: true }))

  const ask = (over: Partial<Parameters<typeof tutorPrompt>[0]> = {}): string =>
    tutorPrompt({ folder: '/chats/c1', skills: [], attached: [], question: 'Why was I wrong?', ...over })

  it('reads the course’s own briefing before it answers', () => {
    const prompt = ask()
    expect(prompt).toContain('Read `AGENTS.md` in this folder')
    expect(prompt).toContain('outranks your own idea of the subject')
    // Before the question, so it is an instruction rather than an afterthought.
    expect(prompt.indexOf('AGENTS.md')).toBeLessThan(prompt.indexOf('Why was I wrong?'))
  })

  it('reads what the reader was doing, from a file rather than from a prompt', () => {
    expect(ask()).toContain(join('/chats/c1', LIVE))
  })

  it('is told about a photo of somebody’s working, by path', () => {
    const prompt = ask({ attached: ['working.jpg'] })
    expect(prompt).toContain('working.jpg')
    expect(prompt).toContain(join('/chats/c1', 'attached'))
    expect(prompt).toContain('Open them')
  })

  it('says nothing about attachments when there are none', () => {
    expect(ask()).not.toContain('attached')
  })

  it('carries its skills as paths, the way every other role does', () => {
    expect(ask({ skills: ['- `.whetstone/skills/walking-a-lesson/SKILL.md` — how'] })).toContain(
      '.whetstone/skills/walking-a-lesson/SKILL.md',
    )
  })
})

describe('the snapshot a run reads', () => {
  let box = ''
  beforeAll(() => {
    box = mkdtempSync(join(tmpdir(), 'whetstone-live-'))
  })
  afterAll(() => rmSync(box, { recursive: true, force: true }))

  it('is written where the run may read but not write', () => {
    // Never in the Course folder: the Tutor may not change a byte there, and a file the
    // app rewrites before every message is a change (PLAN 3.7, 3.14).
    const file = writeLive(box, {
      updated: '2026-09-06T12:00:00.000Z',
      course: 'gradients-by-hand',
      openLesson: 'les-the-chain-rule',
      pagesDone: 2,
      pageCount: 6,
      attached: [],
      online: true,
    })
    expect(file).toBe(join(box, LIVE))
    const live = JSON.parse(readFileSync(file, 'utf8'))
    expect(live.openLesson).toBe('les-the-chain-rule')
    expect(live.pagesDone).toBe(2)
    // No ability estimate and no score. The app keeps none (PLAN 3.4).
    expect(Object.keys(live).sort()).toEqual([
      'attached',
      'course',
      'online',
      'openLesson',
      'pageCount',
      'pagesDone',
      'updated',
    ])
  })
})

describe('what the grader is told', () => {
  it('is harsh, and asked for a whole verdict or none', () => {
    const rubric = graderPrompt({ rubric: true, skills: [], attached: [], writeFile: false })
    expect(rubric).toContain('Score every criterion in `task.json`, one line each, and no others')
    expect(rubric).toContain('half a verdict is worse than none')
    expect(rubric).toContain('Be harsh')
  })

  it('judges a short answer against the guide the task carries', () => {
    const short = graderPrompt({ rubric: false, skills: [], attached: [], writeFile: false })
    expect(short).toContain('answerGuide')
    expect(short).not.toContain('criterion')
  })

  it('is told to open a submission rather than to expect it pasted in', () => {
    expect(graderPrompt({ rubric: true, skills: [], attached: ['model.py'], writeFile: false })).toContain(
      'The reader also submitted model.py, in this folder. Open and read them.',
    )
  })
})
