import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import {
  BRIEF,
  HOUSE,
  courseSize,
  freeSlug,
  inspect,
  moveIn,
  prepare,
  repairPrompt,
  offerSkills,
  sizeLine,
  skillsIn,
  slugFrom,
  stamp,
  trayContents,
} from '../src/shared/staging'
import { parseCourse } from '../src/shared/parseCourse'

/**
 * Test 8: a Harness that writes an invalid folder never touches `courses/`, and a valid
 * staging folder moves in atomically.
 * Test 11: the gate rejects a Mini-app with any external reference.
 * Test 16: material attached in the Brief reaches the staging folder, and stays out of the
 * Course that is built from it.
 *
 * A Run costs minutes and money, so none of this spawns anything. What is under test is
 * the gate between what a Run wrote and what the reader can open, and that gate is a pure
 * function of a folder.
 */

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..')
const SAMPLE = join(ROOT, 'fixtures', 'courses', 'gradients-by-hand')
const TOOLKIT = join(ROOT, 'toolkit')
const SKILLS = join(ROOT, 'agent', 'skills', 'authoring')

let box = ''
beforeAll(() => {
  box = mkdtempSync(join(tmpdir(), 'whetstone-staging-'))
})
afterAll(() => rmSync(box, { recursive: true, force: true }))

/** A fresh library and a fresh staging folder holding a Course a Run could have written. */
function scene(): { root: string; staging: string } {
  const where = mkdtempSync(join(box, 'run-'))
  const root = join(where, 'courses')
  const staging = join(where, 'staging')
  mkdirSync(root, { recursive: true })
  cpSync(SAMPLE, staging, { recursive: true })
  return { root, staging }
}

describe('the gate between staging and the library', () => {
  it('accepts a course the parser reads, and names the folder it will take', () => {
    const { root, staging } = scene()
    const gate = inspect(staging, root)
    expect(gate.ok).toBe(true)
    if (gate.ok) expect(gate.slug).toBe('gradients-by-hand')
  })

  it('refuses a course that was never written', () => {
    const { root } = scene()
    const empty = mkdtempSync(join(box, 'empty-'))
    const gate = inspect(empty, root)
    expect(gate.ok).toBe(false)
    if (!gate.ok) expect(gate.errors[0]).toEqual({ file: 'course.json', message: 'was never written' })
  })

  it('refuses a course whose manifest is wrong, and says where', () => {
    const { root, staging } = scene()
    const manifest = JSON.parse(readFileSync(join(staging, 'course.json'), 'utf8'))
    delete manifest.ladder
    writeFileSync(join(staging, 'course.json'), JSON.stringify(manifest))

    const gate = inspect(staging, root)
    expect(gate.ok).toBe(false)
    if (!gate.ok) {
      expect(gate.errors.some((error) => error.field === 'ladder')).toBe(true)
      expect(readdirSync(root)).toEqual([])
    }
  })

  it('refuses a mini-app that reaches outside itself', () => {
    // Test 11. The sandbox denies an external resource, so a mini-app that reaches for one
    // would render wrong and silently: it is stopped at the gate instead.
    const { root, staging } = scene()
    const file = join(staging, 'apps', 'slope-explorer', 'index.html')
    writeFileSync(file, `<script src="https://cdn.example.com/plot.js"></script>\n${readFileSync(file, 'utf8')}`)

    const gate = inspect(staging, root)
    expect(gate.ok).toBe(false)
    if (!gate.ok) {
      expect(gate.errors[0]?.file).toBe('apps/slope-explorer/index.html')
      expect(gate.errors[0]?.message).toContain('outside itself')
    }
    expect(readdirSync(root)).toEqual([])
  })

  it('never leaves a half-written course where the library can see it', () => {
    const { root, staging } = scene()
    const target = moveIn(staging, root, 'gradients-by-hand')

    expect(readdirSync(root)).toEqual(['gradients-by-hand'])
    expect(existsSync(join(target, 'course.json'))).toBe(true)
    expect(existsSync(join(target, 'apps', 'slope-explorer', 'index.html'))).toBe(true)
    // Staging is emptied, and the folder it was copied through has gone with it.
    expect(existsSync(staging)).toBe(false)
    expect(readdirSync(root).some((name) => name.startsWith('.incoming'))).toBe(false)
  })

  it('refuses to write over a course that is already there', () => {
    const { root, staging } = scene()
    mkdirSync(join(root, 'gradients-by-hand'), { recursive: true })
    expect(() => moveIn(staging, root, 'gradients-by-hand')).toThrow(/already in the library/)
    expect(readdirSync(join(root, 'gradients-by-hand'))).toEqual([])
  })

  it('finds a free name rather than refusing a second course about one idea', () => {
    const { root } = scene()
    expect(freeSlug(root, 'chess')).toBe('chess')
    mkdirSync(join(root, 'chess'))
    expect(freeSlug(root, 'chess')).toBe('chess-2')
  })

  it('makes a folder name out of a course id', () => {
    expect(slugFrom('crs-gradients-by-hand')).toBe('crs-gradients-by-hand')
    expect(slugFrom('Gradients, by hand!')).toBe('gradients-by-hand')
    expect(slugFrom('///')).toBe('course')
  })
})

describe('what built this course', () => {
  it('is written by the app, which knows, rather than asked of the run', () => {
    const { root, staging } = scene()
    stamp(staging, 'claude', 'claude-opus-5')

    const manifest = JSON.parse(readFileSync(join(staging, 'course.json'), 'utf8'))
    expect(manifest.builtBy.harness).toBe('claude')
    expect(manifest.builtBy.model).toBe('claude-opus-5')
    expect(Date.parse(manifest.builtBy.at)).toBeGreaterThan(0)
    // And what was stamped is still a course, because it is stamped before it is checked.
    expect(inspect(staging, root).ok).toBe(true)
  })

  it('leaves a broken manifest to the parser rather than failing over it', () => {
    const { root, staging } = scene()
    writeFileSync(join(staging, 'course.json'), '{ not json')
    expect(() => stamp(staging, 'claude', 'claude-opus-5')).not.toThrow()

    const gate = inspect(staging, root)
    expect(gate.ok).toBe(false)
    if (!gate.ok) expect(gate.errors[0]?.file).toBe('course.json')
  })
})

describe('handing the errors back to the run that made them', () => {
  it('names the file and the field, and asks for nothing else', () => {
    const prompt = repairPrompt([
      { file: 'course.json', field: 'ladder', message: 'is missing' },
      { file: 'tasks/tsk-one.json', message: 'names an objective that is not there' },
    ])
    expect(prompt).toContain('- course.json · ladder: is missing')
    expect(prompt).toContain('- tasks/tsk-one.json: names an objective that is not there')
    expect(prompt).toContain('Do not start again')
  })
})

describe('the skills a run is given', () => {
  it('are files in the folder, so any harness can read them', () => {
    // Not a plugin. A plugin format belongs to one harness, and these carry the Course
    // format itself, so a harness that could not load them would author against nothing.
    const staging = join(box, 'with-skills')
    prepare(staging, TOOLKIT, SKILLS, { files: [], links: [] })

    const found = skillsIn(staging)
    expect(found.map((skill) => skill.name).sort()).toEqual([
      'course-format',
      'what-an-agent-can-judge',
      'writing-a-lesson',
      'writing-a-mini-app',
      'writing-a-task',
    ])
    for (const skill of found) {
      expect(skill.description).not.toBe('')
      expect(existsSync(join(staging, skill.path))).toBe(true)
      // A relative path, because the run is told to read it from its own folder.
      expect(skill.path.startsWith(`${HOUSE}/skills/`)).toBe(true)
    }
  })

  it('are offered to the run by path, which every harness can act on', () => {
    const staging = join(box, 'offered')
    prepare(staging, TOOLKIT, SKILLS, { files: [], links: [] })
    const offer = offerSkills(staging).join('\n')

    // Every skill that is there is named, so adding one cannot leave it undelivered.
    for (const skill of skillsIn(staging)) {
      expect(offer).toContain(skill.path)
      expect(offer).toContain(skill.description.split('\n')[0] as string)
    }
    expect(offer).toContain('files in this folder')
    expect(offerSkills(mkdtempSync(join(box, 'bare-')))).toEqual([])
  })

  it('are the app’s, and never ship inside the course', () => {
    const { root, staging } = scene()
    prepare(staging, TOOLKIT, SKILLS, { files: [], links: [] })
    cpSync(SAMPLE, staging, { recursive: true })
    expect(skillsIn(staging).length).toBe(5)

    const target = moveIn(staging, root, 'gradients-by-hand')
    expect(existsSync(join(target, HOUSE))).toBe(false)
    expect(existsSync(join(target, 'course.json'))).toBe(true)
  })

  it('leaves the course’s own skills alone, which sit somewhere else', () => {
    // The Constructor writes `.claude/skills/` for the Tutor to read (PLAN 3.8), so the
    // app must not seed into that folder and tidy away what it asked for.
    const { root, staging } = scene()
    prepare(staging, TOOLKIT, SKILLS, { files: [], links: [] })
    cpSync(SAMPLE, staging, { recursive: true })
    mkdirSync(join(staging, '.claude', 'skills', 'the-notation'), { recursive: true })
    writeFileSync(join(staging, '.claude', 'skills', 'the-notation', 'SKILL.md'), '---\nname: x\n---\n')

    const target = moveIn(staging, root, 'gradients-by-hand')
    expect(existsSync(join(target, '.claude', 'skills', 'the-notation', 'SKILL.md'))).toBe(true)
  })
})

describe('the brief’s tray', () => {
  it('puts the toolkit in before the run, so the course cannot pin its own idea of it', () => {
    const staging = join(box, 'prepared')
    prepare(staging, TOOLKIT, SKILLS, { files: [], links: [] })
    expect(existsSync(join(staging, 'toolkit', 'kit.js'))).toBe(true)
    // The tray is made even when it is empty. The Constructor is told its material lives
    // there, so a run that finds no folder reports "path not found" and spends a turn on it.
    expect(existsSync(join(staging, BRIEF))).toBe(true)
    expect(trayContents(staging)).toEqual([])
  })

  it('carries attached material into staging, where the run can read it', () => {
    // Test 16, the first half.
    const staging = join(box, 'with-tray')
    const note = join(box, 'my notes.md')
    writeFileSync(note, '# what I already know\n')

    prepare(staging, TOOLKIT, SKILLS, { files: [note], links: ['https://example.com/paper'] })
    expect(trayContents(staging)).toEqual(['links.json', 'my notes.md'])
    expect(readFileSync(join(staging, BRIEF, 'my notes.md'), 'utf8')).toContain('what I already know')
    expect(readFileSync(join(staging, BRIEF, 'links.json'), 'utf8')).toContain('example.com/paper')
  })

  it('leaves the attached material behind when the course moves in', () => {
    // Test 16, the second half. The tray is what the Constructor read, not what it wrote,
    // so a shared Course carries none of it.
    const { root, staging } = scene()
    const note = join(box, 'private.md')
    writeFileSync(note, 'do not ship me')
    mkdirSync(join(staging, BRIEF), { recursive: true })
    cpSync(note, join(staging, BRIEF, 'private.md'))

    const target = moveIn(staging, root, 'gradients-by-hand')
    expect(existsSync(join(target, BRIEF))).toBe(false)
  })
})

describe('what a harness leaves behind', () => {
  it('does not travel into the course', () => {
    // Found by running one. `pi` keeps `.pi/` beside whatever it is working on, and
    // `--session-dir` moves only the sessions, so the rest would ship inside the Course.
    const { root, staging } = scene()
    mkdirSync(join(staging, '.pi', 'tasks'), { recursive: true })
    writeFileSync(join(staging, '.pi', 'tasks', 'session-1'), 'not the course')

    const target = moveIn(staging, root, 'gradients-by-hand', ['.pi'])
    expect(existsSync(join(target, '.pi'))).toBe(false)
    expect(existsSync(join(target, 'course.json'))).toBe(true)
  })

  it('is taken out by name, never by guessing', () => {
    // A Course's own `.claude/skills/` is content the Constructor was told to write
    // (PLAN 3.8). A rule that stripped every dotted folder would take it with the litter.
    const { root, staging } = scene()
    mkdirSync(join(staging, '.pi'), { recursive: true })
    mkdirSync(join(staging, '.claude', 'skills', 'the-notation'), { recursive: true })
    writeFileSync(join(staging, '.claude', 'skills', 'the-notation', 'SKILL.md'), '---\nname: x\n---\n')

    const target = moveIn(staging, root, 'gradients-by-hand', ['.pi'])
    expect(existsSync(join(target, '.pi'))).toBe(false)
    expect(existsSync(join(target, '.claude', 'skills', 'the-notation', 'SKILL.md'))).toBe(true)
  })
})


/**
 * How big a course is, said at the gate.
 *
 * The failure this catches parses perfectly: a course that tours its subject in an
 * afternoon looks like one that teaches it until somebody counts. Measured on a real
 * generated course: seventeen Lessons at 174 words each, which is twelve minutes of
 * reading for something the reader asked to spend months on.
 */
describe('the size of a course', () => {
  it('counts pages, prose and tasks, and none of the machinery', () => {
    const result = parseCourse(join(import.meta.dirname, '..', 'fixtures', 'courses', 'gradients-by-hand'))
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const size = courseSize(result.course)
    expect(size.pages).toBe(6)
    expect(size.lessons).toBe(3)
    expect(size.tasks).toBe(8)
    // A Try's JSON is not words the reader reads, and neither is a Mini-app's code.
    expect(size.words).toBeGreaterThan(100)
    expect(size.perLesson).toBe(Math.round(size.words / size.lessons))
    const raw = Object.values(result.course.lessons).reduce(
      (total, lesson) => total + lesson.body.split(/\s+/).filter(Boolean).length,
      0,
    )
    expect(size.words).toBeLessThan(raw)
  })

  it('says it in one line, for the feed', () => {
    const result = parseCourse(join(import.meta.dirname, '..', 'fixtures', 'courses', 'gradients-by-hand'))
    if (!result.ok) throw new Error('fixture did not parse')
    const line = sizeLine(result.course)
    expect(line).toContain('6 pages')
    expect(line).toContain('a lesson')
    expect(line).toContain('8 tasks')
  })
})
