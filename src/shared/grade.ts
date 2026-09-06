import type { Answerable, Task, Try } from './format'

/**
 * Answering a deterministic Task.
 *
 * Every function here is pure and synchronous. That is the mechanism behind the offline
 * promise in the plan: there is no I/O to disable, so a `deterministic` Task at any Depth
 * is answered with no network and no cost (docs/adr/0002, docs/adr/0012).
 *
 * A Mini-app reports; it never decides. `app-result` and `assertions-pass` compare what
 * the Mini-app emitted against what the Constructor wrote, here in the host.
 */

export interface Outcome {
  outcome: 'pass' | 'fail'
  /** Shown after answering, whichever way it went. */
  explanation?: string
  /** For assertions-pass: which assertions passed, in the Constructor's order. */
  assertions?: { name: string; passed: boolean }[]
}

/** Fold away the differences that are not the point of the question. */
export function normalise(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[\p{P}\p{S}]/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim()
}

const sameSet = (a: number[], b: number[]): boolean => {
  const left = [...new Set(a)].sort((x, y) => x - y)
  const right = [...new Set(b)].sort((x, y) => x - y)
  return left.length === right.length && left.every((value, index) => value === right[index])
}

const deepEqual = (a: unknown, b: unknown): boolean => {
  if (a === b) return true
  if (typeof a !== typeof b || a === null || b === null) return false
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false
    return a.every((value, index) => deepEqual(value, b[index]))
  }
  if (typeof a !== 'object') return false
  const left = a as Record<string, unknown>
  const right = b as Record<string, unknown>
  const keys = Object.keys(left)
  if (keys.length !== Object.keys(right).length) return false
  return keys.every((key) => Object.hasOwn(right, key) && deepEqual(left[key], right[key]))
}

/**
 * Answer a deterministic Task, or a Lesson's Try. Throws for any other Check, because
 * those go to a Grader and reaching here with one is a programming error rather than a
 * user-facing failure.
 *
 * A Try and a Task are answered by the same code on purpose. They differ in what the app
 * does with the outcome, never in how the outcome is reached: a Try is not an easier
 * question, it is an unrecorded one (docs/adr/0013).
 */
export function answerDeterministic(item: Task | Try, given: unknown): Outcome {
  if ('check' in item && item.check !== 'deterministic') {
    throw new Error(`task ${item.id} has check "${item.check}" and cannot be answered by the host`)
  }
  const task = item as Answerable
  const explanation = task.explanation === undefined ? {} : { explanation: task.explanation }

  switch (task.kind) {
    case 'multiple-choice': {
      const chosen = Array.isArray(given) ? given.filter((v): v is number => typeof v === 'number') : []
      return { outcome: sameSet(chosen, task.answer) ? 'pass' : 'fail', ...explanation }
    }

    case 'accepted-answers': {
      /*
       * Two comparisons, because normalising folds away punctuation and some answers are
       * punctuation. "-" is a right answer to "what is the sign", and normalising it leaves
       * nothing at all, so a plain comparison runs beside the folded one. The Course still
       * has to list "-" for it to be accepted; this only makes listing it possible.
       */
      const plain = (text: string): string => text.trim().toLowerCase()
      const raw = typeof given === 'string' ? plain(given) : ''
      if (raw === '') return { outcome: 'fail', ...explanation }
      const folded = normalise(raw)
      const accepted = task.accepted.some(
        (candidate) =>
          plain(candidate) === raw || (folded !== '' && normalise(candidate) === folded),
      )
      return { outcome: accepted ? 'pass' : 'fail', ...explanation }
    }

    case 'numeric': {
      const value = typeof given === 'number' ? given : Number(given)
      if (!Number.isFinite(value)) return { outcome: 'fail', ...explanation }
      return { outcome: Math.abs(value - task.answer) <= task.tolerance ? 'pass' : 'fail', ...explanation }
    }

    case 'ordering': {
      const order = Array.isArray(given) ? given : []
      const correct =
        order.length === task.answer.length && order.every((value, index) => value === task.answer[index])
      return { outcome: correct ? 'pass' : 'fail', ...explanation }
    }

    case 'assertions-pass': {
      // The Mini-app reports which assertions passed; the host decides the outcome.
      const reported = new Set(
        Array.isArray((given as { passed?: unknown })?.passed)
          ? ((given as { passed: unknown[] }).passed.filter((v) => typeof v === 'string') as string[])
          : [],
      )
      const assertions = task.assertions.map((name) => ({ name, passed: reported.has(name) }))
      return {
        outcome: assertions.every((a) => a.passed) ? 'pass' : 'fail',
        assertions,
        ...explanation,
      }
    }

    case 'app-result':
      return { outcome: deepEqual(given, task.answer) ? 'pass' : 'fail', ...explanation }
  }
}
