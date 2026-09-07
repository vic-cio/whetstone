import { plain, named } from './harness'
import type { Adapter, Moment, Reader, SpawnRequest } from './harness'

/**
 * The Codex adapter.
 *
 * Checked against `codex-cli 0.153.0`. It is the third harness measured and the third
 * mechanism for the same job, which is the finding worth carrying out of phase 6: a
 * restriction is not one idea with three spellings.
 *
 *  - **It restricts with a sandbox, not with a tool list.** `-s read-only` is an operating
 *    system sandbox around everything the run does, rather than an allow list or a deny
 *    list. That is stronger than either, because it does not depend on the model's tools
 *    being named correctly, and it is why `restrictsTools` is true for this entry.
 *  - **It has no flag for a system prompt.** `claude` has `--append-system-prompt-file` and
 *    `pi` has `--append-system-prompt`; Codex has neither, so the role's instructions are
 *    read by the caller and put at the top of the prompt. The role file is the same file.
 *  - **It validates structured output**, with `--output-schema <FILE>`, which takes a path
 *    rather than a string. The caller writes the schema out and passes the path.
 *  - **It keeps no spend cap**, so the app watches the cost, as it does for `pi`.
 *
 * `--ignore-user-config` is what closes the instruction leak of PLAN 3.13 here, in place of
 * `--setting-sources project,local`.
 */

/** Codex names a tool in an event rather than being told which ones it may have. */
const SAYING: Record<string, (input: Record<string, unknown>) => string> = {
  read_file: (input) => `Reading ${named(String(input['path'] ?? ''))}`.trim(),
  list_dir: () => 'Looking through the files',
  grep: () => 'Looking through the files',
  write_file: (input) => `Writing ${named(String(input['path'] ?? ''))}`.trim(),
  apply_patch: (input) => `Changing ${named(String(input['path'] ?? ''))}`.trim(),
  web_search: () => 'Searching the web',
}

const WRITES = new Set(['write_file', 'apply_patch'])

export const codexAdapter: Adapter = {
  id: 'codex',

  argv(request: SpawnRequest): string[] {
    const { profile, model } = request
    const writes = profile.can.includes('write')

    const args = [
      'exec',
      '--json',
      '--model',
      model,
      '--cd',
      profile.cwd,
      // The whole restriction. A role that only reads gets a read-only sandbox, which is
      // an operating system boundary rather than a promise about which tools were offered.
      '--sandbox',
      writes ? 'workspace-write' : 'read-only',
      // The user's own instruction file lives in the config this ignores (PLAN 3.13).
      '--ignore-user-config',
      // A Course is not a git repository, and neither is a staging folder.
      '--skip-git-repo-check',
    ]

    for (const folder of profile.alsoRead) args.push('--add-dir', folder)
    if (request.resume !== undefined) args.push('resume', request.resume)
    // `--output-schema` takes a path. The caller writes the file and passes it as `schema`.
    if (typeof request.schema === 'string') args.push('--output-schema', request.schema)

    // Last, because Codex takes the prompt as a positional argument.
    args.push(request.prompt)
    return args
  },

  reader(): Reader {
    let spent = 0

    return (line: string): Moment | undefined => {
      const trimmed = line.trim()
      if (trimmed === '') return undefined

      let event: Record<string, unknown>
      try {
        event = JSON.parse(trimmed) as Record<string, unknown>
      } catch {
        return undefined
      }

      const kind = String(event['type'] ?? event['msg'] ?? '')

      if (kind === 'session.created' || kind === 'thread.started') {
        return {
          at: 'started',
          model: String(event['model'] ?? ''),
          session: String(event['session_id'] ?? event['thread_id'] ?? event['id'] ?? ''),
        }
      }

      if (kind.endsWith('agent_message_delta') || kind === 'item.delta') {
        const text = plain(String(event['delta'] ?? event['text'] ?? ''))
        return text === '' ? undefined : { at: 'says', text }
      }

      if (kind.includes('tool') || kind === 'item.started' || kind === 'item.completed') {
        return fromTool(event)
      }

      if (kind === 'turn.completed' || kind === 'thread.finished') {
        const usage = event['usage'] as Record<string, unknown> | undefined
        spent += Number(usage?.['cost_usd'] ?? usage?.['total_cost_usd'] ?? 0)
        return { at: 'finished', usd: spent, ok: true, denied: [] }
      }

      if (kind === 'error' || kind === 'turn.failed') {
        return { at: 'failed', message: 'The run did not finish.' }
      }
      return undefined
    }
  },
}

function fromTool(event: Record<string, unknown>): Moment | undefined {
  const item = (event['item'] ?? event) as Record<string, unknown>
  const tool = String(item['tool'] ?? item['name'] ?? '')
  const input = (item['arguments'] ?? item['input'] ?? {}) as Record<string, unknown>

  // Only a completed write reports a file. Asking to write is not writing, and a sandbox
  // that refuses one still lets the model ask (docs/adr/0021 and the claude recording).
  const done = String(event['type'] ?? '') === 'item.completed' || event['status'] === 'completed'
  if (WRITES.has(tool) && done) {
    const file = named(String(input['path'] ?? ''))
    if (file !== '') return { at: 'wrote', file }
  }
  const say = SAYING[tool]
  if (say) {
    const what = say(input)
    if (what !== '') return { at: 'doing', what }
  }
  return undefined
}
