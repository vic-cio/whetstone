import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { parseCourse } from '../src/shared/parseCourse'
import { MARK, digest, seedSamples } from '../src/shared/samples'

/**
 * The sample Courses in a library.
 *
 * A sample is the app's content until the user touches it. Getting that line wrong has
 * already cost twice: once by never bringing a new sample to a library that existed, and
 * once by leaving an early sample in place until it stopped parsing.
 */

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..')
const SAMPLE = join(ROOT, 'fixtures', 'courses', 'gradients-by-hand')

let box = ''
let shipped = ''

/** A stand-in for the folder the app ships, so a "newer version" can be made. */
const newer = (): string => {
  const dir = join(box, 'shipped')
  rmSync(dir, { recursive: true, force: true })
  cpSync(SAMPLE, dir, { recursive: true })
  writeFileSync(join(dir, 'NOTE.txt'), 'a later version\n')
  return dir
}

beforeAll(() => {
  box = mkdtempSync(join(tmpdir(), 'whetstone-samples-'))
  shipped = join(box, 'shipped')
  cpSync(SAMPLE, shipped, { recursive: true })
})

afterAll(() => rmSync(box, { recursive: true, force: true }))

const library = (): string => mkdtempSync(join(box, 'library-'))

describe('seeding the sample courses', () => {
  it('puts a sample into an empty library and leaves its note behind', () => {
    const root = library()
    expect(seedSamples(root, [{ name: 'gradients', from: shipped }])).toEqual(['seeded gradients'])
    const note = readFileSync(join(root, 'gradients', MARK), 'utf8').trim()
    expect(note).toBe(digest(shipped))
    expect(digest(join(root, 'gradients'))).toBe(note)
  })

  it('does nothing on a second run', () => {
    const root = library()
    seedSamples(root, [{ name: 'gradients', from: shipped }])
    expect(seedSamples(root, [{ name: 'gradients', from: shipped }])).toEqual([])
  })

  it('brings a newer copy to a folder nobody has touched', () => {
    const root = library()
    seedSamples(root, [{ name: 'gradients', from: shipped }])

    const later = newer()
    expect(seedSamples(root, [{ name: 'gradients', from: later }])).toEqual(['refreshed gradients'])
    expect(readFileSync(join(root, 'gradients', 'NOTE.txt'), 'utf8')).toContain('a later version')
  })

  it('never writes over a folder the user has edited', () => {
    const root = library()
    seedSamples(root, [{ name: 'gradients', from: shipped }])
    writeFileSync(join(root, 'gradients', 'course.json'), '{ "mine": true }')

    const later = newer()
    expect(seedSamples(root, [{ name: 'gradients', from: later }])).toEqual([])
    expect(readFileSync(join(root, 'gradients', 'course.json'), 'utf8')).toBe('{ "mine": true }')
  })

  it('never writes over a folder it did not put there', () => {
    // A folder the user made, or copied in by hand, carries no note and is not the app's.
    const root = library()
    mkdirSync(join(root, 'gradients'))
    writeFileSync(join(root, 'gradients', 'course.json'), '{ "mine": true }')

    expect(seedSamples(root, [{ name: 'gradients', from: shipped }])).toEqual([])
    expect(readFileSync(join(root, 'gradients', 'course.json'), 'utf8')).toBe('{ "mine": true }')
  })

  it('notices an edit anywhere in the folder, not only at the top of it', () => {
    const root = library()
    seedSamples(root, [{ name: 'gradients', from: shipped }])
    const deep = join(root, 'gradients', 'apps', 'slope-explorer', 'index.html')
    writeFileSync(deep, `${readFileSync(deep, 'utf8')}\n<!-- mine -->\n`)

    expect(seedSamples(root, [{ name: 'gradients', from: newer() }])).toEqual([])
    expect(readFileSync(deep, 'utf8')).toContain('<!-- mine -->')
  })

  it('leaves a course the parser will still read', () => {
    // The note sits inside the Course folder, so the parser has to be indifferent to it.
    const root = library()
    seedSamples(root, [{ name: 'gradients', from: shipped }])
    const result = parseCourse(join(root, 'gradients'))
    expect(result.ok).toBe(true)
  })

  it('skips a sample this build does not carry', () => {
    const root = library()
    expect(seedSamples(root, [{ name: 'nothing', from: join(box, 'no-such-folder') }])).toEqual([])
  })
})
