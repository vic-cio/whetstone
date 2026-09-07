/**
 * What the Constructor is allowed to come back with about a defect report.
 *
 * A report is a claim that a Task itself is broken, on three grounds, and it is not an
 * appeal against a Verdict (PLAN 3.15). The Constructor reads the Task, the note and the
 * ground, and says one of two things: it agrees, or it names something the reader may have
 * missed. It settles nothing either way. **The person has the authority to override it.**
 *
 * The same rule as a Verdict applies here for the same reason: an answer that cannot be
 * read is trouble, not a decision. A run that failed, ran out of budget, or came back with
 * prose that says neither word has not evaluated anything, and recording a guess would
 * either wave away a real defect or void somebody's Attempts on a run that never ran.
 */

export type Evaluation =
  | { at: 'evaluated'; agrees: boolean; text: string }
  /** Nothing is recorded and the report stays open, exactly as it was filed. */
  | { at: 'trouble'; message: string }

/** The first word, with the markup a model reaches for taken off it. */
const FIRST = /^[*_#>\s-]*(agree|disagree)\b[*_:.\s-]*/i

export function readEvaluation(said: string): Evaluation {
  const text = said.trim()
  const found = FIRST.exec(text)
  if (!found) {
    return {
      at: 'trouble',
      message: 'The constructor did not say whether it agrees, so the report is still open.',
    }
  }

  // What is left after the word is the reason, and a verdict with no reason in it is no
  // use to the person reading it: they are being told to accept or override something.
  const rest = text.slice(found[0].length).trim()
  if (rest === '') {
    return { at: 'trouble', message: 'The constructor gave no reason, so the report is still open.' }
  }
  return { at: 'evaluated', agrees: (found[1] ?? '').toLowerCase() === 'agree', text: rest }
}
