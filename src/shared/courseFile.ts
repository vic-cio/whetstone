import { realpathSync } from 'node:fs'
import { isAbsolute, relative, resolve } from 'node:path'

/**
 * Resolving a file a Course points at.
 *
 * A Course folder is content an agent wrote, so a path in it is untrusted input. The check
 * that a file stays inside its Course must run against what is really on disk: `relative`
 * and `resolve` are string arithmetic and never touch the filesystem, so a symlink placed
 * inside a Course folder passes a check written that way and is then followed.
 *
 * `realpathSync` is what closes that. It also fails for a file that does not exist, which
 * is the same answer the reader wants anyway: nothing to serve.
 */
export function fileInCourse(root: string, request: string): string | undefined {
  let real: string
  let inside: string
  try {
    real = realpathSync(resolve(root))
    inside = realpathSync(resolve(real, request.replace(/^\/+/, '')))
  } catch {
    return undefined
  }
  const step = relative(real, inside)
  if (step === '' || step.startsWith('..') || isAbsolute(step)) return undefined
  return inside
}
