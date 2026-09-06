import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import { OUTWARD, RUNNERS, WRITERS, claudeAdapter, denied } from '../src/shared/claude'
import type { Moment } from '../src/shared/harness'

/**
 * A read-only role cannot write, measured rather than argued.
 *
 * PLAN 3.14 lists three layers and the first two are claims about a CLI's flags. A claim
 * about flags is worth what it was measured against, and the previous one in this
 * repository was wrong, so this runs against a real spawn that tried to write and did not.
 *
 * `scripts/prove-refusal.mjs` produced the recording, with the argument list built by the
 * adapter itself. Re-run it when the flags change, and say in the commit which CLI version
 * produced it.
 */

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..')
const STREAM = join(ROOT, 'fixtures', 'streams', 'claude-refused-a-write.jsonl')

const lines = readFileSync(STREAM, 'utf8').split('\n').filter((line) => line.trim() !== '')
const events = lines.map((line) => JSON.parse(line) as Record<string, unknown>)

const init = events.find((event) => event['subtype'] === 'init') as { tools: string[] }
const result = events.find((event) => event['type'] === 'result') as Record<string, unknown>

/** Every tool the run asked for, whether or not it got it. */
const calls = events
  .filter((event) => event['type'] === 'assistant')
  .flatMap((event) => ((event['message'] as { content: unknown[] }).content ?? []) as Record<string, unknown>[])
  .filter((part) => part['type'] === 'tool_use')
  .map((part) => String(part['name']))

describe('a read-only role, told to write a file', () => {
  it('tried, so this is a refusal and not a run that declined to ask', () => {
    expect(calls).toContain('Write')
    // It then went looking for another way to write, which is the case worth covering.
    expect(calls).toContain('ToolSearch')
  })

  it('was refused, in this session and in a subagent', () => {
    const refusals = events
      .filter((event) => event['type'] === 'user')
      .flatMap((event) => ((event['message'] as { content: unknown[] }).content ?? []) as Record<string, unknown>[])
      .filter((part) => part['is_error'] === true)
      .map((part) => String(part['content']))

    expect(refusals.length).toBeGreaterThan(0)
    expect(refusals[0]).toContain('Write is disabled for this session')
    // The refusal covers a subagent too, which matters because `Task` is still offered.
    expect(refusals[0]).toContain('in subagents as well as here')
    expect(init.tools).toContain('Task')
  })

  it('wrote nothing, which the run said itself', () => {
    const said = events
      .filter((event) => event['type'] === 'stream_event')
      .map((event) => event['event'] as Record<string, unknown>)
      .filter((event) => event['type'] === 'content_block_delta')
      .map((event) => event['delta'] as Record<string, unknown>)
      .filter((delta) => delta['type'] === 'text_delta')
      .map((delta) => String(delta['text']))
      .join('')
    expect(said).toContain('unable to complete this task')
  })

  it('never saw the tools it was denied', () => {
    // The disallow list is a real tool filter, so the first layer is the one that worked.
    for (const tool of denied(['read'])) expect(init.tools).not.toContain(tool)
    expect(WRITERS.every((tool) => !init.tools.includes(tool))).toBe(true)
    expect(RUNNERS.every((tool) => !init.tools.includes(tool))).toBe(true)
    expect(OUTWARD.every((tool) => !init.tools.includes(tool))).toBe(true)
  })

  it('lost WebFetch to --restricted, and kept the reading tools', () => {
    expect(init.tools).not.toContain('WebFetch')
    for (const tool of ['Read', 'Glob', 'Grep']) expect(init.tools).toContain(tool)
    // 76 were offered to the run in `claude-read-only.jsonl`, which named three fewer.
    expect(init.tools.length).toBe(62)
  })

  it('reported the refusal nowhere the app can see it, which is worth knowing', () => {
    // `permission_denials` is empty. The tool was never offered, so nothing was denied:
    // the refusal reached the run as a tool result and never reached the result event.
    // So the app must not treat an empty denial list as proof that nothing was refused.
    expect(result['permission_denials']).toEqual([])
    expect(result['subtype']).toBe('success')
  })

  it('tells the reader nothing about any of it', () => {
    const read = claudeAdapter.reader()
    const moments = lines.map((line) => read(line)).filter((m): m is Moment => m !== undefined)

    // The run asked to write two files and neither appeared, so neither is reported.
    expect(moments.filter((moment) => moment.at === 'wrote')).toEqual([])
    const rendered = JSON.stringify(moments)
    for (const tool of init.tools) {
      expect(rendered).not.toMatch(new RegExp(`\\b${tool.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`))
    }
    expect(rendered).not.toContain('tool_use_error')
    expect(rendered).not.toContain('/var/folders')
  })
})
