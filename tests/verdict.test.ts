import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { guardFolder, sayChanged } from '../src/shared/guard'
import { readVerdict, schemaFor } from '../src/shared/verdict'

/**
 * Test 4: a Grader returns a complete Verdict, and a partial one is recorded as an error
 * and never as a fail.
 * Test 12: a Tutor spawn cannot modify the Course folder. With writes forced, the check
 * puts it back and reports.
 *
 * The rule underneath test 4 is the one worth stating: telling somebody they got something
 * wrong because a run ran out of budget halfway is the worst thing this app could do to
 * them, so anything short of a whole Verdict is trouble rather than an outcome.
 */

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..')
const SAMPLE = join(ROOT, 'fixtures', 'courses', 'gradients-by-hand')

const whole = {
  kind: 'short' as const,
  outcome: 'fail' as const,
  reason: 'The answer names the symptom rather than the cause.',
}

describe('reading what a grader came back with', () => {
  it('takes a complete short verdict', () => {
    expect(readVerdict(whole, [])).toEqual({ at: 'judged', verdict: whole })
  })

  it('refuses a verdict with a field missing, and records nothing', () => {
    for (const partial of [
      { kind: 'short', outcome: 'fail' },
      { kind: 'short', outcome: 'fail', reason: '' },
      { kind: 'short', reason: 'no' },
      { kind: 'short', outcome: 'maybe', reason: 'hm' },
      {},
      null,
      'fail',
    ]) {
      const judged = readVerdict(partial, [])
      expect(judged.at).toBe('trouble')
      if (judged.at === 'trouble') expect(judged.message).toContain('nothing was recorded')
    }
  })

  it('scores exactly the criteria the task declares, or nothing at all', () => {
    const criteria = ['cri-one', 'cri-two']
    const line = (id: string): unknown => ({ id, met: true, evidence: 'line 4', missing: 'nothing' })
    const rubric = (ids: string[]): unknown => ({
      kind: 'rubric',
      outcome: 'pass',
      reason: 'Both are there.',
      criteria: ids.map(line),
    })

    expect(readVerdict(rubric(criteria), criteria).at).toBe('judged')
    // One skipped, one invented, and one scored twice. None of them is a score.
    expect(readVerdict(rubric(['cri-one']), criteria).at).toBe('trouble')
    expect(readVerdict(rubric(['cri-one', 'cri-three']), criteria).at).toBe('trouble')
    expect(readVerdict(rubric(['cri-one', 'cri-one']), criteria).at).toBe('trouble')
  })

  it('will not take a short verdict for a task that has a rubric, or the other way round', () => {
    expect(readVerdict(whole, ['cri-one']).at).toBe('trouble')
    const rubric = {
      kind: 'rubric',
      outcome: 'pass',
      reason: 'y',
      criteria: [{ id: 'cri-one', met: true, evidence: 'e', missing: 'nothing' }],
    }
    expect(readVerdict(rubric, []).at).toBe('trouble')
  })

  it('asks for what it will accept, so a harness can refuse itself first', () => {
    // PLAN 3.11: the CLI validates structured output against this before the app sees it.
    const short = schemaFor([]) as Record<string, unknown>
    expect(short['required']).toEqual(['kind', 'outcome', 'reason'])

    const rubric = schemaFor(['cri-one', 'cri-two']) as { properties: Record<string, any> }
    expect(rubric.properties['criteria'].minItems).toBe(2)
    expect(rubric.properties['criteria'].maxItems).toBe(2)
    expect(rubric.properties['criteria'].items.properties.id.enum).toEqual(['cri-one', 'cri-two'])
    expect(rubric.properties['criteria'].items.required).toEqual(['id', 'met', 'evidence', 'missing'])
  })
})

describe('a course a run was let into', () => {
  let box = ''
  beforeAll(() => {
    box = mkdtempSync(join(tmpdir(), 'whetstone-guard-'))
  })
  afterAll(() => rmSync(box, { recursive: true, force: true }))

  const scene = (): { course: string; shadow: string } => {
    const where = mkdtempSync(join(box, 'run-'))
    const course = join(where, 'course')
    cpSync(SAMPLE, course, { recursive: true })
    return { course, shadow: join(where, 'shadow') }
  }

  it('says nothing happened when nothing happened', () => {
    const { course, shadow } = scene()
    const guard = guardFolder(course, shadow)
    readFileSync(join(course, 'course.json'), 'utf8')
    expect(guard.check()).toEqual([])
    guard.release()
    expect(existsSync(shadow)).toBe(false)
  })

  it('puts back a file that was changed, and reports it', () => {
    // Test 12. The harness's own flags are two layers above this one, and a recorded run
    // showed that a refusal there never reaches the app. This is the layer that does.
    const { course, shadow } = scene()
    const lesson = join(course, 'lessons', 'les-the-chain-rule.md')
    const was = readFileSync(lesson, 'utf8')
    const guard = guardFolder(course, shadow)

    writeFileSync(lesson, `${was}\n\nAnd here is what I think about it.\n`)
    const changes = guard.check()

    expect(changes).toEqual([{ file: 'lessons/les-the-chain-rule.md', what: 'changed' }])
    expect(readFileSync(lesson, 'utf8')).toBe(was)
    expect(sayChanged(changes)).toBe(
      'The tutor changed lessons/les-the-chain-rule.md in this course. That has been undone.',
    )
    guard.release()
  })

  it('puts back a file that was deleted and takes away one that was added', () => {
    const { course, shadow } = scene()
    const guard = guardFolder(course, shadow)

    rmSync(join(course, 'resources.json'))
    writeFileSync(join(course, 'notes.md'), 'mine now')
    mkdirSync(join(course, 'extra'), { recursive: true })
    writeFileSync(join(course, 'extra', 'deep.txt'), 'also mine')

    const changes = guard.check()
    expect(changes).toEqual([
      { file: 'extra/deep.txt', what: 'added' },
      { file: 'notes.md', what: 'added' },
      { file: 'resources.json', what: 'removed' },
    ])
    expect(existsSync(join(course, 'resources.json'))).toBe(true)
    expect(existsSync(join(course, 'notes.md'))).toBe(false)
    expect(existsSync(join(course, 'extra'))).toBe(false)
    guard.release()
  })

  it('counts the rest rather than listing them at somebody', () => {
    const { course, shadow } = scene()
    const guard = guardFolder(course, shadow)
    writeFileSync(join(course, 'a.md'), 'one')
    writeFileSync(join(course, 'b.md'), 'two')
    writeFileSync(join(course, 'c.md'), 'three')
    expect(sayChanged(guard.check())).toBe('The tutor changed a.md and 2 other files in this course. That has been undone.')
    guard.release()
  })
})
