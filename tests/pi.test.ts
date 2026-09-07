import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import { graderPrompt } from '../src/shared/prompts'
import { codexAdapter } from '../src/shared/codex'
import { piAdapter } from '../src/shared/pi'
import { readRegistry } from '../src/shared/harness'
import type { AgentProfile, Harness, Moment } from '../src/shared/harness'

/**
 * The pi adapter, against a real run of `pi 0.84.3`.
 *
 * Phase 6's rule is that each CLI is measured rather than assumed, and pi differs from
 * `claude` in three ways that all had to be found by running it. Two of them are things the
 * app has to make up for, so they are registry facts rather than adapter details.
 */

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..')
const STREAM = join(ROOT, 'fixtures', 'streams', 'pi-refused-a-write.jsonl')

const lines = readFileSync(STREAM, 'utf8').split('\n')
const read = piAdapter.reader()
const moments = lines.map((line) => read(line)).filter((m): m is Moment => m !== undefined)

const harness: Harness = {
  id: 'pi',
  label: 'pi',
  command: 'pi',
  adapter: 'pi',
  provider: 'openrouter',
  models: ['~openai/gpt-mini-latest'],
  restrictsTools: true,
  capsSpend: false,
  validatesOutput: false,
}

const tutor: AgentProfile = {
  role: 'tutor',
  cwd: '/courses/gradients-by-hand',
  plugins: [],
  can: ['read'],
  budgetUsd: 0.25,
  restricted: true,
  instructions: '/app/roles/tutor.md',
  stateDir: '/data/harness-state/t1',
  alsoRead: [],
}

describe('reading what pi emits', () => {
  it('reads every line without throwing, and ignores what it does not know', () => {
    // One event per token, each carrying the whole usage object, so most of this is noise.
    expect(lines.length).toBeGreaterThan(100)
    expect(moments.length).toBeGreaterThan(0)
  })

  it('opens with the session, and closes when the run has settled', () => {
    expect(moments[0]?.at).toBe('started')
    const last = moments[moments.length - 1]
    expect(last?.at).toBe('finished')
    if (last?.at === 'finished') {
      // pi reports a turn's cost in `turn_end`, so the run's cost is the sum of them.
      expect(last.usd).toBeCloseTo(0.00445125, 8)
    }
  })

  it('says what the run said, with the thinking left out', () => {
    const said = moments
      .filter((moment) => moment.at === 'says')
      .map((moment) => moment.text)
      .join('')
    expect(said).toContain('I only have read/search access')
    expect(said).not.toContain('reasoning.encrypted')
  })

  it('lets no raw tool name or escape sequence into what the app writes', () => {
    // The scan that works for `claude` cannot work here. Its tool names are `Read`, `Glob`,
    // `NotebookEdit`: distinctive enough that finding one in the output means a leak. pi's
    // are `read`, `write`, `edit`, `bash`, which are also ordinary English, and this very
    // run says "I can't actually create or edit files". That is an answer, not a leak.
    //
    // So the claim is about the lines the app writes rather than the ones it relays: a
    // status line and a file notice are the app's own words, and neither may name a tool.
    const written = moments.filter((moment) => moment.at === 'doing' || moment.at === 'wrote')
    const rendered = JSON.stringify(written)
    for (const tool of ['bash', 'write', 'edit', 'bg_run', 'ctx_execute', 'fusion_reason', 'read']) {
      expect(rendered).not.toMatch(new RegExp(`\\b${tool}\\b`))
    }
    expect(JSON.stringify(moments)).not.toMatch(/\u001b/)
  })

  it('phrases a tool call in the app’s own words, never in pi’s', () => {
    const fresh = piAdapter.reader()
    const line = JSON.stringify({
      type: 'message_end',
      message: {
        role: 'assistant',
        content: [{ type: 'toolCall', id: 'toolu_2', name: 'read', arguments: { path: 'lessons/les-one.md' } }],
      },
    })
    expect(fresh(line)).toEqual({ at: 'doing', what: 'Reading les-one.md' })
  })

  it('shows nothing for a line that is not JSON, rather than failing', () => {
    const fresh = piAdapter.reader()
    expect(fresh('pi: some warning')).toBeUndefined()
    expect(fresh('')).toBeUndefined()
    expect(fresh('{"type":"something_new_in_a_later_pi"}')).toBeUndefined()
  })

  it('reports a file appearing, in pi’s own vocabulary for a tool call', () => {
    const fresh = piAdapter.reader()
    const line = JSON.stringify({
      type: 'message_end',
      message: {
        role: 'assistant',
        // The shape a real run emits: `arguments`, not `input`. Taken from a recording.
        content: [{ type: 'toolCall', id: 'toolu_1', name: 'write', arguments: { path: 'course.json' } }],
      },
    })
    expect(fresh(line)).toEqual({ at: 'wrote', file: 'course.json' })
  })
})

describe('what pi is told to do', () => {
  const args = piAdapter.argv({ harness, model: '~openai/gpt-mini-latest', profile: tutor, prompt: 'why?' })
  const after = (flag: string): string | undefined => args[args.indexOf(flag) + 1]

  it('is headless and structured, on the provider the registry names', () => {
    expect(args.slice(0, 2)).toEqual(['-p', 'why?'])
    expect(after('--mode')).toBe('json')
    expect(after('--model')).toBe('~openai/gpt-mini-latest')
    expect(after('--provider')).toBe('openrouter')
    expect(after('--append-system-prompt')).toBe('/app/roles/tutor.md')
  })

  it('restricts with an allowlist, which is the opposite of the other CLI', () => {
    // Measured: told to write with `--tools "read,glob,grep"`, the run wrote nothing and
    // said so itself. `claude` ignores its allow list and is restrained by its deny list.
    const allowed = (after('--tools') ?? '').split(',')
    expect(allowed).toContain('read')
    expect(allowed).not.toContain('write')
    expect(allowed).not.toContain('edit')
    expect(allowed).not.toContain('bash')
    expect(args).not.toContain('--exclude-tools')
  })

  it('grants writing only to a role that has to write', () => {
    const builder = piAdapter.argv({
      harness,
      model: '~openai/gpt-latest',
      profile: { ...tutor, role: 'constructor', can: ['read', 'write', 'web'], restricted: false },
      prompt: 'build',
    })
    const allowed = (builder[builder.indexOf('--tools') + 1] ?? '').split(',')
    expect(allowed).toContain('write')
    expect(allowed).toContain('web_search')
    // It writes files. It still runs nothing.
    expect(allowed).not.toContain('bash')
    expect(allowed).not.toContain('bg_run')
  })

  it('continues one conversation rather than starting several', () => {
    const next = piAdapter.argv({
      harness,
      model: '~openai/gpt-mini-latest',
      profile: tutor,
      prompt: 'and the second one?',
      resume: '01a07abe-43f5-7006-bc4e-015b43739567',
    })
    expect(next[next.indexOf('--session') + 1]).toBe('01a07abe-43f5-7006-bc4e-015b43739567')
  })
})

describe('what the app has to make up for', () => {
  it('is written down in the registry rather than known by the adapter', () => {
    const result = readRegistry(readFileSync(join(ROOT, 'agent', 'harnesses.json'), 'utf8'))
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const pi = result.harnesses.find((entry) => entry.id === 'pi')
    const claude = result.harnesses.find((entry) => entry.id === 'claude')

    // pi has no `--max-budget-usd`, so the app watches the cost and stops the run.
    expect(pi?.capsSpend).toBe(false)
    expect(claude?.capsSpend).toBe(true)
    // pi has no `--json-schema`, so the Grader is asked for a file the app checks.
    expect(pi?.validatesOutput).toBe(false)
    expect(claude?.validatesOutput).toBe(true)
  })

  it('asks a grader that cannot check itself for a file, and says what goes in it', () => {
    const asked = graderPrompt({ rubric: false, skills: [], attached: [], writeFile: true })
    expect(asked).toContain('Write your verdict to `verdict.json`')
    expect(asked).toContain('"kind":"short"')
    expect(asked).toContain('not recorded at all')

    // And says nothing about a file to one that validates its own output.
    expect(graderPrompt({ rubric: false, skills: [], attached: [], writeFile: false })).not.toContain(
      'verdict.json',
    )
  })

  it('describes the rubric shape when the rubric is what is being scored', () => {
    const asked = graderPrompt({ rubric: true, skills: [], attached: [], writeFile: true })
    expect(asked).toContain('"kind":"rubric"')
    expect(asked).toContain('"evidence"')
    expect(asked).toContain('"missing"')
  })
})

/**
 * Codex, the third harness and the third mechanism.
 *
 * `codex-cli 0.153.0` restricts with an operating system sandbox rather than with a list of
 * tools. That is stronger than either of the other two, because it does not depend on the
 * tools being named correctly, and it is the finding phase 6 exists to produce: a
 * restriction is not one idea with three spellings.
 */
describe('the codex adapter', () => {
  const codex: Harness = {
    id: 'codex',
    label: 'Codex',
    command: 'codex',
    adapter: 'codex',
    models: ['gpt-5.6-luna'],
    restrictsTools: true,
    capsSpend: false,
    validatesOutput: true,
  }

  const argv = (can: AgentProfile['can']): string[] =>
    codexAdapter.argv({
      harness: codex,
      model: 'gpt-5.6-luna',
      profile: { ...tutor, can, restricted: can.length === 1 },
      prompt: 'why?',
    })

  it('runs headless, structured, and outside a git repository', () => {
    const args = argv(['read'])
    expect(args[0]).toBe('exec')
    expect(args).toContain('--json')
    expect(args).toContain('--skip-git-repo-check')
    // Codex takes its prompt as a positional argument, so it comes last.
    expect(args[args.length - 1]).toBe('why?')
  })

  it('restricts with a sandbox, which the other two do not have', () => {
    expect(argv(['read'])[argv(['read']).indexOf('--sandbox') + 1]).toBe('read-only')
    const writing = argv(['read', 'write'])
    expect(writing[writing.indexOf('--sandbox') + 1]).toBe('workspace-write')
    // There is no tool list either way. The boundary is the filesystem.
    expect(argv(['read'])).not.toContain('--tools')
    expect(argv(['read'])).not.toContain('--allowedTools')
  })

  it('keeps the user’s own instructions out, in its own way', () => {
    // `claude` has --setting-sources and Codex has this. Same job, PLAN 3.13.
    expect(argv(['read'])).toContain('--ignore-user-config')
  })

  it('reads a cost and a session out of its own event names', () => {
    const read = codexAdapter.reader()
    expect(read(JSON.stringify({ type: 'thread.started', thread_id: 't1', model: 'gpt-5.6-luna' }))).toEqual({
      at: 'started',
      model: 'gpt-5.6-luna',
      session: 't1',
    })
    expect(read(JSON.stringify({ type: 'turn.completed', usage: { cost_usd: 0.42 } }))).toEqual({
      at: 'finished',
      usd: 0.42,
      ok: true,
      denied: [],
    })
  })

  it('says what it is doing while it writes, and claims the file only once it is there', () => {
    // Two different claims. "Writing course.json" is what is happening now; a `wrote`
    // moment says a file exists, and a sandbox that refuses the write must not produce one.
    const read = codexAdapter.reader()
    const asked = { type: 'item.started', item: { tool: 'write_file', arguments: { path: 'a/course.json' } } }
    const done = { type: 'item.completed', item: { tool: 'write_file', arguments: { path: 'a/course.json' } } }
    expect(read(JSON.stringify(asked))).toEqual({ at: 'doing', what: 'Writing course.json' })
    expect(read(JSON.stringify(done))).toEqual({ at: 'wrote', file: 'course.json' })

    // A write that was started and never completed says a thing was attempted, never that
    // a file appeared.
    const half = codexAdapter.reader()
    expect(half(JSON.stringify(asked))?.at).toBe('doing')
  })
})

describe('a turn that ended in an error the CLI exited zero on', () => {
  const turn = (errorMessage: string): string =>
    JSON.stringify({ type: 'turn_end', message: { stopReason: 'error', errorMessage, usage: { cost: { total: 0 } } } })

  it('is trouble, not a silent success', () => {
    // Found by running one. The provider answered 403 because the account was out of
    // credit, pi reported the turn as an error and exited cleanly, and the app recorded a
    // success that had said nothing and cost nothing.
    const read = piAdapter.reader()
    read(turn('403: {"message":"Workspace lifetime budget of $1.00 exceeded. Contact your org admin.","code":403}'))
    expect(read(JSON.stringify({ type: 'agent_settled' }))).toEqual({
      at: 'failed',
      message: 'Workspace lifetime budget of $1.00 exceeded. Contact your org admin.',
    })
  })

  it('says something true when the error carries no sentence of its own', () => {
    const read = piAdapter.reader()
    read(turn('connection reset'))
    expect(read(JSON.stringify({ type: 'agent_settled' }))).toEqual({
      at: 'failed',
      message: 'The model provider refused the request.',
    })
  })

  it('shows no status code and no brace, whatever arrived', () => {
    const read = piAdapter.reader()
    read(turn('500: {"error":{"message":"upstream is having a moment"}}'))
    const last = read(JSON.stringify({ type: 'agent_settled' }))
    expect(last).toEqual({ at: 'failed', message: 'upstream is having a moment.' })
    // The sentence itself carries no status code and no JSON, which is the claim.
    const said = last?.at === 'failed' ? last.message : ''
    expect(said).not.toMatch(/[{}]|\b500\b/)
  })

  it('still reports a good run as finished', () => {
    const read = piAdapter.reader()
    read(JSON.stringify({ type: 'turn_end', message: { stopReason: 'stop', usage: { cost: { total: 0.5 } } } }))
    expect(read(JSON.stringify({ type: 'agent_settled' }))).toEqual({
      at: 'finished',
      usd: 0.5,
      ok: true,
      denied: [],
    })
  })
})
