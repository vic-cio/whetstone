import { existsSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Deleting a Course.
 *
 * A Course is a folder, so deleting one is deleting the folder and forgetting the rows
 * that point at it. The folder goes to the Trash rather than being unlinked: a Course
 * takes minutes and money to build, and the machine already has a place for a thing you
 * probably meant to throw away.
 *
 * The rows go first, and they go even when the folder does not. A delete the user asked
 * for that half fails must not leave the app claiming progress against something that is
 * on its way out; what it does instead is say where the folder still is.
 */

export interface Removal {
  ok: boolean
  folder: string
  /** One plain sentence when the folder could not be moved, naming where it still is. */
  message?: string
}

export async function removeCourse(
  root: string,
  slug: string,
  forget: (slug: string) => void,
  trash: (folder: string) => Promise<void>,
): Promise<Removal> {
  if (slug === '' || slug.includes('/') || slug.includes('\\') || slug.startsWith('.')) {
    return { ok: false, folder: '', message: `"${slug}" is not a course in this library.` }
  }
  const folder = join(root, slug)
  forget(slug)

  if (!existsSync(folder)) return { ok: true, folder }
  try {
    await trash(folder)
  } catch (cause) {
    return {
      ok: false,
      folder,
      message: `The course is gone from the app, but its folder could not be moved to the Trash. It is still at ${folder}. ${(cause as Error).message}`,
    }
  }
  return { ok: true, folder }
}
