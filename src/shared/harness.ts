import { z } from 'zod'

/**
 * What a Harness is, and what comes back out of one.
 *
 * A Harness is an agent program the app spawns when a job needs a model (PLAN 3.5). It is
 * a registry entry rather than code: adding one is a line of JSON naming a command and an
 * adapter. The adapter is the only part that knows a particular CLI's flags and output.
 *
 * Everything above the adapter deals in `Moment`s, which are the app's own words for what
 * happened. That is what makes the harness invisible (PLAN 3.6): no tool name, no ANSI, no
 * exit code and no raw stream ever reaches the interface, because the interface is handed
 * a `Moment` and a `Moment` cannot carry one.
 *
 * Nothing here spawns anything. This module is the vocabulary; `src/main/harness.ts` runs
 * the process.
 */

export const HarnessSchema = z.object({
  id: z.string().min(1),
  /** What Settings calls it. The student never sees this either way. */
  label: z.string().min(1),
  /** The program to run. Looked up on a widened PATH, so Finder launches work. */
  command: z.string().min(1),
  /** Which adapter builds this CLI's arguments and reads its output. */
  adapter: z.string().min(1),
  models: z.array(z.string().min(1)).min(1),
  /** Some CLIs name a provider separately from the model. Passed only when it is set. */
  provider: z.string().min(1).optional(),
  /**
   * Set when this CLI cannot restrict its own tools, so the content hash of PLAN 3.14 is
   * the only guard left. Measured per CLI, never assumed.
   */
  restrictsTools: z.boolean().default(true),
  /**
   * Whether this CLI keeps a spend cap itself. `claude` does, with `--max-budget-usd`, and
   * `pi` has no such flag, so the app watches the cost and stops the run. A cap nobody keeps
   * is not a cap (PLAN 3.5).
   */
  capsSpend: z.boolean().default(false),
  /**
   * Whether this CLI validates its own structured output against a schema. When it does not,
   * the Grader is told to write `verdict.json` and the app validates that instead. Both paths
   * end in the same checked object (PLAN 3.11).
   */
  validatesOutput: z.boolean().default(false),
})
export type Harness = z.infer<typeof HarnessSchema>

export const RegistrySchema = z.object({ harnesses: z.array(HarnessSchema).min(1) })

/** Read a `harnesses.json`, or say what is wrong with it. Never throws. */
export function readRegistry(text: string): { ok: true; harnesses: Harness[] } | { ok: false; message: string } {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch (cause) {
    return { ok: false, message: `harnesses.json is not valid JSON: ${(cause as Error).message}` }
  }
  const result = RegistrySchema.safeParse(parsed)
  if (!result.success) {
    const first = result.error.issues[0]
    const where = first?.path.join('.') ?? ''
    return { ok: false, message: `harnesses.json ${where}: ${first?.message ?? 'is not a registry'}` }
  }
  return { ok: true, harnesses: result.data.harnesses }
}

export const ROLES = ['constructor', 'tutor', 'grader'] as const
export type Role = (typeof ROLES)[number]

/**
 * What a role may do, in the app's own terms.
 *
 * Not a tool name. A tool name belongs to one CLI, and a profile that carried one would
 * make every role Claude-shaped, which is the opposite of what a registry of harnesses is
 * for. The adapter maps an ability to whatever its own CLI calls those tools, and denies
 * everything no ability granted.
 */
export const ABILITIES = ['read', 'write', 'web'] as const
export type Ability = (typeof ABILITIES)[number]

/**
 * What makes one role differ from another. A role has no code path of its own: it is a
 * working directory, an instruction file, a plugin bundle, an allowance and a budget
 * (PLAN 3.5). The host resolves a profile plus a Harness plus a model into one spawn.
 */
export interface AgentProfile {
  role: Role
  cwd: string
  /** Absolute paths to plugin bundles the app ships. The user never sees these. */
  plugins: string[]
  /** What this role may do. Anything no ability grants is denied. */
  can: Ability[]
  budgetUsd: number
  /**
   * A second lock for a role that must run nothing: it takes away the built-in tools that
   * execute commands or code, and WebFetch. The Constructor writes and searches, so it is
   * the one role this is false for (PLAN 3.5, PLAN 3.14).
   */
  restricted: boolean
  /** The role instruction file, appended to the harness's own system prompt. */
  instructions: string
  /** Folders outside `cwd` the run may read, such as a conversation's attachments. */
  alsoRead: string[]
  /**
   * Where a harness may keep its own state.
   *
   * Found by running one: `pi` writes a `.pi/` folder into its working directory. For a
   * build that folder would travel into the Course, and for a Tutor run, whose working
   * directory is the Course, it would trip the guard that puts a changed Course back. So a
   * harness that can be told where to put its state is told, and the place is the app's.
   */
  stateDir: string
}

export interface SpawnRequest {
  harness: Harness
  model: string
  profile: AgentProfile
  prompt: string
  /**
   * Continue a previous exchange. The Brief is several spawns against one conversation
   * (PLAN 3.19), and this is what keeps them one conversation rather than several.
   */
  resume?: string
  /** A JSON schema the harness validates its own output against, when it can (PLAN 3.11). */
  schema?: unknown
}

/**
 * What the app understood happened. The interface renders these and nothing else.
 *
 * `doing` is already a phrase in the app's own vocabulary, never a tool name: an adapter
 * that cannot phrase a tool call emits no `doing` at all (PLAN 3.6, rule 2).
 */
export type Moment =
  | { at: 'started'; model: string; session: string }
  | { at: 'says'; text: string }
  | { at: 'doing'; what: string }
  | { at: 'wrote'; file: string }
  | { at: 'finished'; usd: number; ok: boolean; denied: string[]; output?: unknown }
  | { at: 'failed'; message: string }

/**
 * An id for one run.
 *
 * The window mints it and passes it in with the call that starts the run, rather than the
 * main process minting it and returning it. A return arrives when the run is over and the
 * Moments arrive while it is going, so a panel has to know what to listen for before the
 * first one lands.
 *
 * Unique among the runs one window has going, which is all a panel needs to tell its own
 * from somebody else's.
 */
let counted = 0
export function newRunId(): string {
  counted += 1
  return `run-${Date.now().toString(36)}-${counted.toString(36)}`
}

export interface Adapter {
  id: string
  /**
   * Folders this CLI writes into its working directory whatever it is told.
   *
   * `pi` keeps `.pi/` beside whatever it is working on, and `--session-dir` moves only the
   * sessions. A working directory is a Course being built or a Course being read, so
   * anything left there would ship inside the Course or trip the guard in PLAN 3.14. The
   * gate takes these out by name, because guessing at what is litter and what is content
   * would eventually take out a Course's own `.claude/skills/`.
   */
  litter: string[]
  /** The whole argument list, prompt included. */
  argv(request: SpawnRequest): string[]
  /**
   * A fresh reader for one run. It is a factory rather than a function because reading a
   * stream needs memory: a tool call and whether it worked arrive as two separate events,
   * and a Mini-app file that a run asked to write and was refused must not be reported as
   * a file that appeared.
   */
  reader(): Reader
}

/** One line of a harness's output, as a Moment, or nothing when it says nothing. */
export type Reader = (line: string) => Moment | undefined

/**
 * ANSI escapes have no meaning in a window that is not a terminal, and a harness that
 * emits them into a message would put them on screen as rubbish. They come off here, once,
 * so no adapter has to remember to do it.
 */
const ANSI = /\u001b\[[0-9;?]*[ -\/]*[@-~]/g
export const plain = (text: string): string => text.replace(ANSI, '')

/** Just the file's name. A path from inside a run is the machine's business, not the reader's. */
export const named = (path: string): string => path.split('/').filter(Boolean).pop() ?? ''
