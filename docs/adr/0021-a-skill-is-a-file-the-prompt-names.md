---
status: accepted
---

# A skill is a file the prompt names, not a plugin the harness loads

The app ships a set of skills per role: the Course format, how to write a Lesson, a Task and a Mini-app, and what an agent at study time can judge. They were first shipped as a Claude Code plugin and loaded with `--plugin-dir`, which worked, and which quietly made the whole thing Claude-only.

A Harness is meant to be a registry entry rather than a code path (`docs/adr/0012`, PLAN 3.5). A plugin directory is not that. It is one program's format, and another CLI given the same folder loads nothing from it. The skills are not decoration: `course-format` *is* the schema, so a run that never receives it writes a folder the parser refuses. The failure would not even look like a missing skill. It would look like a harness that cannot write a Course.

So the app copies the role's skills into `.whetstone/skills/` inside the run's working folder, and the run's first instruction lists each one by path with the line from its own frontmatter. Reading a file in its own working directory is the floor capability every harness has, and it is already the floor the Course format itself stands on: the whole contract between the app and a Constructor is files on disk.

The idea is Victor's, from firstmate, which drives nine harnesses and delivers a skill by writing its path into the prompt: "read and follow `$FM_ROOT/.agents/skills/captain-hold-lifecycle/SKILL.md`". It never asks a harness to load anything.

## Considered options

**Keep the plugin bundle for Claude and add a second path for everything else.** Rejected. Two delivery mechanisms mean two things to keep in step, and the one used least is the one that rots. It also makes the Constructor's instructions differ by harness, which is exactly the difference a registry exists to remove.

**Paste the skills into the prompt.** Rejected. It is four thousand words on every run including the repairs, it costs that on every attempt, and it takes away the run's own judgement about which of them it needs.

**Seed into `.claude/skills/` and `.agents/skills/`, as PLAN 3.7 does for a Course.** Rejected here, though it is right there. The Constructor is told to write the Course's own skills into those folders for the Tutor to read, so the app would be seeding into a folder it has asked an agent to write, and would then have to tidy away its own files without touching the agent's. `.whetstone/` is the app's namespace in a working folder already, and one rule covers it: everything under it is the app's and none of it ships.

**Rely on native discovery where a harness has it.** Rejected as the primary mechanism, and it is what is lost. A harness that discovers a skill folder decides for itself when a skill is relevant. Naming five paths in the prompt is that decision made ahead of time and less well. It is a real cost, and it buys a delivery that is identical everywhere, which for a file that carries the schema is the better trade.

## Consequences

The skills reach any harness that can read a file, which is all of them. Phase 6 is left with each CLI's own vocabulary, its tool names and its output format, rather than with the question of whether a Constructor knows the format at all.

The list in the prompt is read from the files, so a skill that is added, renamed or removed cannot fall out of step with the instruction that offers it. A test asserts that every skill present is named.

Nothing the app seeds ends up inside a built Course. `.whetstone/` is removed at the gate along with the Brief's tray, and a test puts a Course-written `.claude/skills/` beside it and checks that one survives.

The `plugins` field on an Agent profile stays, unused. A harness-native bundle is still the right home for a hook or a subagent, which are things a file in a folder cannot be.
