import { app } from 'electron'
import { cpSync, existsSync, mkdirSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { parseCourse } from '../shared/parseCourse'
import type { CourseError } from '../shared/format'

/** What the library needs to draw a row, without sending a whole Course to the renderer. */
export interface CourseSummary {
  slug: string
  id: string
  title: string
  subject: string
  summary: string
  moduleCount: number
  pageCount: number
  /** Pages ticked. Phase 0 has no ticks yet, so this is zero until the database lands. */
  pagesDone: number
}

export interface BrokenCourse {
  slug: string
  errors: CourseError[]
}

export function coursesRoot(): string {
  const fromEnv = process.env['WHETSTONE_COURSES']
  if (fromEnv) return fromEnv

  const root = join(app.getPath('userData'), 'courses')
  const fresh = !existsSync(root)
  if (fresh) {
    mkdirSync(root, { recursive: true })
    seedSampleCourse(root)
  }
  return root
}

/** Where the bundled sample Course lives, packaged or running from source. */
function sampleCoursePath(): string {
  const packaged = join(process.resourcesPath ?? '', 'sample-course')
  if (existsSync(packaged)) return packaged
  const here = fileURLToPath(new URL('.', import.meta.url))
  return join(here, '..', '..', 'fixtures', 'courses', 'gradients-by-hand')
}

/**
 * Copy the sample Course into a brand-new root, so a fresh install opens with something
 * to read. This runs once and only on a root that did not exist: a root the user already
 * has is theirs, whatever is in it, and is never written to here.
 */
function seedSampleCourse(root: string): void {
  const source = sampleCoursePath()
  if (!existsSync(source)) return
  try {
    cpSync(source, join(root, 'gradients-by-hand'), { recursive: true })
  } catch {
    // Seeding is a convenience. A failure leaves an empty library, which the reader
    // already handles, so it must never stop the app from starting.
  }
}

export function listCourses(): { courses: CourseSummary[]; broken: BrokenCourse[] } {
  const root = coursesRoot()
  const courses: CourseSummary[] = []
  const broken: BrokenCourse[] = []

  const entries = existsSync(root)
    ? readdirSync(root, { withFileTypes: true }).filter((entry) => entry.isDirectory())
    : []

  for (const entry of entries) {
    const result = parseCourse(join(root, entry.name))
    if (!result.ok) {
      // A broken folder is reported, never silently hidden: the user should be able to
      // see that a Course is there and what is wrong with it.
      broken.push({ slug: entry.name, errors: result.errors })
      continue
    }
    const course = result.course
    courses.push({
      slug: entry.name,
      id: course.id,
      title: course.title,
      subject: course.subject,
      summary: course.summary,
      moduleCount: course.modules.length,
      pageCount: course.modules.reduce((total, module) => total + module.pages.length, 0),
      pagesDone: 0,
    })
  }

  courses.sort((a, b) => a.title.localeCompare(b.title))
  return { courses, broken }
}
