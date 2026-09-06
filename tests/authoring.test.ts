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
    for (const role of ['constructor-brief', 'constructor-build']) {
      expect(existsSync(join(AGENT, 'roles', `${role}.md`))).toBe(true)
    }
  })

  it('tells the Brief run that it writes nothing', () => {
    const brief = readFileSync(join(AGENT, 'roles', 'constructor-brief.md'), 'utf8')
    expect(brief).toContain('You write nothing')
  })

  it('carries every rule the plan says the Constructor prompt states', () => {
    const build = readFileSync(join(AGENT, 'roles', 'constructor-build.md'), 'utf8')
    // Numbered 1 to 17, with 9b and 9c beside 9.
    for (let rule = 1; rule <= 17; rule += 1) expect(build).toContain(`\n${rule}. `)
    expect(build).toContain('9b.')
    expect(build).toContain('9c.')
    // The two that were learned the hard way, rather than designed.
    expect(build).toContain('Marking a right answer wrong')
    expect(build).toContain('Depth and Check are independent')
  })

  it('says the Course’s own guidance outranks whatever is on the machine', () => {
    // PLAN 3.13: the app drops the `user` setting source, and the role file says so too,
    // because two mechanisms that must both fail is the point.
    for (const role of ['constructor-brief', 'constructor-build']) {
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
