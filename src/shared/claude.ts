import { plain, named } from './harness'
import type { Ability, Adapter, Moment, Reader, SpawnRequest } from './harness'

/**
 * The Claude CLI adapter.
 *
 * Every flag below was checked against `claude 2.1.263`, and the reader is
 * `fixtures/streams/claude-read-only.jsonl`, a recorded run of that version. Two things in
 * that recording shaped this file:
 *
 *  - The event union is wider than PLAN 3.5 lists. Beside `system/init`, `assistant`,
 *    `user`, `stream_event` and `result` a real run also carries `system/status`,
 *    `system/thinking_tokens`, `system/task_summary`, `system/post_turn_summary` and
 *    `rate_limit_event`. So this reader ignores what it does not know instead of failing
 *    on it, and a new event type in a later CLI is silence rather than a crash.
 *  - `--allowedTools` did not shorten the tool list. It is a permission filter, not a tool
 *    filter, so what actually denies a write is the disallow list and the permission mode
 *    (PLAN 3.14). The allow list is still passed, as the first of three layers.
 *
 * Nothing here knows about a Course, a role, or a screen. It turns a request into an
 * argument list and a line into a `Moment`.
 */

/**
 * Tool name to a phrase in the app's own words. A tool that is not in here shows nothing:
 * the student never learns that a thing called Bash exists (PLAN 3.6, rule 2).
 *
 * A phrase carries at most a file's name, never a path, because a path from inside a run
 * is about the machine rather than about the work.
 */
const SAYING: Record<string, (input: Record<string, unknown>) => string> = {
  Read: (input) => `Reading ${named(String(input['file_path'] ?? ''))}`.trim(),
  Glob: () => 'Looking through the files',
  Grep: () => 'Looking through the files',
  Write: (input) => `Writing ${named(String(input['file_path'] ?? ''))}`.trim(),
  Edit: (input) => `Changing ${named(String(input['file_path'] ?? ''))}`.trim(),
  WebSearch: () => 'Searching the web',
  WebFetch: () => 'Reading a page from the web',
}

/**
 * Claude's names for the tools each ability grants, and for everything a role is denied
 * unless an ability granted it.
 *
 * These names belong to one CLI and live in its adapter, never in a profile. Measured, not
 * assumed: `--allowedTools` is a permission filter and changed nothing about the tool list,
 * while `--disallowedTools` removed exactly what it named. So a role is shaped by what it
 * denies, and the denial has to be exhaustive: a run that named `Write`, `Edit` and `Bash`
 * still advertised `NotebookEdit`, which writes a file and was simply not named.
 */
const GRANTS: Record<Ability, string[]> = {
  read: ['Read', 'Glob', 'Grep'],
  write: ['Write', 'Edit'],
  web: ['WebSearch', 'WebFetch'],
}

export const WRITERS = ['Write', 'Edit', 'NotebookEdit']
export const RUNNERS = ['Bash', 'BashOutput', 'KillShell']
/** Tools that reach out of the machine. No role the app spawns has any use for one. */
export const OUTWARD = [
  'Artifact',
  'SendMessage',
  'PushNotification',
  'RemoteTrigger',
  'CronCreate',
  'CronDelete',
  'DesignSync',
  'EnterWorktree',
  'ExitWorktree',
]

/** Everything this role may not touch. `NotebookEdit` writes, and no ability grants it. */
export function denied(can: Ability[]): string[] {
  const granted = new Set(can.flatMap((ability) => GRANTS[ability]))
  return [...WRITERS, ...RUNNERS, ...OUTWARD].filter((tool) => !granted.has(tool))
}

/** The tools that put a file on disk, which the build feed reports as a file appearing. */
const WRITES = new Set(WRITERS)

export const claudeAdapter: Adapter = {
  id: 'claude',
  litter: [],

  argv(request: SpawnRequest): string[] {
    const { profile, model } = request
    const args = [
      '-p',
      request.prompt,
      '--output-format',
      'stream-json',
      '--verbose',
      '--include-partial-messages',
      '--model',
      model,
      '--permission-mode',
      'dontAsk',
      // There is no terminal to answer a prompt in, so anything unresolved is denied and
      // reported rather than left hanging.
      '--permission-prompts',
      'none',
      // The user's own instruction file lives in the `user` source. Dropping that source
      // keeps the OAuth login and leaves the personal instructions out (PLAN 3.13).
      '--setting-sources',
      'project,local',
      // The cap is the CLI's to keep. The app reads the cost for its meter, but a run
      // cannot overshoot while the app is deciding to stop it.
      '--max-budget-usd',
      String(profile.budgetUsd),
      '--append-system-prompt-file',
      profile.instructions,
    ]

    const allowed = profile.can.flatMap((ability) => GRANTS[ability])
    if (allowed.length > 0) args.push('--allowedTools', allowed.join(','))
    const refuse = denied(profile.can)
    if (refuse.length > 0) args.push('--disallowedTools', refuse.join(','))
    // The second lock of PLAN 3.14, for a role that must run nothing.
    if (profile.restricted) args.push('--restricted')
    for (const bundle of profile.plugins) args.push('--plugin-dir', bundle)
    for (const folder of profile.alsoRead) args.push('--add-dir', folder)
    if (request.resume !== undefined) args.push('--resume', request.resume)
    if (request.schema !== undefined) args.push('--json-schema', JSON.stringify(request.schema))
    return args
  },

  reader(): Reader {
    // What a writing tool was asked to write, until its result says whether it worked.
    const asked = new Map<string, string>()

    return (line: string): Moment | undefined => {
      const trimmed = line.trim()
      if (trimmed === '') return undefined

      let event: Record<string, unknown>
      try {
        event = JSON.parse(trimmed) as Record<string, unknown>
      } catch {
        // A line that is not JSON is the CLI talking to a terminal that is not there. It
        // is not the app's to show, and it is not an error either.
        return undefined
      }

      switch (event['type']) {
        case 'system': {
          if (event['subtype'] !== 'init') return undefined
          // A plugin bundle that failed to load is the app's own fault, not the run's, and
          // the run would go on quietly without the skills the role needs (PLAN 3.6).
          const failures = event['plugin_errors']
          if (Array.isArray(failures) && failures.length > 0) {
            return { at: 'failed', message: 'The app could not load part of itself for this run.' }
          }
          return {
            at: 'started',
            model: String(event['model'] ?? ''),
            session: String(event['session_id'] ?? ''),
          }
        }

        case 'stream_event':
          return fromDelta(event['event'])

        case 'assistant':
          return fromTurn(event['message'], asked)

        case 'user':
          return fromResult2(event['message'], asked)

        case 'result':
          return fromRunEnd(event)

        default:
          return undefined
      }
    }
  },
}

/** Text as it is typed. Thinking is not text: it is not shown and never has been. */
function fromDelta(raw: unknown): Moment | undefined {
  const event = raw as Record<string, unknown> | undefined
  if (!event || event['type'] !== 'content_block_delta') return undefined
  const delta = event['delta'] as Record<string, unknown> | undefined
  if (!delta || delta['type'] !== 'text_delta') return undefined
  const text = plain(String(delta['text'] ?? ''))
  return text === '' ? undefined : { at: 'says', text }
}

/**
 * A finished turn. Only its tool calls are read here: its text already arrived as deltas,
 * so reading it again would say everything twice.
 */
function fromTurn(raw: unknown, asked: Map<string, string>): Moment | undefined {
  const message = raw as Record<string, unknown> | undefined
  const content = message?.['content']
  if (!Array.isArray(content)) return undefined

  for (const part of content as Record<string, unknown>[]) {
    if (part['type'] !== 'tool_use') continue
    const tool = String(part['name'] ?? '')
    const input = (part['input'] ?? {}) as Record<string, unknown>

    if (WRITES.has(tool)) {
      // Asking to write a file is not writing one. A run that is denied the tool still
      // asks for it, and a feed that reported the asking would name files that do not
      // exist. The file is held until its result says it worked.
      const file = named(String(input['file_path'] ?? ''))
      if (file !== '') {
        asked.set(String(part['id'] ?? ''), file)
        return undefined
      }
    }
    const say = SAYING[tool]
    if (say) {
      const what = say(input)
      if (what !== '') return { at: 'doing', what }
    }
    // An unmapped tool, an MCP tool, a subagent: nothing is shown rather than its name.
  }
  return undefined
}

/**
 * A tool result. The reader sees nothing for one of these, with a single exception: this
 * is where a file that was asked for turns into a file that is there.
 */
function fromResult2(raw: unknown, asked: Map<string, string>): Moment | undefined {
  const message = raw as Record<string, unknown> | undefined
  const content = message?.['content']
  if (!Array.isArray(content)) return undefined

  for (const part of content as Record<string, unknown>[]) {
    if (part['type'] !== 'tool_result') continue
    const id = String(part['tool_use_id'] ?? '')
    const file = asked.get(id)
    if (file === undefined) continue
    asked.delete(id)
    if (part['is_error'] === true) return undefined
    return { at: 'wrote', file }
  }
  return undefined
}

function fromRunEnd(event: Record<string, unknown>): Moment {
  const usd = Number(event['total_cost_usd'] ?? 0)
  const denials = event['permission_denials']
  const denied = Array.isArray(denials)
    ? (denials as Record<string, unknown>[]).map((entry) => phraseDenial(entry))
    : []

  if (event['subtype'] !== 'success') {
    // A failed run says one plain sentence. Never an exit code, never a stack (PLAN 3.6).
    return { at: 'failed', message: reason(String(event['subtype'] ?? ''), denied) }
  }
  const structured = event['structured_output']
  return structured === undefined
    ? { at: 'finished', usd, ok: true, denied }
    : { at: 'finished', usd, ok: true, denied, output: structured }
}

/**
 * A denial, in the app's words. This is the thing PLAN 3.14 wants proof of, so it has to
 * be legible in a log without naming the instrument that was refused.
 */
function phraseDenial(entry: Record<string, unknown>): string {
  const tool = String(entry['tool_name'] ?? '')
  return WRITES.has(tool) || tool === 'Bash' ? 'refused to change anything' : 'refused a step'
}

function reason(subtype: string, denied: string[]): string {
  if (subtype.includes('budget') || subtype.includes('max_cost')) {
    return 'The run reached its spend cap before it finished.'
  }
  if (subtype.includes('turns')) return 'The run went on too long and was stopped.'
  if (denied.length > 0) return 'The run asked to do something it is not allowed to do.'
  return 'The run did not finish.'
}
