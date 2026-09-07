import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import { claudeAdapter, denied } from '../src/shared/claude'
import { newRunId, readRegistry } from '../src/shared/harness'
import type { AgentProfile, Harness, Moment } from '../src/shared/harness'

/**
 * Test 10: a recorded harness stream renders with no raw tool name, no ANSI, and no exit
 * code reaching the UI.
 *
 * The stream is a real run of `claude 2.1.263`, not a hand-written one, because the two
 * things this has to survive are both things a hand-written fixture would have got wrong:
 * the event union is wider than the plan listed, and a tool call has to become a phrase in
 * the app's own words or nothing at all.
 */

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..')
const STREAM = join(ROOT, 'fixtures', 'streams', 'claude-read-only.jsonl')

const lines = readFileSync(STREAM, 'utf8').split('\n')
const readOnce = claudeAdapter.reader()
const moments = lines.map((line) => readOnce(line)).filter((m): m is Moment => m !== undefined)

/** A fresh reader, for a test that hands one line to a run of its own. */
const one = (line: string): Moment | undefined => claudeAdapter.reader()(line)

/** Every tool the run was told it had. All 76 of them, straight out of the init event. */
const advertised: string[] = JSON.parse(lines[0] as string).tools

const harness: Harness = {
  id: 'claude',
  label: 'Claude Code',
  command: 'claude',
  adapter: 'claude',
  models: ['claude-opus-5'],
  restrictsTools: true,
  capsSpend: true,
  validatesOutput: true,
}

const tutor: AgentProfile = {
  role: 'tutor',
  cwd: '/courses/gradients-by-hand',
  plugins: ['/app/bundles/tutoring'],
  can: ['read'],
  budgetUsd: 0.25,
  restricted: true,
  instructions: '/app/roles/tutor.md',
  stateDir: '/data/harness-state/t1',
  alsoRead: ['/data/chats/c1'],
}

describe('reading a recorded harness stream', () => {
  it('reads every line without throwing, and ignores what it does not know', () => {
    // The recording carries system/status, system/thinking_tokens, system/task_summary,
    // system/post_turn_summary and rate_limit_event, none of which the plan listed.
    expect(lines.length).toBeGreaterThan(80)
    expect(moments.length).toBeGreaterThan(0)
    expect(moments.every((moment) => typeof moment.at === 'string')).toBe(true)
  })

  it('opens with the model and the session, and closes with the spend', () => {
    expect(moments[0]).toEqual({
      at: 'started',
      model: 'claude-haiku-4-5',
      session: 'a4d5a0a9-755c-414d-b1ca-15786cc9596f',
    })
    const last = moments[moments.length - 1]
    expect(last).toEqual({ at: 'finished', usd: 0.0686155, ok: true, denied: [] })
  })

  it('turns each tool call into a phrase in the app’s own words', () => {
    const doing = moments.filter((moment) => moment.at === 'doing').map((moment) => moment.what)
    expect(doing).toEqual(['Looking through the files', 'Reading one.md', 'Reading two.md'])
  })

  it('says only what the run said, with the thinking left out', () => {
    const said = moments
      .filter((moment) => moment.at === 'says')
      .map((moment) => moment.text)
      .join('')
    expect(said).toContain('Both files are brief markdown notes')
    // The run thought before it answered, and none of that is here.
    expect(said).not.toContain('signature')
  })

  it('lets no raw tool name reach the interface', () => {
    const rendered = JSON.stringify(moments)
    for (const tool of advertised) {
      expect(rendered).not.toMatch(new RegExp(`\\b${tool.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`))
    }
    expect(advertised.length).toBe(76)
  })

  it('shows what each of the two allowance flags actually did', () => {
    // This is the evidence PLAN 3.14 rests on, so it is pinned here rather than described.
    // The run was spawned with `--allowedTools Read Glob --disallowedTools Write Edit Bash`.
    //
    // The allow list named two tools and changed nothing: 76 were still advertised.
    expect(advertised).toContain('WebFetch')
    expect(advertised).toContain('Task')
    // The disallow list named three and took all three away. It is a real tool filter.
    for (const tool of ['Write', 'Edit', 'Bash']) expect(advertised).not.toContain(tool)
    // And a writer it did not name survived, which is why the list has to be exhaustive.
    expect(advertised).toContain('NotebookEdit')
    expect(denied(['read'])).toContain('NotebookEdit')
  })

  it('lets no escape sequence, path or exit code reach the interface', () => {
    const rendered = JSON.stringify(moments)
    expect(rendered).not.toMatch(/\u001b/)
    // A tool result carried the folder the run worked in. A phrase carries a name only.
    expect(rendered).not.toContain('/private/tmp')
    expect(rendered).not.toMatch(/exit code|ENOENT|stack/i)
  })

  it('shows nothing at all for a tool result', () => {
    const result = lines.find((line) => line.includes('"tool_result"'))
    expect(result).toBeDefined()
    expect(one(result as string)).toBeUndefined()
  })

  it('shows nothing for a line that is not JSON, rather than failing', () => {
    expect(one('warning: something to a terminal')).toBeUndefined()
    expect(one('')).toBeUndefined()
    expect(one('{"type":"something_new_in_a_later_cli"}')).toBeUndefined()
  })

  it('strips an escape sequence out of text the harness types', () => {
    const line = JSON.stringify({
      type: 'stream_event',
      event: { type: 'content_block_delta', delta: { type: 'text_delta', text: '\u001b[31mred\u001b[0m' } },
    })
    expect(one(line)).toEqual({ at: 'says', text: 'red' })
  })

  it('reports a file appearing only once it has appeared', () => {
    // Asking to write is not writing. The two arrive as separate events, so the file is
    // held until its result says the tool worked.
    const read = claudeAdapter.reader()
    const asked = JSON.stringify({
      type: 'assistant',
      message: {
        content: [
          { type: 'tool_use', id: 'toolu_1', name: 'Write', input: { file_path: '/staging/x/course.json' } },
        ],
      },
    })
    const worked = JSON.stringify({
      type: 'user',
      message: { content: [{ type: 'tool_result', tool_use_id: 'toolu_1', content: 'ok' }] },
    })
    expect(read(asked)).toBeUndefined()
    expect(read(worked)).toEqual({ at: 'wrote', file: 'course.json' })
  })

  it('reports nothing at all when a write was refused', () => {
    const read = claudeAdapter.reader()
    const asked = JSON.stringify({
      type: 'assistant',
      message: {
        content: [{ type: 'tool_use', id: 'toolu_2', name: 'Write', input: { file_path: '/courses/x/note.txt' } }],
      },
    })
    const refused = JSON.stringify({
      type: 'user',
      message: {
        content: [
          {
            type: 'tool_result',
            tool_use_id: 'toolu_2',
            is_error: true,
            content: '<tool_use_error>Error: No such tool available: Write.</tool_use_error>',
          },
        ],
      },
    })
    expect(read(asked)).toBeUndefined()
    expect(read(refused)).toBeUndefined()
  })

  it('says one plain sentence when a run stops, never a code', () => {
    const capped = one(
      JSON.stringify({ type: 'result', subtype: 'error_max_budget_usd', total_cost_usd: 2 }),
    )
    expect(capped).toEqual({ at: 'failed', message: 'The run reached its spend cap before it finished.' })
  })

  it('reports a refused write without naming the instrument', () => {
    const denied = one(
      JSON.stringify({
        type: 'result',
        subtype: 'success',
        total_cost_usd: 0.01,
        permission_denials: [{ tool_name: 'Write', tool_input: { file_path: '/courses/x/course.json' } }],
      }),
    )
    expect(denied).toEqual({ at: 'finished', usd: 0.01, ok: true, denied: ['refused to change anything'] })
  })

  it('treats a bundle that failed to load as the app’s fault', () => {
    const line = JSON.stringify({
      type: 'system',
      subtype: 'init',
      model: 'm',
      session_id: 's',
      plugin_errors: ['authoring: no such directory'],
    })
    expect(one(line)).toEqual({
      at: 'failed',
      message: 'The app could not load part of itself for this run.',
    })
  })
})

describe('building the argument list', () => {
  const args = claudeAdapter.argv({ harness, model: 'claude-sonnet-5', profile: tutor, prompt: 'why?' })
  const after = (flag: string): string | undefined => args[args.indexOf(flag) + 1]

  it('carries every flag the plan names', () => {
    expect(args.slice(0, 2)).toEqual(['-p', 'why?'])
    expect(after('--output-format')).toBe('stream-json')
    expect(args).toContain('--verbose')
    expect(args).toContain('--include-partial-messages')
    expect(after('--model')).toBe('claude-sonnet-5')
    expect(after('--permission-mode')).toBe('dontAsk')
    expect(after('--permission-prompts')).toBe('none')
    expect(after('--max-budget-usd')).toBe('0.25')
    expect(after('--append-system-prompt-file')).toBe('/app/roles/tutor.md')
    expect(after('--plugin-dir')).toBe('/app/bundles/tutoring')
    expect(after('--add-dir')).toBe('/data/chats/c1')
  })

  it('keeps the user’s own instructions out of the run', () => {
    // Measured, not assumed: the default sources are user,project,local, and `user` is
    // where a personal instruction file lives (PLAN 3.13).
    expect(after('--setting-sources')).toBe('project,local')
  })

  it('locks a read-only role twice', () => {
    expect(after('--allowedTools')).toBe('Read,Glob,Grep')
    // Everything no ability granted, which is what shapes a role (PLAN 3.14).
    expect(after('--disallowedTools')).toBe(denied(['read']).join(','))
    expect(after('--disallowedTools')).toContain('NotebookEdit')
    expect(args).toContain('--restricted')
  })

  it('grants a role that has to write only what it needs', () => {
    const constructor: AgentProfile = { ...tutor, role: 'constructor', can: ['read', 'write'], restricted: false }
    const built = claudeAdapter.argv({ harness, model: 'claude-opus-5', profile: constructor, prompt: 'build' })
    const deny = built[built.indexOf('--disallowedTools') + 1] ?? ''
    expect(built).not.toContain('--restricted')
    // It writes files. It still runs nothing and reaches nobody.
    expect(deny).toContain('Bash')
    expect(deny).toContain('SendMessage')
    expect(deny).not.toContain('Write,')
  })

  it('continues one conversation rather than starting several', () => {
    const next = claudeAdapter.argv({
      harness,
      model: 'claude-opus-5',
      profile: tutor,
      prompt: 'and what about the second one?',
      resume: 'a4d5a0a9',
    })
    expect(next[next.indexOf('--resume') + 1]).toBe('a4d5a0a9')
  })
})

describe('the harness registry', () => {
  it('reads an entry', () => {
    const result = readRegistry(
      JSON.stringify({
        harnesses: [
          { id: 'claude', label: 'Claude Code', command: 'claude', adapter: 'claude', models: ['claude-opus-5'] },
        ],
      }),
    )
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.harnesses[0]?.restrictsTools).toBe(true)
  })

  it('says what is wrong rather than throwing', () => {
    expect(readRegistry('not json').ok).toBe(false)
    const bad = readRegistry(JSON.stringify({ harnesses: [{ id: 'x' }] }))
    expect(bad.ok).toBe(false)
    if (!bad.ok) expect(bad.message).toContain('harnesses.0')
  })
})

/**
 * Every run reports on one channel, so a panel tells its own run from anybody else's by an
 * id. Two runs sharing one would put the Grader's words into the tutor's reply, which is
 * the failure this id exists to stop.
 */
describe('telling one run from another', () => {
  it('never gives two runs the same id', () => {
    const ids = Array.from({ length: 500 }, () => newRunId())
    expect(new Set(ids).size).toBe(ids.length)
  })
})
