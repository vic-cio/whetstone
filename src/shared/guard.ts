import { createHash } from 'node:crypto'
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { join, relative } from 'node:path'

/**
 * Keeping a Course folder exactly as the Constructor wrote it.
 *
 * The Tutor runs inside a Course and reads every file there, which is the point. It must
 * change none of them, or two copies of a shared Course would drift apart (PLAN 3.14).
 *
 * Two of the three layers that stop it are the harness's, and a recorded run showed the
 * limit of both: a read-only spawn told to write called `Write` anyway, was refused, and
 * the result event still said `success` with an empty `permission_denials`. The refusal
 * reached the run and never reached the app. So this layer is the only one that reports a
 * change to the app rather than to the agent, and it is the only one that can undo one.
 *
 * It holds a copy rather than only a hash, because a hash says a Course changed and cannot
 * put it back. A Course is small and a spawn is something the user asked for, so the copy
 * is cheap where it happens.
 */

/** Every file under a folder, by its path inside that folder, with the hash of its bytes. */
export function fingerprint(dir: string, skip: ReadonlySet<string> = new Set()): Map<string, string> {
  const seen = new Map<string, string>()
  const walk = (at: string): void => {
    for (const entry of readdirSync(at, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (skip.has(entry.name)) continue
      const path = join(at, entry.name)
      if (entry.isDirectory()) walk(path)
      else if (entry.isFile()) {
        seen.set(relative(dir, path), createHash('sha256').update(readFileSync(path)).digest('hex'))
      }
    }
  }
  if (existsSync(dir)) walk(dir)
  return seen
}

/** One hash for a whole folder, for the times when only "the same or not" is wanted. */
export function digestOf(dir: string, skip: ReadonlySet<string> = new Set()): string {
  const hash = createHash('sha256')
  for (const [path, bytes] of [...fingerprint(dir, skip)].sort(([a], [b]) => a.localeCompare(b))) {
    hash.update(path).update('\0').update(bytes).update('\0')
  }
  return hash.digest('hex')
}

export interface Change {
  /** The file's path inside the Course. */
  file: string
  what: 'changed' | 'added' | 'removed'
}

export interface Guard {
  /**
   * What happened while the run was going. Anything that changed is put back first, so a
   * caller that ignores the answer still has an unchanged Course.
   */
  check(): Change[]
  /** Throw the copy away. Always call it, whichever way the run went. */
  release(): void
}

/**
 * Take a copy of a folder and hold it for the length of one run.
 *
 * `shadow` is where the copy goes, and it must be outside the folder being guarded, or the
 * copy would be part of what it is guarding.
 */
export function guardFolder(dir: string, shadow: string): Guard {
  rmSync(shadow, { recursive: true, force: true })
  mkdirSync(shadow, { recursive: true })
  cpSync(dir, shadow, { recursive: true })
  const before = fingerprint(dir)

  return {
    check() {
      const after = fingerprint(dir)
      const changes: Change[] = []
      for (const [file, hash] of before) {
        const now = after.get(file)
        if (now === undefined) changes.push({ file, what: 'removed' })
        else if (now !== hash) changes.push({ file, what: 'changed' })
      }
      for (const file of after.keys()) if (!before.has(file)) changes.push({ file, what: 'added' })

      if (changes.length > 0) {
        // Put it back wholesale. Restoring file by file would leave the folder in whatever
        // state the loop reached if one of them failed, and a Course is small.
        rmSync(dir, { recursive: true, force: true })
        cpSync(shadow, dir, { recursive: true })
      }
      return changes.sort((a, b) => a.file.localeCompare(b.file))
    },
    release() {
      rmSync(shadow, { recursive: true, force: true })
    },
  }
}

/** One plain sentence about a Course that was changed and put back (PLAN 3.6, rule 3). */
export function sayChanged(changes: Change[]): string {
  const one = changes[0]
  if (!one) return ''
  const rest = changes.length - 1
  const tail = rest === 0 ? '' : ` and ${rest} other ${rest === 1 ? 'file' : 'files'}`
  return `The tutor changed ${one.file}${tail} in this course. That has been undone.`
}
