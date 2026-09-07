import { describe, it, expect, beforeAll } from 'vitest'
import { mkdtempSync, cpSync, writeFileSync, rmSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { parseCourse } from '../src/shared/parseCourse'
import { DEPTHS, CHECKS } from '../src/shared/format'
import type { Course, Task } from '../src/shared/format'
import { TOOLKIT_VERSION } from '../src/shared/miniapp'

const FIXTURE = join(import.meta.dirname, '..', 'fixtures', 'courses', 'gradients-by-hand')

/** Copy the fixture somewhere writable and mutate one file, so each malformed case is isolated. */
function brokenCopy(mutate: (dir: string) => void): string {
  const dir = join(mkdtempSync(join(tmpdir(), 'whetstone-')), 'course')
  cpSync(FIXTURE, dir, { recursive: true })
  mutate(dir)
  return dir
}

function editJson(dir: string, rel: string, edit: (value: any) => void): void {
  const path = join(dir, rel)
  const value = JSON.parse(readFileSync(path, 'utf8'))
  edit(value)
  writeFileSync(path, JSON.stringify(value, null, 2))
}

describe('test 1 — the fixture course parses', () => {
  let course: Course

  beforeAll(() => {
    const result = parseCourse(FIXTURE)
    if (!result.ok) throw new Error('fixture did not parse:\n' + result.errors.map((e) => `${e.file}: ${e.field ?? ''} ${e.message}`).join('\n'))
    course = result.course
  })

  it('reads the manifest', () => {
    expect(course.id).toBe('gradients-by-hand')
    expect(course.subject).toBe('Machine learning')
    // Every fixture Course is pinned to the toolkit this build ships, so a version
    // bump does not leave a Course behind and this line does not become churn.
    expect(course.toolkitVersion).toBe(TOOLKIT_VERSION)
  })

  it('reads three modules, each a lesson then a test', () => {
    expect(course.modules).toHaveLength(3)
    for (const module of course.modules) {
      expect(module.pages.map((p) => p.type)).toEqual(['lesson', 'test'])
    }
  })

  it('resolves every page to a file', () => {
    const pages = course.modules.flatMap((m) => m.pages)
    expect(pages).toHaveLength(6)
    for (const page of pages) {
      if (page.type === 'lesson') expect(course.lessons[page.id]).toBeDefined()
      else expect(course.tests[page.id]).toBeDefined()
    }
  })

  it('resolves every task named by a test, and every task names a real objective', () => {
    const objectiveIds = new Set(course.objectives.map((o) => o.id))
    for (const test of Object.values(course.tests)) {
      expect(test.tasks.length).toBeGreaterThan(0)
      for (const taskId of test.tasks) {
        const task = course.tasks[taskId]
        expect(task, `test ${test.id} names a task that does not exist: ${taskId}`).toBeDefined()
        expect(objectiveIds.has(task!.objective)).toBe(true)
      }
    }
  })

  it('uses four of the five rungs, leaving project out', () => {
    expect(course.ladder).toEqual(['recall', 'apply', 'construct', 'transfer'])
    expect(course.ladder).not.toContain('project')
  })
})

describe('test 1 — a malformed course fails with the file and the field named', () => {
  it('rejects a manifest missing a required field', () => {
    const dir = brokenCopy((d) => editJson(d, 'course.json', (c) => delete c.title))
    const result = parseCourse(dir)
    expect(result.ok).toBe(false)
    if (result.ok) return
    const error = result.errors.find((e) => e.file === 'course.json')
    expect(error).toBeDefined()
    expect(error!.field).toBe('title')
    rmSync(dir, { recursive: true, force: true })
  })

  it('rejects a task whose objective does not exist, naming the task file', () => {
    const dir = brokenCopy((d) => editJson(d, 'tasks/tsk-sin-of-3x2.json', (t) => { t.objective = 'obj-does-not-exist' }))
    const result = parseCourse(dir)
    expect(result.ok).toBe(false)
    if (result.ok) return
    const error = result.errors.find((e) => e.file === 'tasks/tsk-sin-of-3x2.json')
    expect(error).toBeDefined()
    expect(error!.field).toBe('objective')
    expect(error!.message).toContain('obj-does-not-exist')
    rmSync(dir, { recursive: true, force: true })
  })

  it('rejects a page that points at no file', () => {
    const dir = brokenCopy((d) => editJson(d, 'course.json', (c) => { c.modules[0].pages[0].id = 'les-missing' }))
    const result = parseCourse(dir)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.errors.some((e) => e.message.includes('les-missing'))).toBe(true)
    rmSync(dir, { recursive: true, force: true })
  })

  it('rejects a task at a depth the course ladder does not use', () => {
    const dir = brokenCopy((d) => editJson(d, 'tasks/tsk-slope-of-flat.json', (t) => { t.depth = 'project' }))
    const result = parseCourse(dir)
    expect(result.ok).toBe(false)
    if (result.ok) return
    const error = result.errors.find((e) => e.field === 'depth')
    expect(error).toBeDefined()
    expect(error!.message).toContain('ladder')
    rmSync(dir, { recursive: true, force: true })
  })

  it('reports malformed JSON without throwing', () => {
    const dir = brokenCopy((d) => writeFileSync(join(d, 'course.json'), '{ this is not json'))
    expect(() => parseCourse(dir)).not.toThrow()
    const result = parseCourse(dir)
    expect(result.ok).toBe(false)
    rmSync(dir, { recursive: true, force: true })
  })
})

describe('test 2 — depth and check are independent axes', () => {
  let course: Course

  beforeAll(() => {
    const result = parseCourse(FIXTURE)
    if (!result.ok) throw new Error('fixture did not parse')
    course = result.course
  })

  it('accepts a transfer-depth task whose check is deterministic', () => {
    // A Mini-app is how a hard question stays answerable offline. Free text is not: the
    // fixture's one open-ended question is a model check, which is the point of rule 9c.
    const task = course.tasks['tsk-place-the-factors']
    expect(task).toBeDefined()
    expect(task!.depth).toBe('transfer')
    expect(task!.check).toBe('deterministic')
  })

  it('sends an open-ended question to a model rather than to a list', () => {
    const task = course.tasks['tsk-why-gradients-vanish']
    expect(task!.check).toBe('model')
    expect(task).toHaveProperty('answerGuide')
  })

  it('accepts a transfer-depth task whose check is a rubric, so the axes move freely in both directions', () => {
    const task = course.tasks['tsk-two-layer-writeup']
    expect(task!.depth).toBe('transfer')
    expect(task!.check).toBe('rubric')
  })

  it('treats every depth and check pairing as legal', () => {
    for (const depth of DEPTHS) {
      for (const check of CHECKS) {
        const built = {
          id: 'tsk-probe', objective: 'obj-chain-rule', depth, check,
          prompt: 'probe',
          ...(check === 'deterministic'
            ? { kind: 'multiple-choice' as const, options: ['a', 'b'], answer: [0] }
            : check === 'model'
              ? { kind: 'short-answer' as const, answerGuide: 'anything' }
              : { kind: 'submission' as const, accepts: ['.pdf'], rubric: [{ id: 'cri-1', criterion: 'is present' }] }),
        }
        const dir = brokenCopy((d) => {
          editJson(d, 'course.json', (c) => { c.ladder = [...DEPTHS] })
          writeFileSync(join(d, 'tasks', 'tsk-probe.json'), JSON.stringify(built, null, 2))
          editJson(d, 'tests/tst-chain-rule.json', (t) => t.tasks.push('tsk-probe'))
        })
        const result = parseCourse(dir)
        expect(result.ok, `${depth} + ${check} was rejected`).toBe(true)
        rmSync(dir, { recursive: true, force: true })
      }
    }
  })
})

describe('test 3 — depth belongs to a task, never to a module', () => {
  it('accepts a recall task inside the last module', () => {
    const result = parseCourse(FIXTURE)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const course = result.course
    const lastModule = course.modules.at(-1)!
    const lastTest = course.tests[lastModule.pages.at(-1)!.id]!
    const depths = lastTest.tasks.map((id) => course.tasks[id]!.depth)
    expect(depths).toContain('recall')
    expect(depths).toContain('transfer')
  })

  it('does not require a module to hold a single depth', () => {
    const result = parseCourse(FIXTURE)
    if (!result.ok) throw new Error('fixture did not parse')
    const course = result.course
    const perTest = Object.values(course.tests).map((t) => new Set(t.tasks.map((id) => course.tasks[id]!.depth)))
    expect(perTest.some((set) => set.size > 1)).toBe(true)
  })
})

describe('test 3b — a Lesson holds no recorded Tasks', () => {
  let course: Course

  beforeAll(() => {
    const result = parseCourse(FIXTURE)
    if (!result.ok) throw new Error('fixture did not parse')
    course = result.course
  })

  it('reads try blocks out of a lesson and keeps them separate from tasks', () => {
    const lesson = course.lessons['les-the-chain-rule']!
    expect(lesson.tries).toContain('try-inner-derivative')
    expect(course.tasks['try-inner-derivative']).toBeUndefined()
  })

  it('puts every recorded task inside a test, never inside a lesson', () => {
    const inTests = new Set(Object.values(course.tests).flatMap((t) => t.tasks))
    for (const id of Object.keys(course.tasks)) {
      expect(inTests.has(id), `task ${id} is not reachable from any test`).toBe(true)
    }
  })

  it('rejects a lesson whose try id is written as a task id', () => {
    // The prefixes make a collision structurally impossible: a Try is `try-`, a Task is
    // `tsk-`. The collision check in the parser stays as a second line of defence.
    const dir = brokenCopy((d) => {
      const path = join(d, 'lessons', 'les-the-chain-rule.md')
      writeFileSync(path, readFileSync(path, 'utf8').replace('try-inner-derivative', 'tsk-sin-of-3x2'))
    })
    const result = parseCourse(dir)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors[0]?.message).toMatch(/try-/)
    rmSync(dir, { recursive: true, force: true })
  })

  it('reads the question inside a try block, and refuses one without a question', () => {
    const lesson = course.lessons['les-the-chain-rule']!
    const block = lesson.blocks.find((b) => b.block === 'try')
    expect(block?.block).toBe('try')
    if (block?.block === 'try') {
      expect(block.question.kind).toBe('multiple-choice')
      expect(block.question.id).toBe('try-inner-derivative')
    }

    const dir = brokenCopy((d) => {
      const path = join(d, 'lessons', 'les-the-chain-rule.md')
      const text = readFileSync(path, 'utf8')
      const start = text.indexOf(':::try{id=try-inner-derivative}')
      writeFileSync(path, text.slice(0, start) + ':::try{id=try-inner-derivative}\n:::\n')
    })
    const result = parseCourse(dir)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors.some((e) => /has no question/.test(e.message))).toBe(true)
    rmSync(dir, { recursive: true, force: true })
  })

  it('keeps prose and blocks in the order they were written', () => {
    const lesson = course.lessons['les-what-a-derivative-measures']!
    expect(lesson.blocks.map((block) => block.block)).toEqual([
      'prose', 'callout', 'app', 'prose', 'try', 'resource',
    ])
  })

  it('rejects a block that is never closed', () => {
    const dir = brokenCopy((d) => {
      const path = join(d, 'lessons', 'les-one-layer-at-a-time.md')
      writeFileSync(path, readFileSync(path, 'utf8').replace(/:::\n$/, ''))
    })
    const result = parseCourse(dir)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors.some((e) => /never closed/.test(e.message))).toBe(true)
    rmSync(dir, { recursive: true, force: true })
  })
})

/**
 * Part B, section 4. Three format changes land together, because the parser, the authoring
 * skills, the Constructor's instructions and every Course already written move as one.
 */
describe('test 4 — a task that follows another', () => {
  /** Give `tsk-why-gradients-vanish` a `follows`, and read what the parser says. */
  function withFollows(follows: string[]): ReturnType<typeof parseCourse> {
    const dir = brokenCopy((d) => {
      editJson(d, 'tasks/tsk-why-gradients-vanish.json', (task) => {
        task.follows = follows
      })
    })
    const result = parseCourse(dir)
    rmSync(dir, { recursive: true, force: true })
    return result
  }

  it('accepts a task that follows one earlier in the same test', () => {
    // tst-chain-rule holds sin-of-3x2, then why-gradients-vanish, then place-the-factors.
    expect(withFollows(['tsk-sin-of-3x2']).ok).toBe(true)
  })

  it('refuses a task that follows one later in the same test, because that answer is not given yet', () => {
    const result = withFollows(['tsk-place-the-factors'])
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors.some((e) => /comes later/.test(e.message))).toBe(true)
  })

  it('refuses a task that follows one in another test', () => {
    const result = withFollows(['tsk-slope-of-flat'])
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors.some((e) => /does not hold/.test(e.message))).toBe(true)
  })

  it('refuses a task that follows one the course does not have', () => {
    const result = withFollows(['tsk-nowhere'])
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors.some((e) => /does not exist/.test(e.message))).toBe(true)
  })

  /**
   * A cycle needs one of its Tasks to follow a later one, so the ordering rule already
   * refuses it. This checks that, rather than a separate cycle pass that cannot fire.
   */
  it('refuses a pair that follow each other', () => {
    const dir = brokenCopy((d) => {
      editJson(d, 'tasks/tsk-sin-of-3x2.json', (task) => {
        task.follows = ['tsk-why-gradients-vanish']
      })
      editJson(d, 'tasks/tsk-why-gradients-vanish.json', (task) => {
        task.follows = ['tsk-sin-of-3x2']
      })
    })
    const result = parseCourse(dir)
    expect(result.ok).toBe(false)
    rmSync(dir, { recursive: true, force: true })
  })
})

describe('test 4 — a test says how long it should take', () => {
  it('reads an indicative time, and needs none', () => {
    const dir = brokenCopy((d) => {
      editJson(d, 'tests/tst-chain-rule.json', (test) => {
        test.minutes = 20
      })
    })
    const result = parseCourse(dir)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.course.tests['tst-chain-rule']?.minutes).toBe(20)
      expect(result.course.tests['tst-derivatives']?.minutes).toBeUndefined()
    }
    rmSync(dir, { recursive: true, force: true })
  })
})

describe('test 4 — tags, small, and projects', () => {
  const project = {
    id: 'prj-two-layer-net',
    title: 'Train a two-layer network by hand',
    brief: 'Work through one network on paper, then check it in code.',
    criteria: [{ id: 'cri-shows-the-backward-pass', criterion: 'Shows every backward step' }],
    accepts: ['folder', 'links'],
  }

  it('defaults all three, so every course written before this still parses', () => {
    const dir = brokenCopy((d) => {
      editJson(d, 'course.json', (manifest) => {
        delete manifest.tags
        delete manifest.small
        delete manifest.projects
      })
    })
    const result = parseCourse(dir)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.course.tags).toEqual([])
      expect(result.course.small).toBe(false)
      expect(result.course.projects).toEqual([])
    }
    rmSync(dir, { recursive: true, force: true })
  })

  it('reads tags and a project', () => {
    const dir = brokenCopy((d) => {
      editJson(d, 'course.json', (manifest) => {
        manifest.tags = ['machine-learning', 'calculus']
        manifest.projects = [project]
      })
    })
    const result = parseCourse(dir)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.course.tags).toEqual(['machine-learning', 'calculus'])
      expect(result.course.projects[0]?.id).toBe('prj-two-layer-net')
    }
    rmSync(dir, { recursive: true, force: true })
  })

  it('refuses a tag that is not lowercase, because three spellings of one tag filter nothing', () => {
    const dir = brokenCopy((d) => {
      editJson(d, 'course.json', (manifest) => {
        manifest.tags = ['ML']
      })
    })
    const result = parseCourse(dir)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors.some((e) => /lowercase and hyphenated/.test(e.message))).toBe(true)
    rmSync(dir, { recursive: true, force: true })
  })

  it('refuses the same tag twice', () => {
    const dir = brokenCopy((d) => {
      editJson(d, 'course.json', (manifest) => {
        manifest.tags = ['calculus', 'calculus']
      })
    })
    const result = parseCourse(dir)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors.some((e) => /listed twice/.test(e.message))).toBe(true)
    rmSync(dir, { recursive: true, force: true })
  })

  it('refuses a small course that carries a project', () => {
    const dir = brokenCopy((d) => {
      editJson(d, 'course.json', (manifest) => {
        manifest.small = true
        manifest.projects = [project]
      })
    })
    const result = parseCourse(dir)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors.some((e) => /marked small/.test(e.message))).toBe(true)
    rmSync(dir, { recursive: true, force: true })
  })

  it('refuses a project that takes something the app cannot take back', () => {
    const dir = brokenCopy((d) => {
      editJson(d, 'course.json', (manifest) => {
        manifest.projects = [{ ...project, accepts: ['.pdf'] }]
      })
    })
    expect(parseCourse(dir).ok).toBe(false)
    rmSync(dir, { recursive: true, force: true })
  })

  it('refuses a project with no criteria, because the work would not be finishable', () => {
    const dir = brokenCopy((d) => {
      editJson(d, 'course.json', (manifest) => {
        manifest.projects = [{ ...project, criteria: [] }]
      })
    })
    expect(parseCourse(dir).ok).toBe(false)
    rmSync(dir, { recursive: true, force: true })
  })
})
