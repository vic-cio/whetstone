import { z } from 'zod'

/**
 * A Verdict: what a Grader is allowed to come back with.
 *
 * The rule the whole file exists for is in PLAN 3.11 and 3.15. **A partial verdict is
 * recorded as an error, never as a fail.** A Grader that runs out of budget, returns half
 * an object, or invents a criterion has not judged the work, and telling a person they got
 * something wrong on that basis is the worst thing this app could do to them. So every
 * field is required, the criteria must be exactly the ones the Rubric declared, and
 * anything else comes back as a reason rather than an outcome.
 *
 * There are two shapes because there are two Checks. A `model` Task gets a pass or a fail
 * and a reason. A `rubric` Task gets one line per criterion, and the criteria are the
 * Task's, not the Grader's.
 */

/** What a Grader says about one short answer. It may be brief; it may not be empty. */
export const ShortVerdictSchema = z.object({
  kind: z.literal('short'),
  outcome: z.enum(['pass', 'fail']),
  /** Why, in a sentence or two, addressed to the person who answered. */
  reason: z.string().min(1),
})

export const CriterionVerdictSchema = z.object({
  /** The Rubric's own criterion id. A Grader may not invent one or skip one. */
  id: z.string().min(1),
  met: z.boolean(),
  /** What in the Submission shows this. Quoted where the file type allows it. */
  evidence: z.string().min(1),
  /** What was missing. Required even when the criterion was met, where it says "nothing". */
  missing: z.string().min(1),
})

export const RubricVerdictSchema = z.object({
  kind: z.literal('rubric'),
  outcome: z.enum(['pass', 'fail']),
  criteria: z.array(CriterionVerdictSchema).min(1),
  reason: z.string().min(1),
})

export const VerdictSchema = z.discriminatedUnion('kind', [ShortVerdictSchema, RubricVerdictSchema])
export type Verdict = z.infer<typeof VerdictSchema>
export type RubricVerdict = z.infer<typeof RubricVerdictSchema>

/**
 * What the app does with an Attempt whose Check is not deterministic.
 *
 * `judged` is a real verdict. `trouble` is everything else: a run that failed, a budget
 * that ran out, an object that did not validate, a criterion that was not asked for. It
 * carries a sentence for the person and never an outcome.
 */
export type Judgement = { at: 'judged'; verdict: Verdict } | { at: 'trouble'; message: string }

/** The JSON schema handed to a harness that can validate its own output (PLAN 3.11). */
export function schemaFor(criteria: string[]): unknown {
  if (criteria.length === 0) {
    return {
      type: 'object',
      additionalProperties: false,
      required: ['kind', 'outcome', 'reason'],
      properties: {
        kind: { const: 'short' },
        outcome: { enum: ['pass', 'fail'] },
        reason: { type: 'string', minLength: 1 },
      },
    }
  }
  return {
    type: 'object',
    additionalProperties: false,
    required: ['kind', 'outcome', 'criteria', 'reason'],
    properties: {
      kind: { const: 'rubric' },
      outcome: { enum: ['pass', 'fail'] },
      reason: { type: 'string', minLength: 1 },
      criteria: {
        type: 'array',
        minItems: criteria.length,
        maxItems: criteria.length,
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['id', 'met', 'evidence', 'missing'],
          properties: {
            id: { enum: criteria },
            met: { type: 'boolean' },
            evidence: { type: 'string', minLength: 1 },
            missing: { type: 'string', minLength: 1 },
          },
        },
      },
    },
  }
}

/**
 * Read what a Grader produced, or say what is wrong with it.
 *
 * `criteria` is what the Rubric declared, and it is checked rather than trusted: a Grader
 * that skips a hard criterion, or adds one it liked the sound of, has not scored the work
 * the person was shown before they started.
 */
export function readVerdict(raw: unknown, criteria: string[]): Judgement {
  const result = VerdictSchema.safeParse(raw)
  if (!result.success) {
    const first = result.error.issues[0]
    const where = first?.path.join('.') ?? ''
    return {
      at: 'trouble',
      message: `The grader's answer was incomplete${where === '' ? '' : ` at "${where}"`}, so nothing was recorded.`,
    }
  }
  const verdict = result.data

  if (criteria.length === 0) {
    return verdict.kind === 'short'
      ? { at: 'judged', verdict }
      : { at: 'trouble', message: 'The grader scored a rubric that this task does not have.' }
  }
  if (verdict.kind !== 'rubric') {
    return { at: 'trouble', message: 'The grader did not score the rubric, so nothing was recorded.' }
  }

  const given = verdict.criteria.map((entry) => entry.id)
  const missing = criteria.filter((id) => !given.includes(id))
  const extra = given.filter((id) => !criteria.includes(id))
  if (missing.length > 0 || extra.length > 0 || given.length !== new Set(given).size) {
    return {
      at: 'trouble',
      message: 'The grader did not score the criteria this task declares, so nothing was recorded.',
    }
  }
  return { at: 'judged', verdict }
}

/**
 * A Verdict the app can show even when a Grader could not be reached.
 *
 * It is not an outcome. Nothing is recorded from one of these, and the Attempt stays
 * unanswered so the person can try again when the machine is in a better mood.
 */
export const asTrouble = (message: string): Judgement => ({ at: 'trouble', message })
