import type { Course, CourseError } from './format'

/**
 * The second gate: is there enough here to learn from?
 *
 * The parser answers whether a Course is well formed, and a Course can be perfectly well
 * formed and worthless. Both courses this app has built parsed on the first attempt: the
 * first was 17 pages of 174 words each, the second 34 lessons of which 23 were under 400
 * words, with 31 of its 42 questions multiple choice and every objective's questions inside
 * a single Test.
 *
 * None of that broke a rule, because none of it was a rule. It is now, and it is checked
 * the way a parse error is checked: measured, named per file, and handed back to the run
 * that wrote it.
 *
 * **This gate asks; it never refuses.** A Course that is still thin after being told goes
 * into the library anyway. Thinness is a matter of degree, the numbers below are the
 * middle of a range rather than a boundary, and a Course somebody waited minutes for is
 * worth more than a Course that meets a threshold. The parser refuses because a Course that
 * does not parse cannot be read at all; this one cannot say that.
 */

/** The middle of the range in `writing-a-lesson`, not the edge of it. */
const FLOOR = 400
const AIM = 600
/** How many short Lessons to name before the list stops being useful. */
const NAMED = 8

export function thin(course: Course): CourseError[] {
  // A small Course is short on purpose. It says so in its manifest, and the reader asked.
  if (course.small) return []

  const complaints: CourseError[] = []
  const say = (file: string, message: string): void => {
    complaints.push({ file, message })
  }

  // ---------------------------------------------------------------- lessons

  const lessons = Object.values(course.lessons)
  const words = new Map(
    lessons.map((lesson) => [
      lesson.id,
      lesson.blocks
        .filter((block) => block.block === 'prose' || block.block === 'callout')
        .map((block) => block.markdown)
        .join(' ')
        .split(/\s+/)
        .filter(Boolean).length,
    ]),
  )

  const short = [...words.entries()].filter(([, count]) => count < FLOOR).sort((a, b) => a[1] - b[1])
  for (const [id, count] of short.slice(0, NAMED)) {
    say(
      `lessons/${id}.md`,
      `is ${count} words of prose. A lesson is 600 to 1200: this one is missing its worked example, or it belongs inside the lesson before it`,
    )
  }
  if (short.length > NAMED) {
    say('course.json', `${short.length - NAMED} more lessons are also under ${FLOOR} words`)
  }

  const total = [...words.values()].reduce((sum, count) => sum + count, 0)
  const mean = lessons.length === 0 ? 0 : Math.round(total / lessons.length)
  if (lessons.length > 0 && mean < AIM) {
    say(
      'course.json',
      `averages ${mean} words a lesson across ${lessons.length} lessons, against 600 to 1200. Deepen the lessons rather than adding more of them`,
    )
  }

  // A Try is controlled practice, not a quota. Every lesson carrying exactly one is what
  // comes out when nothing has said what a Try is for.
  const oneEach = lessons.filter((lesson) => lesson.tries.length === 1).length
  if (lessons.length >= 6 && oneEach >= lessons.length - 1) {
    say(
      'course.json',
      `every lesson carries exactly one try. A try is controlled practice put where a reader could have followed the words and missed the point, so a hard idea takes two or three and an easy one takes none`,
    )
  }

  // ---------------------------------------------------------------- questions

  const tasks = Object.values(course.tasks)
  const testOf = new Map<string, string[]>()
  for (const test of Object.values(course.tests)) {
    for (const taskId of test.tasks) testOf.set(taskId, [...(testOf.get(taskId) ?? []), test.id])
  }

  const byObjective = new Map<string, string[]>()
  for (const task of tasks) {
    byObjective.set(task.objective, [...(byObjective.get(task.objective) ?? []), task.id])
  }

  for (const objective of course.objectives) {
    const mine = byObjective.get(objective.id) ?? []
    if (mine.length === 0) continue
    if (mine.length < 3) {
      say(
        'course.json',
        `objective "${objective.id}" has ${mine.length} question${mine.length === 1 ? '' : 's'}. One go at an idea is a sample, not practice`,
      )
      continue
    }
    // Spacing. Six questions in one sitting and never again is one sitting's worth of
    // practice, whatever the count says. An idea met in module three comes back in five.
    const tests = new Set(mine.flatMap((id) => testOf.get(id) ?? []))
    if (tests.size === 1 && Object.keys(course.tests).length > 2) {
      say(
        'course.json',
        `every question for "${objective.id}" sits in one test. Bring the idea back in a later test, where it is no longer what the module is about`,
      )
    }
  }

  // Recognition is the cheapest thing to test and the least of what the reader wants.
  const recognising = tasks.filter(
    (task) => 'kind' in task && (task.kind === 'multiple-choice' || task.kind === 'ordering'),
  ).length
  if (tasks.length >= 8 && recognising / tasks.length > 0.6) {
    say(
      'course.json',
      `${recognising} of ${tasks.length} questions are ones the reader picks from a list. Mix in answers they have to produce: a number, a written answer, or a pattern your assertions run`,
    )
  }

  // ---------------------------------------------------------------- modules

  for (const module of course.modules) {
    const lessonCount = module.pages.filter((page) => page.type === 'lesson').length
    const testCount = module.pages.filter((page) => page.type === 'test').length
    if (lessonCount > 6 && testCount < 2) {
      say(
        'course.json',
        `module "${module.id}" runs ${lessonCount} lessons against ${testCount} test${testCount === 1 ? '' : 's'}. That is one recorded check on a long stretch: split the module, or add a second test inside it`,
      )
    }
  }

  return complaints
}

/**
 * What the run is told about it.
 *
 * Deliberately not the repair prompt. A Course that does not parse is broken and the run is
 * told to fix exactly what was named; this one is sound and thin, and fixing it means
 * writing more rather than correcting a field.
 */
export function substancePrompt(complaints: CourseError[]): string {
  return [
    'The course parses. It is too thin to learn from, and here is what is measured:',
    '',
    ...complaints.map((complaint) => `- ${complaint.file}: ${complaint.message}`),
    '',
    'Fix these by writing, not by trimming. Deepen the lessons that are named: the context',
    'the idea belongs to, a worked example carried all the way through with real values, and',
    'what goes wrong at that point. Read `staging-a-lesson` again if you have not.',
    '',
    'Do not rename an id, do not remove a page, and do not add pages to raise an average.',
    'Nobody is helped by twenty thin lessons becoming forty thinner ones.',
  ].join('\n')
}
