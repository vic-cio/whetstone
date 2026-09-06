import { describe, expect, it } from 'vitest'
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { SERVICES, serviceProblem, serviceReply } from '../src/shared/services'
import { START } from '../src/shared/chess'
import { parseCourse } from '../src/shared/parseCourse'

const CHESS_COURSE = join(import.meta.dirname, '..', 'fixtures', 'courses', 'forks-and-pins')
const uses = [{ id: 'chess', version: '1.0.0' }]

/** A copy of the chess Course somewhere writable, for the cases that need a broken one. */
function copyCourse(): string {
  const dir = join(mkdtempSync(join(tmpdir(), 'whetstone-')), 'course')
  cpSync(CHESS_COURSE, dir, { recursive: true })
  return dir
}

const declare = (dir: string, services: unknown): void => {
  const manifest = JSON.parse(readFileSync(join(dir, 'course.json'), 'utf8')) as Record<string, unknown>
  manifest['services'] = services
  writeFileSync(join(dir, 'course.json'), JSON.stringify(manifest, null, 2))
}

describe('the catalogue', () => {
  it('says what this build can answer for', () => {
    expect(SERVICES['chess']?.version).toMatch(/^\d+\.\d+\.\d+$/)
  })

  it('accepts a course pinned to the same major version', () => {
    expect(serviceProblem({ id: 'chess', version: '1.0.0' })).toBeUndefined()
    // A later minor version of the same major is still a promise this build keeps.
    expect(serviceProblem({ id: 'chess', version: '1.4.0' })).toBeUndefined()
  })

  it('refuses a service this build does not have', () => {
    expect(serviceProblem({ id: 'stockfish', version: '1.0.0' })).toContain('does not have')
  })

  it('refuses a major version this build does not answer for', () => {
    expect(serviceProblem({ id: 'chess', version: '2.0.0' })).toContain('but this build has')
  })
})

describe('answering a mini-app', () => {
  it('answers for a service the course declared', () => {
    const reply = serviceReply(uses, 'chess', { op: 'status', fen: START })
    expect(reply.ok).toBe(true)
  })

  it('refuses a service the course did not declare', () => {
    const reply = serviceReply([], 'chess', { op: 'status', fen: START })
    expect(reply).toEqual({ ok: false, error: 'this course does not declare the "chess" service' })
  })

  it('refuses a service that does not exist, declared or not', () => {
    expect(serviceReply([{ id: 'shell', version: '1.0.0' }], 'shell', {})).toMatchObject({
      ok: false,
      error: 'there is no service named "shell"',
    })
  })

  it('turns a bad request into words rather than a crash', () => {
    const reply = serviceReply(uses, 'chess', { op: 'move', fen: START, from: 'e2', to: 'e5' })
    expect(reply).toMatchObject({ ok: false })
    if (reply.ok) return
    expect(reply.error).toMatch(/not a legal move/)
  })
})

describe('a course that declares a service', () => {
  it('parses when the build has it', () => {
    const result = parseCourse(CHESS_COURSE)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.course.services).toEqual(uses)
  })

  it('is refused when it names a service that does not exist', () => {
    const dir = copyCourse()
    declare(dir, [{ id: 'stockfish', version: '1.0.0' }])
    const result = parseCourse(dir)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.errors[0]).toMatchObject({ file: 'course.json', field: 'services[0]' })
  })

  it('is refused when it wants a major version this build does not answer for', () => {
    const dir = copyCourse()
    declare(dir, [{ id: 'chess', version: '9.0.0' }])
    const result = parseCourse(dir)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.errors.map((error) => error.message).join(' ')).toContain('wants chess 9.0.0')
  })

  it('declares nothing by default, so an old course asks for nothing', () => {
    const gradients = parseCourse(join(import.meta.dirname, '..', 'fixtures', 'courses', 'gradients-by-hand'))
    expect(gradients.ok).toBe(true)
    if (!gradients.ok) return
    expect(gradients.course.services).toEqual([])
  })
})
