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

**`--allowedTools` did not shorten the tool list.** The `system/init` event advertises 76
tools, `Write` and `Bash` among them, despite the allow list naming two. So the allow list
is a permission filter and not a tool filter, and section 3.14's first layer does not say
what it claims. Re-record with an attempted write before relying on it.

Do not regenerate these by hand. Re-record with a real spawn, and say in the commit which
CLI version produced it.
