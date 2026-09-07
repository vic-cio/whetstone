import { describe, it, expect, beforeEach } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { parseCourse } from '../src/shared/parseCourse'
import { openProgress } from '../src/main/progress'
import { carryWork } from '../src/main/reviewer'
import type { Progress } from '../src/main/progress'

/**
 * A Project, and the Reviewer that reads one.
 *
 * The work is done outside the app with ordinary tools and comes back as a folder and some
 * links. What comes back the other way is one written response and no mark, so what these
 * check is the two places that could quietly go wrong: what the app copies off somebody's
 * disk, and what it keeps afterwards (PLAN 3.15, phase 6).
 */

const ROOT = join(import.meta.dirname, '..')
const FIXTURE = join(ROOT, 'fixtures', 'courses', 'gradients-by-hand')
const SLUG = 'gradients-by-hand'

let progress: Progress

beforeEach(() => {
  progress = openProgress(':memory:')
})

describe('a course that carries a project', () => {
  it('parses, and the criteria are there before the work starts', () => {
    const parsed = parseCourse(FIXTURE)
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    const project = parsed.course.projects[0]
    expect(project?.id).toBe('prj-two-layer-by-hand')
    expect(project?.criteria.length).toBeGreaterThan(0)
    expect(project?.accepts).toEqual(['folder', 'links'])
    // A Project is a top-level array, not a Page. Nothing in the modules names it, so the
    // rail, the tick rules and the next-page logic never see it.
    const pages = parsed.course.modules.flatMap((module) => module.pages).map((page) => page.id)
    expect(pages).not.toContain(project?.id)
  })
})

describe('carrying somebody’s project folder', () => {
  /** A folder shaped like a real one: some work, a repository, and a package tree. */
  function aProject(): string {
    const dir = mkdtempSync(join(tmpdir(), 'whetstone-project-'))
    writeFileSync(join(dir, 'notes.md'), '# What I did\n')
    mkdirSync(join(dir, 'src'), { recursive: true })
    writeFileSync(join(dir, 'src', 'net.py'), 'print("forward")\n')
    mkdirSync(join(dir, '.git', 'objects'), { recursive: true })
    writeFileSync(join(dir, '.git', 'objects', 'blob'), 'x'.repeat(1000))
    mkdirSync(join(dir, 'node_modules', 'left-pad'), { recursive: true })
    writeFileSync(join(dir, 'node_modules', 'left-pad', 'index.js'), 'module.exports = 1\n')
    return dir
  }

  it('carries the work and leaves the machinery behind', () => {
    const into = join(mkdtempSync(join(tmpdir(), 'whetstone-into-')), 'work')
    const carried = carryWork(aProject(), into)

    expect(carried.files).toBe(2)
    expect(carried.cut).toBe(false)
    expect(existsSync(join(into, 'notes.md'))).toBe(true)
    expect(existsSync(join(into, 'src', 'net.py'))).toBe(true)
    // The first submission would otherwise copy four gigabytes into the app's own folder,
    // and none of it is the work.
    expect(readdirSync(into).sort()).toEqual(['notes.md', 'src'])
    expect(existsSync(join(into, '.git'))).toBe(false)
    expect(existsSync(join(into, 'node_modules'))).toBe(false)
  })
})

describe('what the app keeps of a project', () => {
  it('keeps every response, newest first, and no mark of any kind', () => {
    progress.recordSubmission({
      courseSlug: SLUG,
      projectId: 'prj-two-layer-by-hand',
      links: ['https://example.com/notebook'],
      responseText: 'The backward pass is right and the shapes are not.',
    })
    progress.recordSubmission({
      courseSlug: SLUG,
      projectId: 'prj-two-layer-by-hand',
      links: [],
      responseText: 'Better. The shapes agree now.',
    })

    const kept = progress.submissionsFor(SLUG, 'prj-two-layer-by-hand')
    expect(kept).toHaveLength(2)
    // Text, links and a time. There is nowhere in the row for a score to go.
    for (const one of kept) {
      expect(Object.keys(one).sort()).toEqual(['id', 'links', 'responseText', 'submittedAt'])
    }
    expect(kept.some((one) => one.responseText.startsWith('Better'))).toBe(true)
  })

  it('forgets them with the course, because they are about that course', () => {
    progress.recordSubmission({
      courseSlug: SLUG,
      projectId: 'prj-two-layer-by-hand',
      links: [],
      responseText: 'One response.',
    })
    progress.forget(SLUG)
    expect(progress.submissionsFor(SLUG, 'prj-two-layer-by-hand')).toEqual([])
  })
})

describe('what the reviewer is told', () => {
  const role = readFileSync(join(ROOT, 'agent', 'roles', 'reviewer.md'), 'utf8')

  it('is a senior colleague reading the work, not a marker scoring it', () => {
    expect(role).toContain('senior colleague')
    expect(role).toContain('no score')
  })

  /**
   * The rule most likely to be broken by accident, because every model has read a thousand
   * rubrics. There is nowhere in the database for a mark, so one in the prose would be the
   * only score in the app.
   */
  it('is told not to give a mark of any kind', () => {
    expect(role).toContain('Do not give a mark, a percentage, a grade or a rating')
    expect(role).toContain('Do not say "pass"')
  })

  it('is told there is no thread, because there is not one', () => {
    expect(role).toContain('there is no thread here')
    expect(role).toContain('you will not remember this one')
  })

  it('ships the skill it is told to read', () => {
    const skill = join(ROOT, 'agent', 'skills', 'reviewing', 'reading-a-project', 'SKILL.md')
    expect(existsSync(skill)).toBe(true)
    const text = readFileSync(skill, 'utf8')
    expect(text.startsWith('---\nname: ')).toBe(true)
    expect(text).toContain('project.json')
  })
})
