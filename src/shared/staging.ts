import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import matter from 'gray-matter'

import { parseCourse } from './parseCourse'
import type { Course, CourseError } from './format'

/**
 * Staging: where a Course is written, and the gate it has to pass to get out.
 *
 * A Run writes into a folder outside the library, so the Course being built is never
 * listed and cannot be opened, not even for the moment between the last file and the check
 * (PLAN 3.19). Only a folder the parser accepts moves in, and it moves in one step.
 *
 * Nothing here spawns anything. This is the rule; `src/main/build.ts` runs the loop.
 */

/** The tray from the Brief. It is the Constructor's input, and it is not Course content. */
export const BRIEF = '.brief'

/**
 * The app's own folder inside a working folder. Everything under it belongs to the app and
 * none of it ships: it is removed before a Course goes into the library.
 */
export const HOUSE = '.whetstone'

/**
 * Put the skills for a role where the run can read them.
 *
 * Not a plugin. A plugin format belongs to one harness, and the skills carry the Course
 * format itself, so a harness that could not load them would author against nothing and
 * write a folder the parser refuses. Every harness can read a file in its own working
 * folder, so that is the floor this stands on, and the run's prompt names the paths.
 *
 * They go under `.whetstone/` rather than `.claude/skills/`, because the Constructor is
 * told to write the Course's own skills into that second place for the Tutor to read, and
 * the app must not tidy away what it asked for.
 */
export function seedSkills(dir: string, from: string): void {
  if (!existsSync(from)) return
  const into = join(dir, HOUSE, 'skills')
  rmSync(into, { recursive: true, force: true })
  mkdirSync(into, { recursive: true })
  cpSync(from, into, { recursive: true })
}

export interface Skill {
  name: string
  description: string
  /** Where it is, relative to the working folder, which is what a prompt can name. */
  path: string
}

/**
 * The skills that are there, with the line each one uses to say what it is for.
 *
 * Read from the files rather than listed anywhere, so a skill that is added, renamed or
 * removed cannot fall out of step with the prompt that offers it.
 */
export function skillsIn(dir: string): Skill[] {
  const into = join(dir, HOUSE, 'skills')
  if (!existsSync(into)) return []
  const skills: Skill[] = []
  for (const name of readdirSync(into).sort()) {
    const file = join(into, name, 'SKILL.md')
    if (!existsSync(file)) continue
    const front = matter(readFileSync(file, 'utf8')).data as { name?: string; description?: string }
    skills.push({
      name: front.name ?? name,
      description: front.description ?? '',
      path: `${HOUSE}/skills/${name}/SKILL.md`,
    })
  }
  return skills
}

/** A folder name from a Course's own id. Ids are the Constructor's; folder names are ours. */
export function slugFrom(id: string): string {
  const slug = id
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return slug === '' ? 'course' : slug
}

/** The first free name under the library, so two Courses with one idea can both exist. */
export function freeSlug(root: string, wanted: string): string {
  if (!existsSync(join(root, wanted))) return wanted
  for (let n = 2; n < 100; n += 1) {
    if (!existsSync(join(root, `${wanted}-${n}`))) return `${wanted}-${n}`
  }
  return `${wanted}-${Date.now()}`
}

/**
 * Record what built this Course, in the Course.
 *
 * The app knows the harness and the model and the Run does not have to be asked, so this is
 * the app's line to write rather than a field the Constructor might forget. It is written
 * before the folder is checked, so what the parser reads is exactly what moves in.
 *
 * It matters because a Course outlives the thing that made it. Switching harness changes
 * nothing that already exists (PLAN 3.12), and knowing which one wrote a Course is what
 * makes an odd one traceable a month later.
 */
export function stamp(staging: string, harness: string, model: string): void {
  const file = join(staging, 'course.json')
  if (!existsSync(file)) return
  try {
    const manifest = JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>
    manifest['builtBy'] = { harness, model, at: new Date().toISOString() }
    writeFileSync(file, `${JSON.stringify(manifest, null, 2)}\n`)
  } catch {
    // A course.json that is not JSON is the parser's to report, in its own words. Failing
    // to stamp one must not turn into a different error than the one that is really there.
  }
}

/**
 * Hand the run its skills, by path.
 *
 * This is the whole delivery. It does not depend on a plugin format, a discovery folder, or
 * anything else one harness has and another does not, and `course-format` is not optional:
 * a run that never reads it writes a folder the parser refuses.
 */
export function offerSkills(dir: string): string[] {
  const skills = skillsIn(dir)
  if (skills.length === 0) return []
  return [
    'Read these before you start. They are files in this folder, and they are the format you',
    'are writing to rather than advice about it.',
    '',
    ...skills.map((skill) => `- \`${skill.path}\` — ${skill.description}`),
  ]
}

export type Gate = { ok: true; course: Course; slug: string } | { ok: false; errors: CourseError[] }

/**
 * Is what the Run wrote a Course?
 *
 * The parser is the whole check. It is the thing standing between an agent's output and
 * the reader, and a second opinion here would be a second place to keep in step with it.
 */
export function inspect(staging: string, root: string): Gate {
  if (!existsSync(join(staging, 'course.json'))) {
    return { ok: false, errors: [{ file: 'course.json', message: 'was never written' }] }
  }
  const result = parseCourse(staging)
  if (!result.ok) return { ok: false, errors: result.errors }
  return { ok: true, course: result.course, slug: freeSlug(root, slugFrom(result.course.id)) }
}

/**
 * The errors, written for the Run that made them.
 *
 * The parser already names the file and the field, so this is a list rather than a lecture.
 * A Run gets at most three of these (PLAN 3.19): the usual failure is a missing field and
 * goes away in one turn, and the outcome the cap avoids is a ten-minute build dying on a
 * typo without anyone asking it to fix one.
 */
export function repairPrompt(errors: CourseError[]): string {
  const lines = errors.map((error) => {
    const where = error.field === undefined ? error.file : `${error.file} · ${error.field}`
    return `- ${where}: ${error.message}`
  })
  return [
    'The course you wrote does not parse. Fix these, and change nothing else:',
    '',
    ...lines,
    '',
    'Write the corrected files in place. Do not start again and do not rename an id.',
  ].join('\n')
}

/**
 * Move a finished Course into the library in one step.
 *
 * It is copied to a hidden name beside the library first and then renamed into place,
 * because a rename inside one folder is atomic and a copy is not. A half-copied folder is
 * therefore never a thing the library can see, whatever happens in the middle.
 */
export function moveIn(staging: string, root: string, slug: string, litter: string[] = []): string {
  // What the Constructor read stays behind. The tray is the user's material and the house
  // folder is the app's own instructions, and a Course is neither.
  rmSync(join(staging, BRIEF), { recursive: true, force: true })
  rmSync(join(staging, HOUSE), { recursive: true, force: true })
  // And what the harness left for itself. A Course carries no trace of what built it
  // beyond the line in course.json that says so.
  for (const name of litter) rmSync(join(staging, name), { recursive: true, force: true })

  mkdirSync(root, { recursive: true })
  const target = join(root, slug)
  if (existsSync(target)) throw new Error(`"${slug}" is already in the library`)

  const landing = join(root, `.incoming-${Date.now()}`)
  rmSync(landing, { recursive: true, force: true })
  try {
    cpSync(staging, landing, { recursive: true })
    renameSync(landing, target)
  } catch (cause) {
    rmSync(landing, { recursive: true, force: true })
    throw cause
  }
  rmSync(staging, { recursive: true, force: true })
  return target
}

/**
 * Put a revised Course back over the one it was made from.
 *
 * `add-rung` and `remediate` change a Course that already exists and that somebody has
 * progress against. The old folder is moved aside rather than deleted, and only removed
 * once the new one is in place, so a failure in the middle leaves the Course where it was
 * rather than leaving a hole in the library.
 *
 * Progress survives because ids are stable: the Constructor is told never to reuse or
 * rewrite one, and the parser refuses a folder whose ids collide with the version before it.
 */
export function moveOver(staging: string, root: string, slug: string, litter: string[] = []): string {
  rmSync(join(staging, BRIEF), { recursive: true, force: true })
  rmSync(join(staging, HOUSE), { recursive: true, force: true })
  for (const name of litter) rmSync(join(staging, name), { recursive: true, force: true })

  const target = join(root, slug)
  const landing = join(root, `.incoming-${Date.now()}`)
  const aside = join(root, `.was-${Date.now()}`)
  rmSync(landing, { recursive: true, force: true })

  try {
    cpSync(staging, landing, { recursive: true })
    if (existsSync(target)) renameSync(target, aside)
    renameSync(landing, target)
  } catch (cause) {
    rmSync(landing, { recursive: true, force: true })
    // Put the old one back if it had already been moved aside.
    if (existsSync(aside) && !existsSync(target)) renameSync(aside, target)
    throw cause
  }
  rmSync(aside, { recursive: true, force: true })
  rmSync(staging, { recursive: true, force: true })
  return target
}

/**
 * Lay out a staging folder before the Run starts.
 *
 * The toolkit is copied in by the app rather than by the Constructor. A Course carries the
 * copy it was built against (docs/adr/0014), and the one thing that would quietly break
 * that pin is an agent writing its own idea of the toolkit into the folder.
 */
export function prepare(
  staging: string,
  toolkit: string,
  skills: string,
  tray: { files: string[]; links: string[] },
): void {
  rmSync(staging, { recursive: true, force: true })
  mkdirSync(staging, { recursive: true })
  cpSync(toolkit, join(staging, 'toolkit'), { recursive: true })
  seedSkills(staging, skills)

  // Always made, even when it is empty. The Constructor's own instructions tell it that
  // attached material lives here, so a run that finds no folder at all reports "path not
  // found" and spends a turn on it. An empty folder answers the question.
  const brief = join(staging, BRIEF)
  mkdirSync(brief, { recursive: true })
  if (tray.files.length === 0 && tray.links.length === 0) return
  for (const file of tray.files) {
    const name = file.split('/').filter(Boolean).pop() ?? 'attachment'
    cpSync(file, join(brief, name))
  }
  if (tray.links.length > 0) writeFileSync(join(brief, 'links.json'), JSON.stringify(tray.links, null, 2))
}

/** What the Constructor was given, so the run's prompt can name it. */
export function trayContents(staging: string): string[] {
  const brief = join(staging, BRIEF)
  return existsSync(brief) ? readdirSync(brief).sort() : []
}
