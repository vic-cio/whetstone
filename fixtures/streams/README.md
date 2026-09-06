# Recorded harness streams

Real output from `claude -p --output-format stream-json --verbose --include-partial-messages`,
kept so the adapter and the tests that prove the harness is invisible run against what a
CLI actually emits rather than against a guess at it (tests 4, 10, 12, 13).

`claude-read-only.jsonl` is one run of `claude 2.1.263` on `claude-haiku-4-5`, in a folder
holding two markdown notes, asked to list them and say what they have in common. It was
spawned the way a Tutor is spawned: `--permission-mode dontAsk --permission-prompts none
--setting-sources project,local --allowedTools Read Glob --disallowedTools Write Edit Bash
--max-budget-usd 0.20`.

It holds 81 events over 4 turns, including `Glob` and `Read` tool calls and their results,
so it exercises the part of the adapter that has to turn a tool name into a phrase in the
app's own words, or into nothing.

Two things in it were not in the plan and are worth reading before writing the adapter.

**The event union is wider than section 3.5 says.** Beside `system/init`, `assistant`,
`user`, `stream_event` and `result`, this run also carries `system/status`,
`system/thinking_tokens`, `system/task_summary`, `system/post_turn_summary` and
`rate_limit_event`. The adapter must ignore what it does not know rather than fail on it,
and the test for "no raw tool name reaches the UI" has to cover the unknown ones too.

**The two allowance flags do different things.** The `system/init` event advertises 76
tools despite `--allowedTools` naming two, so the allow list is a permission filter and not
a tool filter. `--disallowedTools` is a tool filter: it named `Write`, `Edit` and `Bash`,
and none of the three is advertised. But `NotebookEdit` is, and it writes a file, so a
read-only role is only as read-only as its disallow list is complete. `tests/harness.test.ts`
pins all three of those facts against this file.

## `claude-refused-a-write.jsonl`

The other half, recorded the same day with the same CLI. A Tutor-shaped run in a folder
holding one lesson, told to write `note.txt` and to edit the lesson. `tests/refusal.test.ts`
runs against it and `scripts/prove-refusal.mjs` produced it, with the argument list built by
the adapter itself rather than typed out beside it.

It wrote nothing. Four things in it are worth reading.

**The disallow list did the work.** 62 tools were advertised, down from 76, and every name
in `READ_ONLY` was absent. `--restricted` took `WebFetch` as well.

**The run tried anyway.** It called `Write`, was refused, then called `ToolSearch` looking
for `Edit`. So a tool that is not advertised can still be called, and something below the
list has to catch it.

**Something did, and it covers a subagent.** The refusal came back as a tool result:
"No such tool available: Write. Write is disabled for this session, in subagents as well as
here." That last clause matters, because `Task` is still advertised.

**The refusal is invisible to the app.** `permission_denials` was empty and the result was a
success. The refusal reached the run and never reached the result event, so an empty denial
list is not evidence that nothing was refused. The content hash of PLAN 3.14 stays.

Do not regenerate these by hand. Re-record with a real spawn, and say in the commit which
CLI version produced it.
