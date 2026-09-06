import { createHash } from 'node:crypto'
import { cpSync, existsSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Keeping the sample Courses in the library.
 *
 * A sample is the app's content, not the user's, until the user touches it. That single
 * rule is what this file decides, and it lives apart from the store so it can be tested
 * without starting Electron.
 */

/** The note a seeded sample carries, so the app can tell its own copy from an edited one. */
export const MARK = '.whetstone-sample'

/**
 * A digest of a Course folder: every file's path and content, in a fixed order.
 *
 * This is the whole mechanism for deciding whether a sample folder is still the app's. It
 * is not a security check and does not need to be one; it only has to notice an edit.
 */
export function digest(dir: string): string {
  const sum = createHash('sha256')
  const walk = (at: string, prefix: string): void => {
    const entries = readdirSync(at, { withFileTypes: true }).sort((a, b) =>
      a.name.localeCompare(b.name),
    )
    for (const entry of entries) {
      if (entry.name === MARK) continue
      const path = join(at, entry.name)
      if (entry.isDirectory()) walk(path, `${prefix}${entry.name}/`)
      else if (entry.isFile()) {
        sum.update(`${prefix}${entry.name}\u0000`)
        sum.update(readFileSync(path))
      }
    }
  }
  walk(dir, '')
  return sum.digest('hex')
}

/**
 * Put the sample Courses in the library, and keep the app's own copies current.
 *
 * Each seeded folder gets a note recording the digest of what was written. On a later
 * launch a folder whose digest still matches its note has not been edited, and is replaced
 * when the app ships a newer one. A folder that differs from its note, or has no note at
 * all, is the user's and is never written to.
 *
 * Seeding the whole root once was the earlier rule, and it was wrong twice over: a sample
 * added in a later version never reached a library that already existed, and a sample
 * written by an early version stayed at that early version for ever, until it stopped
 * parsing and drew as an error nobody could act on.
 *
 * Returns what it did, one line per sample, for the log rather than for the screen.
 */
export function seedSamples(root: string, samples: { name: string; from: string }[]): string[] {
  const done: string[] = []
  for (const sample of samples) {
    if (!existsSync(sample.from)) continue
    const target = join(root, sample.name)

    try {
      const shipped = digest(sample.from)
      if (existsSync(target)) {
        const note = join(target, MARK)
        if (!existsSync(note)) continue
        const seeded = readFileSync(note, 'utf8').trim()
        if (seeded !== digest(target)) continue
        if (seeded === shipped) continue
        rmSync(target, { recursive: true, force: true })
        done.push(`refreshed ${sample.name}`)
      } else {
        done.push(`seeded ${sample.name}`)
      }
      cpSync(sample.from, target, { recursive: true })
      writeFileSync(join(target, MARK), `${shipped}\n`)
    } catch {
      // Seeding is a convenience. A failure leaves the library as it was, which the reader
      // already handles, so it must never stop the app from starting.
    }
  }
  return done
}
