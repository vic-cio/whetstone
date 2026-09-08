import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import { DEPTHS } from '../src/shared/format'
import { readRegistry } from '../src/shared/harness'

/**
 * What the app hands a Harness: the registry, the role instruction files, and the skills.
 *
 * These are prose, so nothing here checks that they are good. What it checks is that they
 * are still true, because a skill describing a widget the toolkit no longer has is worse
 * than no skill: the Constructor believes it.
 */

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..')
const AGENT = join(ROOT, 'agent')
const SKILLS = join(AGENT, 'skills', 'authoring')

describe('what the app hands a harness', () => {
  it('ships a registry the app can read', () => {
    const result = readRegistry(readFileSync(join(AGENT, 'harnesses.json'), 'utf8'))
    expect(result.ok).toBe(true)
    if (result.ok) {
      const claude = result.harnesses.find((entry) => entry.id === 'claude')
      expect(claude?.adapter).toBe('claude')
      expect(claude?.command).toBe('claude')
      expect(claude?.models).toContain('claude-opus-5')
    }
  })

  it('ships an instruction file for each way the Constructor is spawned', () => {
    // Three: talking about a course, building one, and reading a complaint about one task.
    for (const role of ['constructor-brief', 'constructor-build', 'constructor-defect']) {
      expect(existsSync(join(AGENT, 'roles', `${role}.md`))).toBe(true)
    }
  })

  it('tells the Brief run that it writes nothing', () => {
    const brief = readFileSync(join(AGENT, 'roles', 'constructor-brief.md'), 'utf8')
    expect(brief).toContain('You write nothing')
  })

  it('carries every rule the plan says the Constructor prompt states', () => {
    const build = readFileSync(join(AGENT, 'roles', 'constructor-build.md'), 'utf8')
    // Numbered 1 to 21, with 7b, 9b, 9c and 14b beside their own.
    for (let rule = 1; rule <= 21; rule += 1) expect(build).toContain(`\n${rule}. `)
    for (const beside of ['7b.', '9b.', '9c.', '14b.']) expect(build).toContain(beside)
    // The two that were learned the hard way, rather than designed.
    expect(build).toContain('Marking a right answer wrong')
    expect(build).toContain('Depth and Check are independent')
  })

  /**
   * What a first real course got wrong, written down so it cannot be got wrong quietly
   * again. Measured: seventeen Lessons averaging 174 words, exactly one Try in every one of
   * them, and a Task the reader could not answer because the language it needed was a
   * paragraph rather than a Lesson.
   */
  it('tells the Constructor how big the course is, and how to teach rather than tour', () => {
    const build = readFileSync(join(AGENT, 'roles', 'constructor-build.md'), 'utf8')
    // A size, in numbers, because "long enough" is not an instruction.
    expect(build).toContain('600 to 1200 words')
    expect(build).toContain('30 to 60 Pages')
    expect(build).toContain('Count before you finish')
    // The three that produce a tour instead of a course.
    expect(build).toContain('mentioned, not taught')
    expect(build).toContain('Teach what you are about to rely on')
    expect(build).toContain('the destination, not the syllabus')
    // It has the web, and a course about a real tool is built on that tool's own documents.
    expect(build).toContain('Read before you write')
  })

  it('tells the lesson skill the same length, so the two cannot drift', () => {
    const lesson = readFileSync(join(SKILLS, 'writing-a-lesson', 'SKILL.md'), 'utf8')
    expect(lesson).toContain('600 to 1200 words')
    expect(lesson).toContain('worked example')
    // Every lesson carrying exactly one Try is the shape of a template, not of a course.
    expect(lesson).toContain('is a template')
  })

  /**
   * How a Lesson teaches, as opposed to how it is formatted. The three staged shapes are
   * the standard ones from language teaching, where a lesson has to work in an hour with no
   * shared vocabulary; the problem generalises because it is the same problem.
   */
  it('carries the staging skill, and the two rules that decide whether anybody learns', () => {
    const staging = readFileSync(join(SKILLS, 'staging-a-lesson', 'SKILL.md'), 'utf8')
    // Context before the rule, and a check aimed at the concept rather than at whether the
    // reader thinks they followed.
    expect(staging).toContain('Build the context first')
    expect(staging).toContain('Check the concept, not the comprehension')
    // A wrong option is a misconception somebody holds, or it is filler.
    expect(staging).toContain('The wrong options are the lesson')
    // The alternative shape: diagnose, teach the gap, then use it freely.
    expect(staging).toContain('Test, teach, test')
    // A Try and a Task are two instruments, not two difficulty levels.
    expect(staging).toContain('Controlled practice and free use are different instruments')

    // And the two files that would otherwise drift from it say the same thing.
    expect(readFileSync(join(SKILLS, 'writing-a-lesson', 'SKILL.md'), 'utf8')).toContain('staging-a-lesson')
    expect(readFileSync(join(SKILLS, 'writing-a-task', 'SKILL.md'), 'utf8')).toContain('misconception')
    const build = readFileSync(join(AGENT, 'roles', 'constructor-build.md'), 'utf8')
    expect(build).toContain('may also **open** with a short Test')
    expect(build).toContain('14b.')
  })

  /**
   * Repetition, and what kind. Measured on a real build: six questions per objective, of
   * which 31 out of 42 were multiple choice, every one of them inside the test at the end
   * of the module the idea was introduced in.
   */
  it('asks for an idea to be practised more than once, and not all in one sitting', () => {
    const build = readFileSync(join(AGENT, 'roles', 'constructor-build.md'), 'utf8')
    expect(build).toContain('Practise an idea more than once, and not all at once')
    expect(build).toContain('Repetition is not identical repetition')
    const task = readFileSync(join(SKILLS, 'writing-a-task', 'SKILL.md'), 'utf8')
    expect(task).toContain('How many questions one idea gets')
    expect(task).toContain('In more than one Test')
    // And the run is told the app measures it, so it can aim above the floor first.
    expect(build).toContain('The app counts too')
  })

  it('tells the mini-app skill to build the subject, not a quiz with buttons', () => {
    const app = readFileSync(join(SKILLS, 'writing-a-mini-app', 'SKILL.md'), 'utf8')
    expect(app).toContain('A playable version of the subject')
    expect(app).toContain('multiple-choice question that')
    // The frame has no network and a whole browser. Both halves have to be said, or a
    // course about sound comes out as a picture of a sequencer.
    expect(app).toContain('The frame has no network. It does have the whole browser')
    expect(app).toContain('Synthesise')
    expect(app).toContain('base64')
  })

  it('says the Course’s own guidance outranks whatever is on the machine', () => {
    // PLAN 3.13: the app drops the `user` setting source, and the role file says so too,
    // because two mechanisms that must both fail is the point.
    for (const role of ['constructor-brief', 'constructor-build', 'constructor-defect']) {
      expect(readFileSync(join(AGENT, 'roles', `${role}.md`), 'utf8')).toContain('outranks')
    }
  })

  it('ships the skills the plan lists, as plain files rather than a plugin', () => {
    // A plugin format belongs to one harness, and these carry the Course format itself, so
    // a harness that could not load them would author against nothing (PLAN 3.9).
    expect(existsSync(join(AGENT, 'bundles'))).toBe(false)
    const skills = readdirSync(SKILLS).sort()
    expect(skills).toEqual([
      'course-format',
      'staging-a-lesson',
      'what-an-agent-can-judge',
      'writing-a-lesson',
      'writing-a-mini-app',
      'writing-a-task',
    ])
    for (const skill of skills) {
      const text = readFileSync(join(SKILLS, skill, 'SKILL.md'), 'utf8')
      // The description is what the run's prompt offers it by, so it has to be there.
      expect(text.startsWith('---\nname: ')).toBe(true)
      expect(text).toContain('\ndescription: ')
    }
  })

  it('describes only widgets the toolkit actually has', () => {
    const kit = readFileSync(join(ROOT, 'toolkit', 'kit.js'), 'utf8')
    const skill = readFileSync(join(SKILLS, 'writing-a-mini-app', 'SKILL.md'), 'utf8')
    const named = new Set([...skill.matchAll(/Kit\.([a-z]+)/g)].map((match) => match[1]))

    expect(named.size).toBeGreaterThan(6)
    for (const widget of named) {
      if (widget === 'bridge' || widget === 'theme') continue
      expect(kit, `the skill promises Kit.${widget}`).toContain(`${widget}: ${widget},`)
    }
  })

  it('names every Depth and every deterministic kind the format has', () => {
    const format = readFileSync(join(SKILLS, 'course-format', 'SKILL.md'), 'utf8')
    const task = readFileSync(join(SKILLS, 'writing-a-task', 'SKILL.md'), 'utf8')
    for (const depth of DEPTHS) expect(task).toContain(depth)
    for (const kind of ['multiple-choice', 'accepted-answers', 'numeric', 'ordering', 'app-result', 'assertions-pass']) {
      expect(task).toContain(kind)
    }
    for (const prefix of ['obj-', 'mod-', 'les-', 'tst-', 'tsk-', 'try-', 'res-', 'cri-']) {
      expect(format).toContain(prefix)
    }
  })
})
