import { plain, named } from './harness'
import type { Ability, Adapter, Moment, Reader, SpawnRequest } from './harness'

/**
 * The pi adapter.
 *
 * Checked against `pi 0.84.3`, with `fixtures/streams/pi-refused-a-write.jsonl` as the
 * recording. It differs from the Claude CLI in three ways that matter, and every one of
 * them was measured rather than read off a page.
 *
 *  - **The allowlist is the real filter here.** `--tools` genuinely restricts: told to
 *    write a file with `--tools "read,glob,grep"`, the run wrote nothing and said itself
 *    that it only had read access. That is the opposite of `claude`, where the allow list
 *    changed nothing and the disallow list did the work. So the two CLIs enforce a
 *    read-only role with opposite flags, and an adapter is the right place for that to live.
 *  - **It keeps no spend cap.** There is no `--max-budget-usd`, so the app has to watch the
 *    cost and stop the run. `capsSpend: false` in the registry entry says so.
 *  - **It validates no structured output.** There is no `--json-schema`, so a Grader run is
 *    told to write `verdict.json` and the app checks that instead.
 *
 * The stream is one event per token, each carrying the whole usage object, so the reader
 * ignores far more than it keeps.
 */

/** pi's names for what an ability grants. Its vocabulary, in its own adapter. */
const GRANTS: Record<Ability, string[]> = {
  read: ['read', 'glob', 'grep', 'symbol_search', 'module_report'],
  write: ['write', 'edit'],
  web: ['web_search', 'fetch_content', 'get_search_content'],
}

/** The tools that put a file on disk, so a build feed can report one appearing. */
const WRITES = new Set(['write', 'edit'])

const SAYING: Record<string, (input: Record<string, unknown>) => string> = {
  read: (input) => `Reading ${named(String(input['path'] ?? input['file'] ?? ''))}`.trim(),
  glob: () => 'Looking through the files',
  grep: () => 'Looking through the files',
  symbol_search: () => 'Looking through the files',
  write: (input) => `Writing ${named(String(input['path'] ?? input['file'] ?? ''))}`.trim(),
  edit: (input) => `Changing ${named(String(input['path'] ?? input['file'] ?? ''))}`.trim(),
  web_search: () => 'Searching the web',
  fetch_content: () => 'Reading a page from the web',
}

export const piAdapter: Adapter = {
  id: 'pi',

  argv(request: SpawnRequest): string[] {
    const { profile, model, harness } = request
    const args = ['-p', request.prompt, '--mode', 'json', '--model', model]
    if (harness.provider !== undefined) args.push('--provider', harness.provider)

    // The allowlist is the whole restriction here, so it has to be complete rather than
    // indicative: everything not named is off, which is what makes this CLI the easy one.
    const allowed = profile.can.flatMap((ability) => GRANTS[ability])
    args.push('--tools', allowed.join(','))

    args.push('--append-system-prompt', profile.instructions)
    // pi discovers AGENTS.md in the working directory by itself, which is exactly what a
    // Tutor inside a Course wants, so that discovery is left switched on.
    for (const bundle of profile.plugins) args.push('--extension', bundle)
    if (request.resume !== undefined) args.push('--session', request.resume)
    return args
  },

  reader(): Reader {
    // pi reports a turn's cost cumulatively per turn, so the run's cost is the sum of them.
    let spent = 0
    let session = ''

    return (line: string): Moment | undefined => {
      const trimmed = line.trim()
      if (trimmed === '') return undefined

      let event: Record<string, unknown>
      try {
        event = JSON.parse(trimmed) as Record<string, unknown>
      } catch {
        return undefined
      }

      switch (event['type']) {
        case 'session':
          session = String(event['id'] ?? '')
          return { at: 'started', model: '', session }

        case 'message_update':
          return fromUpdate(event['assistantMessageEvent'])

        case 'message_end':
          return fromTurn(event['message'])

        case 'turn_end': {
          const message = event['message'] as Record<string, unknown> | undefined
          const usage = message?.['usage'] as Record<string, unknown> | undefined
          const cost = usage?.['cost'] as Record<string, unknown> | undefined
          spent += Number(cost?.['total'] ?? 0)
          return undefined
        }

        // The run has stopped for good. Everything before this may be one turn of several.
        case 'agent_settled':
          return { at: 'finished', usd: spent, ok: true, denied: [] }

        default:
          return undefined
      }
    }
  },
}

/** Text as it is typed. Thinking is not text and is not shown. */
function fromUpdate(raw: unknown): Moment | undefined {
  const event = raw as Record<string, unknown> | undefined
  if (!event || event['type'] !== 'text_delta') return undefined
  const text = plain(String(event['delta'] ?? ''))
  return text === '' ? undefined : { at: 'says', text }
}

/**
 * A finished message. Only its tool calls are read: the text already arrived as deltas.
 *
 * A write is reported here rather than held, because pi reports a tool call in the message
 * that finished it rather than as a separate request and result. There is no moment between
 * the two in which the app could be told a file appeared that did not.
 */
function fromTurn(raw: unknown): Moment | undefined {
  const message = raw as Record<string, unknown> | undefined
  if (message?.['role'] !== 'assistant') return undefined
  const content = message['content']
  if (!Array.isArray(content)) return undefined

  for (const part of content as Record<string, unknown>[]) {
    const kind = String(part['type'] ?? '')
    if (kind !== 'toolCall' && kind !== 'tool_call' && kind !== 'tool_use') continue
    const tool = String(part['name'] ?? part['toolName'] ?? '')
    const input = (part['input'] ?? part['args'] ?? {}) as Record<string, unknown>

    if (WRITES.has(tool)) {
      const file = named(String(input['path'] ?? input['file'] ?? ''))
      if (file !== '') return { at: 'wrote', file }
    }
    const say = SAYING[tool]
    if (say) {
      const what = say(input)
      if (what !== '') return { at: 'doing', what }
    }
  }
  return undefined
}
