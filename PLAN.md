# Whetstone: implementation plan

**Written:** 2026-09-05
**Written by:** Claude Fable 5.1, from `HANDOFF.md` and one interview round with Victor.
**Status:** ready to build. Every open question in the handoff is closed, design included.
**Reads with:** `CONTEXT.md` for terms. `docs/adr/` for the reasons behind each structural decision.

---

## 1. Decisions closed today

| # | Decision | Answer | Decided by |
|---|---|---|---|
| 1 | Shell | Web shell: Electron, React, TypeScript | Victor chose web shell. Electron over Tauri is my call, see 3.1 |
| 2 | How any role reaches a model | One mechanism. Every role spawns a harness headlessly and is rendered by the app. `harnesses.json` registry, Claude CLI first, Codex and pi follow | Victor |
| 3 | What the student sees of it | Nothing. No terminal in study. Tool calls become plain status lines, failures become one sentence | Victor |
| 4 | Sandbox | Fully sealed. No files, no network, no database. One message channel | Victor |
| 5 | Depth scale | Fixed five points. Ladder per Course. Depth per Task, never per Module | Victor, with a condition, see 4.3 |
| 6 | Lesson content | Markdown plus a fixed block set, plus sealed Mini-apps where the blocks fall short | Victor |
| 7 | Who writes content | The Constructor writes everything in the Course folder. The Tutor writes nothing there | Victor |
| 8 | Credentials | The spawned CLI uses the login it already has. A key is needed only for the optional deterministic mode | Corrected, see 3.13 |
| 9 | Name | Whetstone | Assumed, not vetoed |
| 10 | Visual design | Direction 01 Press with a dark rail. Warm stone neutrals, amber accent, zero radius, rules not cards. See section 7 and `docs/design-reference.html` | Victor, over two rounds |

Two facts changed the handoff's assumptions.

- The Claude Agent SDK needs Node.js 18+ and spawns a bundled Claude Code binary as a child process. Nothing must be installed on the Mac, but the app must ship Node. Electron ships Node. Tauri does not.
- Anthropic's docs forbid third-party apps built on the Agent SDK from using a claude.ai login or subscription limits. The app needs an API key with API billing.

---

## 2. The product

A macOS app for one person. The user describes what they want to learn in a short conversation and attaches any material they have. A Constructor builds a Course once: Modules, Lessons, Resources, Mini-apps, and a Ladder of Tasks that verify themselves. After that the Course runs on its own. The home screen is a library of Courses, not a dashboard. The user reads, does Tasks, and gets an answer the moment they finish, offline and free. Nothing is locked, nothing is measured, and a Lesson simply carries a tick once it is done. Courses are plain files the user can share or delete.

### 2.1 The posture

The intelligence goes into building the Course, not into watching the student use it.

Older tutorial software was right about this. Duolingo checked a translation against a set of accepted answers. A coding course ran the test suite. Neither needed a model, and neither felt thin, because the work of making the exercise verifiable had already been done by whoever wrote it. A professor does not stand over you while you do revision questions.

So Whetstone's default is a Course that verifies itself. A model is something the user reaches for, not something the app runs at them.

| | |
|---|---|
| **Runs once, and matters most** | The Constructor. It researches, writes, and builds Mini-apps. It is where the money and the intelligence go |
| **Runs when invoked, and only then** | The Tutor, when the user opens the chat and asks. The Grader, when the user submits work a machine cannot check. A review, when the user presses the button |
| **Never runs** | Anything on opening a Lesson, changing page, or answering a Task |

The app itself stays small and slightly dumb, like a browser. What makes one Course richer than another is what the Constructor put in the folder, not a feature the app grew. Complexity is meant to emerge from the material.

### 2.2 What the app deliberately does not do

- It does not model the learner. There is no ability estimate, no hidden score, and no counters.
- It does not report on itself. Attempt totals, streaks, and spend appear nowhere; spend is checked at the provider.
- It does not adapt difficulty. The Course is what the Constructor wrote, and the user moves through it however they like.
- It does not schedule the user's time or decide what they should do next beyond the Constructor's own suggested order.
- It does not put a tutor between the user and the material. The chat is a door the user opens.

---

## 3. Architecture

### 3.1 Shell: Electron

Three reasons, in order of weight.

1. Every candidate Harness is a Node library. The Claude Agent SDK, `@openai/codex-sdk`, and `@mariozechner/pi-agent-core` all require Node 18+. Electron ships Node in the main process, so each adapter is a plain import. Tauri would need a bundled Node sidecar and an IPC bridge to it.
2. Agents write Electron plus React plus TypeScript reliably. Victor builds through agents.
3. Electron's `safeStorage` encrypts secrets with the macOS Keychain with no native module to compile.

The cost is app size, roughly 200 MB on disk. Accepted.

Tooling: `electron-vite` for build, Electron Forge for packaging, `vitest` for tests, `playwright` for the sandbox boundary test.

### 3.2 Process layout

```
┌──────────────────────── Electron main process (Node) ────────────────────────┐
│  CourseStore        reads and validates Course folders, watches for changes  │
│  ProgressDB         SQLite via better-sqlite3, every Attempt and marking     │
│  HarnessRegistry    ConstructorHarness adapters: claude-agent-sdk, codex, pi │
│  ProviderRegistry   ModelProvider adapters for Tutor and Grader: anthropic   │
│  Secrets            safeStorage-encrypted API keys, one per provider         │
│  Runs               active Constructor runs, event streams, spend meter      │
└──────────────────────────────────┬───────────────────────────────────────────┘
                                   │ typed IPC, one channel per feature
┌──────────────────────── Renderer (React, contextIsolation on) ───────────────┐
│  Sidebar  Dashboard  CoursePage  LessonReader  TaskView  RunView  Settings   │
│                                                                              │
│      ┌──────────── Sandbox iframe, sandbox="allow-scripts" ────────────┐    │
│      │  Mini-app: one self-contained index.html                         │    │
│      │  Talks to the host by postMessage only                           │    │
│      └──────────────────────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────────────────────────┘
```

The renderer has no Node access. It calls the main process through a preload bridge that exposes a typed API per feature: `courses`, `progress`, `runs`, `tutor`, `grader`, `settings`.

### 3.3 The Course folder

```
~/Library/Application Support/Whetstone/courses/<slug>/
  course.json          manifest
  toolkit/             the pinned widget and bridge toolkit the Mini-apps build on
  lessons/<id>.md      a Lesson: prose with block directives
  tests/<id>.json      a Test: a title and the ordered Task ids it holds
  tasks/<id>.json      one Task each
  apps/<id>/index.html one self-contained Mini-app each
  resources.json       curated links
```

A single folder is the whole Course. Copying it to another Mac shares the Course. Deleting it deletes the Course. The folder holds no progress and no Tutor conversation.

The user can change the courses root in Settings, for example to a folder inside iCloud Drive.

**`course.json`**

```json
{
  "formatVersion": 1,
  "id": "ml-gradients-2026-09",
  "title": "Gradients by hand",
  "subject": "Machine Learning",
  "summary": "One paragraph.",
  "objectives": [
    { "id": "obj-chain-rule", "title": "Apply the chain rule to a composed function" }
  ],
  "ladder": ["recall", "apply", "construct"],
  "modules": [
    { "id": "mod-1", "title": "Derivatives refresher",
      "pages": [
        { "type": "lesson", "id": "les-1" },
        { "type": "lesson", "id": "les-2" },
        { "type": "test",   "id": "tst-1" }
      ] }
  ],
  "suggestedOrder": ["les-1", "task-a", "les-2", "task-b"],
  "toolkitVersion": "1.0.0",
  "builtBy": { "harness": "claude", "model": "claude-opus-5", "at": "2026-09-05T18:00:00Z" }
}
```

`suggestedOrder` is how the Constructor expresses natural progression. The app shows it as "next up". It never locks anything.

**`lessons/<id>.md`**

```markdown
---
id: les-1
title: What a derivative measures
module: mod-1
objectives: [obj-chain-rule]
---

Prose in Markdown. Headings, lists, tables, images, code, and math.

:::callout{kind=insight}
A short highlighted idea.
:::

:::diagram{src=figures/slope.svg}
:::

:::try{id=try-a}
:::

:::app{id=app-slope-explorer height=420}
:::

:::resource{id=res-3blue1brown}
:::
```

The block set is fixed at: prose, callout, diagram, try, app, resource. A `try` block is a question the reader can answer for their own benefit; it never becomes an Attempt. Recorded Tasks live in a Test, not in a Lesson. The host renders every block in its own style. A Lesson never contains raw HTML or script. Directives use `remark-directive`, so the file stays readable in any Markdown editor.

**`tasks/<id>.json`**

```json
{
  "id": "task-a",
  "objective": "obj-chain-rule",
  "depth": "apply",
  "check": "deterministic",
  "prompt": "Differentiate f(x) = sin(3x^2).",
  "kind": "multiple-choice",
  "options": ["6x cos(3x^2)", "cos(3x^2)", "6x sin(3x^2)", "3x^2 cos(x)"],
  "answer": [0],
  "explanation": "Chain rule: outer derivative times inner derivative."
}
```

`depth` and `check` are independent. Any pair is legal. `kind` names the answer shape and is constrained by `check`:

| check | kind | Graded by | Offline |
|---|---|---|---|
| deterministic | `multiple-choice`, `accepted-answers`, `numeric` with tolerance, `ordering`, `assertions-pass`, `app-result`. See 3.16 | Host | Yes |
| model | `short-answer` with an `answerGuide` for the Grader | Grader, pass or fail with reason | No |
| rubric | `submission` with `rubric[]` and `accepts[]` file types | Grader, score per criterion | No |

`app-result` means a Mini-app posts the answer and the host compares it to `answer`. The Mini-app never grades itself.

A `rubric` Task carries its Rubric in full, and the app shows it before the user starts.

**`resources.json`**

```json
[
  { "id": "res-3blue1brown", "url": "https://...", "title": "...", "type": "video", "why": "One line." }
]
```

**`apps/<id>/index.html`** is one file with inline CSS and JS and no external references. The Constructor is told this in its prompt, and the validator rejects any `src=` or `href=` that points off the file.

### 3.4 The Progress DB

SQLite at `~/Library/Application Support/Whetstone/progress.db`, through Node's own `node:sqlite` rather than a native module (`docs/adr/0015`). Tables:

| Table | Columns | Note |
|---|---|---|
| `courses` | slug, path, addedAt | Registry of folders the app knows |
| `attempts` | id, courseSlug, taskId, objectiveId, depth, check, outcome, score, verdictJson, submittedAt | Every Attempt, always. `outcome` is `pass`, `fail`, or `voided` |
| `page_ticks` | courseSlug, pageId, pageType, tickedAt, byUser | The whole visible progress model. `byUser` distinguishes a manual tick from one earned by finishing |
| `defect_reports` | id, courseSlug, taskId, attemptId, ground, note, status, filedAt | `ground` is one of three. `status` is `open`, `upheld`, `rejected` |
| `missed` | courseSlug, taskId, lastFailedAt, clearedAt | Tasks the user got wrong and has not since got right. A list, not a schedule |
| `tutor_threads` | id, courseSlug, lessonId, messagesJson, updatedAt | Tutor chats live here, never in the folder |
| `runs` | id, kind, courseSlug, harness, model, usd, status, startedAt, endedAt | Spend ledger for every Constructor and Grader call |
| `settings` | key, value | Never a secret |

Progress is one bit per Page. A Lesson ticks when the user reaches the end of it, a Test ticks when they have attempted every Task in it, and the user can tick or untick either by hand from the course page, which is how they say they already know the material. That single control replaces both the completion marker and the old "I know this" button, because they were the same idea wearing two hats.

There is no score, no percentage, no weighted mean, and no per-Objective state. A running estimate of how well the user holds something is the tutor-and-pupil dynamic Victor is trying to avoid, and a counter of attempts or spend is the same instinct in smaller print.

Attempts are still recorded in full, with their Objective, Depth, and Check, because that record costs nothing now and cannot be reconstructed later. Nothing in the interface reads it except the missed list on a Course page. The handoff asked for Objectives to be recorded from the first version even though nothing consumes them yet, and this satisfies that without putting a grade book on screen.

Progress rows reference content by the stable ids in the files. A regeneration never rewrites an id. The validator refuses a folder whose ids collide with a previous version of the same Course.

### 3.5 When a model is needed, it is a spawned harness

Most of the time no model is needed at all. Section 2.1 sets the posture and section 3.16 lists what the app answers on its own. This section is about the minority of moments that do need one, and its claim is narrow: when a model is needed, there is one mechanism, and that mechanism is a spawned harness rather than a chat API.

**Nothing spawns on navigation.** Opening a Course, opening a Lesson, scrolling, and answering a deterministic Task start no process and cost nothing. A spawn happens only at these five moments, each of which the user caused deliberately.

| Trigger | Role |
|---|---|
| Open New course and send a message in the brief | Constructor, answering only |
| Press Build the course, add a Rung, or ask for a remediation block | Constructor, building |
| Open the chat and send a message, with or without attachments | Tutor |
| Submit a `project` Task, or answer a `model` Task | Grader |
| Press Review on a Mini-app | Grader |
| Ask for a project outside the app to be reviewed | Tutor |

A Tutor conversation starts cold when the user sends the first message and ends when they close it. There is no resident process, no warm pool, and no background listener.

**Why a harness rather than a chat API, for those moments.** A chat model answers from its own memory about a Course it cannot read. A harness opens the Lesson, reads the Task the user just failed, and looks at the Rubric before answering, and it can review a repository or judge a Mini-app payload. The cost of that is a slower first token, which is acceptable for something the user chose to invoke and unacceptable for something that runs automatically. That asymmetry is exactly why nothing runs automatically.

The evidence is Victor's own Strudel++, which spawns `claude`, `codex`, or `pi` beside a live editor. Its source states the contract directly: the write-to-file loop and the live snapshot are the app's real contract with a coding agent.

**Headless, not a terminal.** Strudel++ spawns its harness in a pseudo-terminal and shows the raw pane, which suits a user who lives in a terminal. Whetstone's user is a student, so it takes the same harnesses through their headless interface and renders typed events into its own UI. Nothing in the study surface is a terminal.

For the Claude CLI, verified from its documentation and its installed help:

```
claude -p "<prompt>"
  --output-format stream-json --verbose --include-partial-messages
  --model <model>
  --append-system-prompt-file <profile>/AGENTS-role.md
  --plugin-dir <bundle>
  --allowedTools "Read,Glob,Grep"        # per role
  --disallowedTools "Write,Edit,Bash"    # per role
  --permission-mode dontAsk
  --permission-prompts none              # nobody can answer a prompt in this UI
```

The stream is newline-delimited JSON. A `system` event with subtype `init` reports the model, the tools, and the loaded plugins, with `plugin_errors` when a bundle fails to load. `assistant` and `user` events carry the turn and its tool results. `stream_event` carries text deltas for live typing. The final `result` event carries `total_cost_usd`, which drives the spend meter with no estimation of our own.

`--permission-prompts none` is not optional. There is no terminal to answer a prompt in, so anything unresolved must be denied and reported rather than hang.

**A Harness is a registry entry, not code.** Adding one is a line of JSON.

```json
{
  "id": "claude",
  "label": "Claude Code",
  "command": "claude",
  "adapter": "claude",
  "models": ["claude-opus-5", "claude-fable-5-1", "claude-sonnet-5", "claude-haiku-4-5"]
}
```

`harnesses.json` ships with the app and is user-editable, resolved from the app path first and then from the user's data folder. The `adapter` names the small module that builds the argument list and normalises that CLI's event stream into the app's own event union. A command not on PATH fails the start with an error naming the harness, never a raw spawn error. PATH is the login shell's, widened with the usual install locations, so launching from Finder works.

**An Agent profile is what a role is.** A role has no code path of its own. It has a working directory, an instruction file, a plugin bundle, a tool allowance, and a budget.

```ts
interface AgentProfile {
  role: 'constructor' | 'tutor' | 'grader'
  cwd: string
  plugins: string[]
  allowedTools: string[]
  disallowedTools: string[]
  budgetUsd: number
  seed: { agentsMd: string; skills: Record<string, string> }
}
```

The host resolves a profile plus a Harness plus a model into one spawn. Everything else is identical across roles: the same event normalisation, the same spend meter, the same cancel.

| Role | Working directory | Tools | Typical model |
|---|---|---|---|
| Constructor | A staging folder | Read, Write, Edit, Glob, Grep, WebSearch, WebFetch | The strongest available |
| Tutor | The Course folder, with the conversation's attachment folder added | Read, Glob, Grep only | A mid-tier model |
| Grader | The Attempt folder, Course folder added read-only | Read, Glob, Grep, Write limited to the verdict | Mid-tier short, strongest for rubrics |

The Tutor's read-only status is enforced by the tool allowance, not by convention. That is stronger than the after-the-fact check the previous draft proposed, and the check stays as a second line for any harness whose flags are weaker.

### 3.6 The harness is invisible

The student never learns the word harness. Everything the agent does arrives as product, not as process.

| Stream event | What the student sees |
|---|---|
| `stream_event` text delta | Text appearing in the Tutor's answer, or in a Verdict |
| `assistant` with a tool call | At most a quiet status line: "Reading lesson 2", "Checking your rubric" |
| `user` with a tool result | Nothing |
| `system` init, plugin errors | Nothing, unless a bundle failed, which is an app error |
| `result` | The answer settles, and the spend meter updates |

Three rules follow.

1. **No terminal anywhere in study.** Not in the Tutor pane, not in a Task, not in a Verdict.
2. **Tool calls become verbs in the app's own vocabulary.** A map from tool name to phrase lives in the host, and an unmapped tool shows nothing rather than its raw name.
3. **A failure is an app failure.** If the harness is missing, unauthenticated, or over budget, the student sees one plain sentence and a retry, never a stack trace or an exit code.

The Constructor's run is the single exception, and only partly. Building a Course takes minutes and costs money, so the Run view shows an activity feed: what the Constructor is researching, which files have appeared, and the spend against its cap. That feed is written from the same typed events, in the app's own words. A disclosure labelled "technical log" holds the raw stream for debugging, closed by default, and it never appears in a Lesson.

### 3.7 The working folder is the interface

Three files make a folder legible to any agent, and they are what the app seeds.

**`AGENTS.md`** describes the folder, the contract, and what the agent may do. It is seeded once and never overwritten, because an entry that already exists belongs to the user.

**Skills** are seeded into both `.claude/skills/` and `.agents/skills/`, the same set in two locations, because different harnesses look in different places. A skill is a folder holding one `SKILL.md`.

**Attachments.** Files, images, and pasted screenshots the user gives the Tutor are written to `.whetstone/chats/<id>/` outside the Course content, and that folder is added to the Tutor's working set as read-only. A photo of handwritten working or a drawn diagram is therefore an ordinary input the Tutor opens with its own tools, needing no separate vision path. Attachments are deleted with the conversation and are never written into the Course folder, so a shared Course carries none of them.

**`.whetstone-live.json`** is the state snapshot, and it is how an agent sees what the user is doing without an API. Strudel++ rewrites its equivalent every 500 milliseconds because a harness sits open beside a live editor. Whetstone writes it once, immediately before a spawn, because nothing is listening the rest of the time. No background writer, no polling.

```json
{
  "updated": "2026-09-05T18:41:02.113Z",
  "course": "gradients-by-hand",
  "openLesson": "les-2",
  "openTask": "task-b",
  "lastVerdict": { "taskId": "task-b", "outcome": "fail", "at": "..." },
  "standing": { "obj-chain-rule": "solid", "obj-backprop": "shaky" },
  "knownAlready": ["obj-derivatives"],
  "miniApp": { "id": "app-slope-explorer", "lastResult": { "x": 3.2 } },
  "online": true
}
```

The instruction file tells the agent to read it first. This is what lets the Tutor answer "why was I wrong" without the app having to explain the situation in a prompt.

For the Claude Agent SDK, if it is ever added as a harness entry alongside the CLIs, the equivalent of a plugin bundle is the `plugins` option, which takes local directory paths of the form `{ type: "local", path }`. A plugin directory holds `skills/`, `agents/`, `hooks/`, and `.mcp.json`, and the manifest is optional. That is verified from the SDK docs and matches the bundle layout described below, so the same directories serve both spawn styles.

### 3.8 The Constructor writes an agent definition for each Course

This is the part that makes the Tutor good, and it is Victor's idea.

The Constructor does not only write Lessons and Tasks. It writes the `AGENTS.md` that the Tutor will read when it operates inside that Course, plus any Course-specific skills. It knows the material, so it can tell the Tutor things the app never could:

- What this Course teaches, in what order, and which Objectives are load-bearing.
- Which misconceptions are common at each Objective, and how to correct them.
- Which Lesson to point at for each Objective.
- The notation and conventions this Course uses, so the Tutor does not answer in a different notation than the material.
- Where the Rubrics are and how strictly to read them.

So the Tutor is not a general model with a chat window. It is an agent briefed by the author of the material, working inside the material. A Course carries its own teacher.

This lands inside the Course folder, so it travels with a shared Course and it is covered by the rule that only the Constructor writes there.

```
courses/<slug>/
  course.json
  AGENTS.md            written by the Constructor, read by the Tutor and Grader
  .claude/skills/      Course-specific skills, same set in both locations
  .agents/skills/
  lessons/<id>.md
  tasks/<id>.json
  apps/<id>/index.html
  resources.json
```

### 3.9 Plugin bundles, and why the Constructor knows about them

The app ships plugin bundles in its resources. The user never sees or manages them; they are implementation, not a feature.

| Bundle | Loaded for | Holds |
|---|---|---|
| `authoring` | Constructor | The format specification, skills for writing a Lesson, a Task, a Rubric, and a Mini-app, and the capability catalogue below |
| `tutoring` | Tutor | Skills for explaining a failed Attempt, walking a Lesson, and reviewing an outside project |
| `grading` | Grader | Skills for scoring a Rubric, reading a Submission, and judging a Mini-app review |

The capability catalogue is the piece that changes what a Course can be. The Constructor is told, in the authoring bundle, exactly what an agent at study time will be able to handle. It then authors Tasks that rely on those capabilities instead of writing down to a text box.

Examples of what the catalogue declares an agent can do:

- Read a screenshot or a structured state dump emitted by a Mini-app, and judge it.
- Read a repository, a document, a CSV, or a notebook the user produced outside the app.
- Run a command over the user's Submission and read the output.
- Hold a conversation about a partially wrong answer rather than returning a verdict and stopping.

Because the Constructor knows this, it can write a Task like "mark the inflection point on this curve" and ship a Mini-app that emits the click coordinates and a screenshot, confident that something at the other end can judge it.

### 3.10 The sandbox holds, and the review path goes through the host

A Mini-app still runs fully sealed. It talks to the host and to nothing else. The review path does not weaken that, because the Mini-app never reaches the agent; the host does.

The flow for an interactive Task the user asks to have reviewed:

1. The Mini-app posts `review { screenshot?, state }` to the host. The screenshot is a `data:` URL the Mini-app rendered from its own canvas.
2. The host writes it into an Attempt folder outside the Course, together with the Task and its Rubric.
3. The host spawns the Grader profile with that folder as the working directory.
4. The Grader reads the payload, judges it, and writes `verdict.json`.
5. The host validates that file against the Verdict schema and renders it in the Task view.

The Mini-app gets no filesystem, no network, no host state, and no agent. It emits a payload and the host decides what happens to it. Test 7 is unchanged, and one more case joins it: a Mini-app cannot cause a spawn on its own; a review only starts when the user presses the button.

### 3.11 Grading is validated at the source

The Grader does not return prose the app parses. The Claude CLI validates structured output itself: `--output-format json` with `--json-schema <schema>` returns the object in a `structured_output` field, and an invalid schema is rejected before the run starts. The app passes the Verdict schema and reads that field. A harness with no equivalent flag writes `verdict.json` into the Attempt folder instead, and the app validates it. Both paths end in the same validated object, and a partial or malformed result is recorded as an error, never as a fail.

This dissolves a problem the earlier design had. A single Messages API call could not combine native citations with a validated JSON schema, so evidence and structure were in tension, and decision record 0007 chose between them. An agent that reads the Submission with its own tools has no such conflict. It quotes what it read, and the app checks each quote appears verbatim in the Submission where the file type allows it.

### 3.12 Switching harness and model

One registry, one shape, three roles.

**Settings shows a row per role.** Each row is a harness select, a model select, and a budget. The model list comes from the harness, so switching harness resets the model to that harness's default rather than leaving an impossible pair. A harness whose command is not installed still appears, greyed, naming what to install, because hiding it leaves the user guessing.

| Role | Harness | Model | Budget |
|---|---|---|---|
| Constructor | Claude Code | claude-opus-5 | $2.00 per run |
| Tutor | Claude Code | claude-sonnet-5 | $0.25 per turn |
| Grader | pi | claude-haiku-4-5 | $0.10 short, $1.00 rubric |

**A build confirms at the point of spending.** A Course build costs real money and runs for minutes, so the new-course form shows the harness, model, and cap on one line with an edit control, and the same line appears before an add-rung or remediation run. Changing it there affects one run and leaves the default alone. The form pre-fills from the most recent run against that Course, which needs no new setting because the `runs` table already records both.

**The Tutor switches live from its pane header,** the way Strudel++ switches harness in its dock. Restarting the Tutor with a different harness is cheap, because its state lives in the folder and the snapshot rather than in the process.

**Switching changes nothing that already exists.** Each Course records what built it. Asking a different harness to add a Rung to a Course another harness wrote is fine, because the contract between them is files on disk, not a shared runtime.

### 3.13 Credentials

Spawning the user's own installed CLI changes this question. The harness authenticates the way it already does on that machine, so for the common path the app stores no key and holds no secret. The earlier finding, that an application built on the Agent SDK may not offer a claude.ai login, governs embedding the SDK inside a product. Whetstone launches a CLI the user installed and logged into themselves, which is what Strudel++ does.

One real fork sits underneath this, and it is a trade, not a detail.

| | Default run | `--bare` run |
|---|---|---|
| Credentials | The user's existing login | Requires `ANTHROPIC_API_KEY`; no OAuth, no keychain |
| Startup | Slower | Faster |
| What loads | The user's own hooks, memory, plugins, and MCP servers from the working directory and `~/.claude` | Only what the app passes |
| Result | Reflects the user's machine | Identical on every machine |

Whetstone defaults to the first, because it needs no key and no setup. The cost is a real leak: Victor's global instruction file would reach the Tutor and colour its voice, which matters when the Course is supposed to speak in its own. Two mitigations, and one honest residual.

1. The role instruction file is passed with `--append-system-prompt-file` and states plainly that the Course's own guidance outranks anything from the environment.
2. Settings offers a deterministic mode that adds `--bare` and uses a key from the macOS Keychain, for anyone who wants the Tutor's voice to be exactly the Course's.
3. The residual is that in the default mode a user's global memory still loads. That is acceptable for one user and should be revisited before the app is shared.

Any key a harness does need goes into the Keychain through `safeStorage`, reaches the child process in its environment only, and never touches a file, the database, or a log.

### 3.14 Keeping the Tutor honest about the Course folder

The Tutor runs inside the Course folder and reads every file there, which is the point. It must change none of them, or shared copies of a Course would diverge from what the Constructor wrote.

Three layers, strongest first.

1. **The tool allowance.** The Tutor is spawned with `--allowedTools "Read,Glob,Grep"` and `--disallowedTools "Write,Edit,Bash"`. It has no instrument that writes.
2. **The permission mode.** `--permission-mode dontAsk` with `--permission-prompts none` denies anything the allowance did not already cover, and reports the denial in the result rather than waiting for an answer nobody can give.
3. **A content hash.** The host hashes the Course content before the spawn and after the process exits. Any difference is reverted and reported. This catches a harness whose flags are weaker than the Claude CLI's, which is the case phase 6 must verify for Codex and pi.

### 3.15 Answering, grading, and coming back to things

**Deterministic, which is most of it.** The host compares and answers instantly, offline, at no cost, at any Depth. This is the path the Constructor is pushed toward, and section 3.16 lists what it can express.

**Model.** Only for a Task whose answer genuinely has many valid forms. The Grader receives the prompt, the `answerGuide`, and the answer, and returns a pass or fail with a reason. Harsh by instruction.

**Rubric.** Only at `project` depth, and only when the user submits. The Grader returns a score, a line of evidence, and a line of what was missing per criterion, plus an overall outcome. Every field is required, and a partial object is recorded as an error, never as a fail.

**Defect report.** Filed from any Verdict on exactly three grounds. The app says "report a broken task", never "appeal". Upholding one voids the Attempt and queues a `remediate` run. It never changes a score.

**Review session.** A handful of Tasks drawn at random from Objectives the user has already touched. Deterministic only, so it runs offline and free. That is the whole feature: no weighting by ability, no scheduling.

**Missed Tasks.** A plain list of what the user got wrong and has not since got right, reachable from the Course page and nowhere else. Getting one right removes it. There are no intervals, no due dates, and no count on the home screen, because a spaced-repetition scheduler is the machinery that turns study into homework.

**Ticking a Lesson.** The tickbox on the course page is the only progress control. It fills itself when the user reaches the end of a Lesson, and the user can fill or clear it by hand at any time. Ticking a Lesson they already know keeps the Course honest without deleting anything, which is what the handoff asked for.

**Delete Course.** One confirmation. One transaction deletes every row for the slug, then the folder moves to the Trash with `shell.trashItem`. If the trash step fails the rows are already gone, so the app shows the folder path. The Trash is recoverable, so this order is safe.

### 3.16 What a self-verifying Task can be

The strength of the offline path is the point, not a budget compromise. `check: deterministic` covers far more than multiple choice.

| kind | The user does | The host checks |
|---|---|---|
| `multiple-choice` | Picks one or more options | Set equality |
| `accepted-answers` | Types a short answer | Matches any entry in an accepted set, after normalising case, spacing, and punctuation. This is the Duolingo check |
| `numeric` | Enters a number | Within a tolerance the Task declares |
| `ordering` | Arranges steps | Sequence equality |
| `assertions-pass` | Writes code or data inside a Mini-app | The Mini-app runs the Constructor's assertions and reports which passed. This is the coding-course check |
| `app-result` | Interacts with a Mini-app: drags, marks a point, builds a circuit | The Mini-app emits a result and the host compares it to the expected value |

`assertions-pass` and `app-result` are where difficulty and interest live. A Task at `transfer` depth can be fully verifiable, cost nothing, and work on a plane. The Mini-app never decides pass or fail on its own; it reports, and the host judges.

### 3.17 The toolkit

A Mini-app never writes its own buttons, colours, or message plumbing. The host injects one toolkit into every sandboxed frame, and the Constructor is told to build from it. This is what keeps a joinery Course and a machine learning Course feeling like the same product, and it is why a Course can be interactive without each one inventing a look.

**What it contains.**

| Export | What it gives the Mini-app |
|---|---|
| `Kit.theme` | The app’s palette, type, spacing, and Depth tints as CSS variables, following the theme automatically |
| `Kit.slider` | A dragged parameter with a live readout |
| `Kit.plot` | Axes, curves, points, and a draggable marker |
| `Kit.pieces` | Draggable pieces and ordered slots: ordering, matching, labelling, expression building |
| `Kit.hotspot` | Click or drag to mark a place on an image or plot, answered as a coordinate |
| `Kit.editor` | A small code editor with the Constructor's assertions beside it. This is what `assertions-pass` runs on |
| `Kit.steps` | A walkthrough advanced one beat at a time, for a derivation or an algorithm trace |
| `Kit.sim` | A stepped model with a play control. The Constructor supplies the rule, the toolkit supplies the loop and the transport |
| `Kit.board` | A chessboard: squares, pieces, dragging, legal targets, and an opponent. Added in 1.1.0 |
| `Kit.bridge` | `ready()`, `answer(value)`, `review(png, state)`, `resize()`, `action(label, produce)`. The only way out of the sandbox |
| `Kit.ask` | Ask the host a question a sealed frame cannot answer itself. Added in 1.1.0, see section 3.18 |

`Kit.bridge` replaces raw `postMessage` in every Mini-app, so the protocol in section 3.10 is a library call rather than something each activity reimplements and gets subtly wrong. A Mini-app reports; it never decides whether an answer was right.

Built, it carries a fifth call: `Kit.bridge.action(label, produce)` draws the answer button and sends what the button produced. Nothing leaves the frame without a press, which is what a Mini-app needed anyway and what test 14 asks for. `docs/toolkit.md` is the reference the Constructor is given.

**How it reaches a sealed frame.** The sandbox forbids external resources, so nothing can be fetched. The host reads the toolkit and inlines its CSS and JS into the `srcdoc` ahead of the Mini-app's own markup. The Mini-app calls `Kit.*` and the host guarantees it exists.

**It is pinned per Course.** A copy lives at `toolkit/` inside the Course folder and `course.json` records `toolkitVersion`. The host injects the copy from the folder, never the app's current one. So a shared Course renders the same on another machine, and installing a newer Whetstone does not silently change how a built Course behaves. The app ships the current toolkit and writes it into a Course only at build time.

**The set above is a starting set, not the finished toolkit.** Obvious gaps to fill as Courses ask for them: a multiple-choice and an accepted-answers control for use inside a Mini-app, numeric entry with units, a sortable list, a table, an audio and video player, and a drawing surface. Note that plain multiple choice is rendered by the host today, because a Task of that kind needs no Mini-app at all; the toolkit needs its own only when a question sits inside an activity. Filling a gap is a change to the toolkit and its version, never a one-off inside a Course.

**When it is missing something.** A Mini-app may still write its own widget. That is a signal the toolkit has a gap to fill, not a licence for one Course to look unlike the rest, and the Constructor is told to say so in its run so the gap surfaces.

### 3.18 Services

The toolkit is code the frame runs. A Service is a question the host answers.

A Mini-app is one file with no network and no second script, which is right for a widget and wrong for a body of rules. Chess is the case that showed it: legal moves, check and mate are a few hundred lines that every chess Course would otherwise carry, each copy wrong in its own way, and none of them tested by anybody. `Kit.ask(name, request)` sends the question over the channel that already carries an answer, and the main process replies.

**A Course declares what it may ask for.** `course.json` carries a `services` list beside `toolkitVersion`, and the host answers nothing that is not in it. The parser refuses a Course naming a Service this build does not have, so a Course fails at read time rather than at the moment a learner presses something.

**A Course names a capability and a version, never a path.** This was the question that started the section: whether a Course could point at a program already on the machine. It cannot, and this is the reason. A Course is content an agent wrote and a person may have been sent. A path in it is a way into the rest of the machine, and no amount of checking a path makes that a good idea.

**A Service is offline, pure, and small.** It reads a request and returns a value, and it holds no state between calls: a chess position crosses as a FEN, so nothing is remembered on either side. It runs in the main process, which means a slow Service is a frozen window, so the chess opponent's search depth is capped.

The first Service is chess. The board widget uses it, so every chess Course behaves the same way, and a stronger engine can be put behind the same boundary later without touching a single Course. That is the point of naming a capability rather than a program. Decision record 0018.

## 4. Rules the Constructor prompt must state

The Constructor prompt is a file in the repo, versioned, and read by humans too. It says:

1. **Make it verifiable.** A Task that a machine can check is better than one a model must read, at every Depth. Reach for `check: model` or `rubric` only when the answer genuinely has many valid forms that no accepted-answer set or test can express, and say why in the Task. A Course that needs no model at all is a good Course, not a cheap one.
2. Prefer `assertions-pass` and `app-result` over prose questions wherever the idea can be exercised rather than described. Writing the Mini-app and its assertions is the Constructor's job and is where its effort should go.
3. Depth and Check are independent. Show a table of legal pairs and require at least one `deterministic` Task at every Depth the Course uses.
4. Pick the Ladder from the scope of the Course. A short Course may use two Rungs. Say why the chosen Rungs fit.
5. Beginner material is written even when the brief says the user knows it.
6. Order content so that it builds. Express the order in `suggestedOrder`. Never assume a lock.
7. Every Task names one Objective. Every Objective has Tasks at every Rung the Course uses.
8. Depth belongs to a Task, not to a Module. A late Module may hold `recall` Tasks. This is the condition Victor attached to the fixed scale.
9. A Mini-app is one file with everything inline and no external references. Build it from the toolkit in section 3.17, and read `docs/toolkit.md`: use `Kit.bridge` rather than raw `postMessage`, a toolkit widget rather than a hand-rolled control, and a token rather than a colour. If the toolkit cannot express the activity, write it anyway and say in the run which widget was missing. A Course that calls `Kit.ask` must also declare that Service in `course.json`, and it never names a path to anything.
9b. A diagram is a file, so the host cannot hand it the app's tokens. Write it as an SVG carrying both schemes in its own `<style>`, under `@media (prefers-color-scheme: dark)`, or it disappears in one of them.
10. Rubrics are written with the Task and are strict. A criterion the user can satisfy by restating the prompt is a bad criterion.
11. Resources are links with one line of why. Never copy content in.
12. Ids are stable, lowercase, and prefixed by type. An `add-rung` or `remediate` run reads existing ids and never reuses or rewrites one.
13. Split a Module into Pages. A **Lesson** is read, watched, and played with, and may carry `try` questions that are not recorded. A **Test** holds the recorded Tasks. Do not scatter recorded Tasks through prose.
14. A Module usually runs several Lessons then one Test, but the shape is yours. A Module may be a single Lesson with no Test, and a Course of pure drill may be Tests alone.
15. A Test states its Depths up front, because that is what tells the user what kind of thinking it will ask for.
16. Write the Course's `AGENTS.md` and its Course-specific skills, as section 3.8 describes, so the Tutor is briefed by whoever wrote the material rather than guessing at it.
17. Count how many Tasks in the finished Course need a model. If it is more than roughly one in five, go back and make more of them verifiable.

---

## 5. Verification

Tests written before the implementation of the phase they belong to. The fixture Course is hand-written and lives in `fixtures/courses/sample/`.

| # | Test | Encodes | Phase |
|---|---|---|---|
| 1 | Fixture Course parses. A malformed copy fails with the file and field named | Format contract | 0 |
| 2 | `depth: transfer, check: deterministic` is valid and grades with the network off | Depth and Check independence | 0 |
| 3 | A `recall` Task inside the last Module is valid | Victor's condition on the fixed scale | 0 |
| 3b | A `try` block in a Lesson records no Attempt. The same question inside a Test records one | The page split is real | 1 |
| 4 | Grader returns a complete Verdict from a recorded event stream. A partial one is recorded as an error, never a fail | Grader contract | 4 |
| 5 | Delete Course leaves no row and no folder. Delete with a trash failure leaves rows gone and reports the path | Deletion | 3 |
| 6 | Every deterministic kind, `assertions-pass` and `app-result` included, answers with the network disabled | Offline path | 1 |
| 7 | A Mini-app that tries `fetch`, `localStorage`, `window.parent.document`, an external `<script>`, and `window.open` gets nothing. Only `postMessage` reaches the host | Sandbox boundary | 2 |
| 8 | A Harness that writes an invalid folder never touches `courses/`. A valid staging folder moves in atomically | Harness contract | 3 |
| 9 | A Lesson ticks at its end and a Test ticks when every Task is attempted. Manual tick and untick persist. No other progress value is exposed by the UI layer | Progress is one bit per Page | 1 |
| 10 | A recorded harness stream renders with no raw tool name, no ANSI, and no exit code reaching the UI | The harness is invisible | 3 |
| 11 | A validator run rejects a Mini-app with any external `src` or `href` | Constructor output | 3 |
| 12 | A Tutor spawn cannot modify the Course folder. With writes forced, the hash check reverts and reports | Shareability | 4 |
| 13 | The Constructor writes a Course-level `AGENTS.md`, and a Tutor spawn reads it before answering | A Course carries its teacher | 4 |
| 14 | A Mini-app cannot cause a spawn. A review starts only from the user's button | Sandbox and spend | 4 |
| 15 | Opening a Course, a Lesson, and a deterministic Task spawns no process and spends nothing. Opening the Tutor panel spawns nothing until a message is sent | Nothing runs on navigation | 4 |
| 16 | Material attached in the brief reaches the staging folder and is cited in `resources.json` | The brief is real input | 3 |
| 17 | A Mini-app built only from the toolkit renders correctly in light and dark with no colour of its own | One product, many Courses | 2 |
| 18 | The host injects the Course's pinned toolkit, not the app's. A Course built against an older version keeps behaving the same | Pinning | 2 |
| 19 | A screenshot pasted into the Tutor lands in the chat folder, is readable by the spawn, and never enters the Course folder | Attachments stay out of content | 4 |

Tests 2 and 7 come first. Test 7 runs in Playwright against the real sandbox, because a unit test cannot prove an iframe boundary. Tests 4, 10, 12, and 13 run against recorded harness streams rather than live spawns, so they stay fast and deterministic, with one real spawn as a smoke test per phase.

---

## 6. Phases

Each phase ends with a runnable app. Nothing in a later phase is needed to use an earlier one.

**Phase 0. Skeleton and format. Done.**
Electron, Vite, React, TypeScript. The format schema in `zod`, the parser and validator, the deterministic answering path, and the fixture Course. Tests 1, 2, 3, 3b and 6 pass, 29 assertions in all. A window that lists Courses and reports a broken folder rather than hiding it.

Two things were left for later on purpose. Tailwind and shadcn/ui are not installed, because the direction is hairlines and zero radius and plain CSS with the tokens is currently shorter than configuring a framework to suppress its defaults; revisit when the component count grows. The three fonts are not yet self-hosted, so the app falls back to system faces and does not yet match the reference exactly. SQLite arrives with phase 1, which is the first phase that has anything to store.

**Phase 1. Study offline. Done.**
The two-level rail with its collapse states, home as a course library, the Course page with its Ladder and tickboxes, both Page types, the Lesson reader with the block set, and the deterministic answering path wired end to end. Tests 6 and 9 pass, with 3b sharpened: a Try and the Test Task that asks the identical question now sit side by side in the fixture, and only one of them records. 49 assertions in all.

Three things settled during the build.

- **A `try` block carries its question as JSON in the block body.** The block set had no way to say what a Try asks, so a Lesson could name one and never pose it. A Try reuses the six deterministic kinds, so the Lesson reader and the Test reader run the same answering control and a Try can never be a weaker kind of question than a Task, only an unrecorded one.
- **Answering happens in the main process.** `courses:open` sends the renderer a Course with every answer removed, and the renderer posts what the user did and receives an outcome. So a Task's answer is never in the window that displays it, and an Attempt cannot be skipped by the page that asked. A test asserts the accepted phrasings appear nowhere in what crosses the bridge.
- **Lesson prose is parsed to data, never to HTML.** Lesson text is written by an agent and rendered in the host window, which holds the only bridge to the main process, so `<script>` in a Lesson comes out as characters and a link the app would not open stays as text. This costs tables and math, which arrive with KaTeX later.

Deferred to their own phases, and stubbed rather than hidden: an `app` block and the `app-result` and `assertions-pass` kinds say the activity arrives with phase 2, and a `model` or `rubric` Task says it is judged by a model. A Course that uses them is not a broken Course.

**Phase 2. Mini-apps. Done.**
The toolkit and its widgets, the sandbox host, `Kit.bridge`, the `app` block, and the `app-result` and `assertions-pass` Task kinds. Three Mini-apps in the fixture, all built only from the toolkit: a demonstration inside a Lesson, an `app-result` Task, and an `assertions-pass` Task with a code editor. Tests 7, 17 and 18 pass, 73 assertions in all.

Three things settled during the build.

- **A frame written with `srcdoc` inherits the host page's policy.** The host window denies inline scripts, because it is the window holding the preload bridge, so a Mini-app delivered that way could never run: no error, no script, an empty rectangle. The frame is served over `whetstone-app://` instead, with a policy of its own in a real header. Decision record 0017.
- **The sealed frame allows `eval`.** `Kit.editor` exists to run the learner's code, and nothing runs code without it. The policy already allows the Mini-app's own inline script, so what this adds is that the learner's code runs too, in a frame with no network, no storage, no files and no reach into the host. Decision record 0016.
- **`Kit.bridge` gained a fifth call, `action`.** It draws the answer button and sends what the button produced. Every message that records something now starts with a press, which is what test 14 asks for later, and it is one implementation rather than one per activity.

Test 7 runs the real app against `fixtures/courses-sealed/`, a Course that exists to be attacked. Its Mini-app builds its external reference at runtime, so the validator that refuses one does not catch it: the validator is one layer, and test 7 is the layer underneath. The frame reached nothing. Its origin was `null`, storage, the host document, the window above it and cookies all threw, `fetch` was rejected, the external script was blocked, and the only thing that crossed was what the Mini-app chose to post.

Deferred and stubbed rather than hidden: `Kit.bridge.review` exists in toolkit 1.0.0 and the host ignores it until the Grader arrives in phase 4.

**Phase 2b. Services, and a board built on one. Done.**
`Kit.ask` and the Service channel, the chess Service, `Kit.board`, toolkit 1.1.0, and a second fixture Course that teaches the knight fork. 116 assertions in all.

Four things settled during the build.

- **A Course declares its Services, and the host answers nothing else.** Same shape as `toolkitVersion`: a capability and a version, checked by the parser at read time. A Course never names a path. Decision record 0018.
- **Pinning stopped being hypothetical.** The gradients Course stays on toolkit 1.0.0 and the chess Course is built on 1.1.0. The older Course's frame has no `Kit.board` and no `Kit.ask` in it, which is what test 18 now checks against two real Courses rather than a temporary copy.
- **A path from a Course is checked against the disk.** `resolve` and `relative` are string arithmetic, so a symlink inside a Course folder passed the traversal check and was then followed. `realpathSync` closes it, and a test puts a symlink in a Course and watches it be refused.
- **The opponent is the app's, and it is deliberately weak.** It searches three moves ahead. What teaches a fork is the position the Constructor chose, not the rating of the thing replying, and the Service boundary means a stronger engine is a swap rather than a rewrite.

Test 7 grew a second half. One Course in `fixtures/courses-sealed/` declares chess and reports what came back, and the hostile one asks for chess without declaring it and reports the refusal. Both run in the real app, in one pass.

**Phase 3. Constructor.**
The harness registry and spawn layer, the Claude CLI adapter, event normalisation, the authoring plugin bundle, staging and validation, the brief conversation with its attachment tray, the build screen as an activity feed, Delete Course. Tests 5, 8, 10, 11.

**Phase 4. Tutor and Grader.**
The Tutor and Grader profiles on the same spawn layer, the Tutor's attachment tray for files, images, and pasted screenshots, the tutoring and grading bundles, the Course-level `AGENTS.md` the Constructor writes, the live snapshot file, `model` and `rubric` checks, Submissions, the Verdict view, defect reports, the Tutor pane, and the Mini-app review path. Tests 4, 12, 13, 14. The "needs a model" marker on Tasks.

**Phase 5. Non-linear study.**
Review sessions. The missed list. `add-rung` and `remediate` runs. The remediation offer after repeated fails on one Objective.

**Phase 6. More harnesses.**
Codex and pi adapters. Settings shows every harness and the models it declares. Verify each CLI's headless output format, tool restriction flags, structured-output support, and cost reporting from its own documentation at this point, not before. Where a CLI cannot restrict tools, the content hash from 3.14 is the only guard, and that must be stated in its registry entry.

**Phase 7. Finish.**
Dark mode. Keyboard navigation in the reader. Spend dashboard from the `runs` table. Export a Course as a zip. App icon and signed build.

---

## 7. Visual design

**Settled: direction 01 Press, with a dark rail.**

Victor reviewed two rounds. Round 1 set the palette and was rejected on form: *"colour scheme of this is best but its too reminiscent of slop web apps - i want something sharper with more cutting edge design rather than this bubbly inoffensive big tech slop."* Round 2 offered three sharper form languages. He picked Press and asked for one change: *"press but with a darker shade for the sidebar - like grey or something."*

The visual contract is `docs/design-reference.html`. It renders the Dashboard, a Lesson, and a Constructor run in both themes, and every implementation screen follows it.

### 7.1 Tokens

| Token | Light | Dark | Use |
|---|---|---|---|
| `paper` | `#f5f4f1` | `#100f0d` | Page ground |
| `surface` | `#fffefb` | `#171613` | Reader and panels |
| `rail` | `#23211c` | `#1a1815` | Sidebar, and the run view's terminal |
| `rail-ink` | `#e9e6de` | `#e9e6de` | Sidebar text |
| `rail-muted` | `#8d887b` | `#8d887b` | Sidebar labels and inactive items |
| `ink` | `#16150f` | `#eae7df` | Prose |
| `muted` | `#6b675c` | `#928d80` | Labels and secondary text |
| `line` | `#d9d5cb` | `#2c2a25` | Hairline rules |
| `frame` | `#16150f` | `#3a372f` | Window edge and section heads |
| `amber` | `#c2410c` | `#c2410c` | One action per screen, selection, progress |

The rail is the only dark surface in the light theme. It separates navigation from content without a border, gives the amber selection marker a ground it reads against, and makes the reader column look like paper by contrast.

### 7.2 Depth tints

Identical in both themes, because Depth is a fixed scale and must look the same across every Course.

| Depth | Hex | Text on it |
|---|---|---|
| recall | `#fde9c8` | ink |
| apply | `#f7c873` | ink |
| construct | `#e89b25` | ink |
| transfer | `#c2410c` | paper |
| project | `#7c2d12` | paper |

The Check marker is separate and derives from `check` alone. A bolt means deterministic, so instant and offline. A sparkle means a model grades it and it costs money.

### 7.3 Type

| Role | Face | Setting |
|---|---|---|
| Display: screen titles, Course names, stat numbers | Archivo variable | 700, width 85, tracking -3%, uppercase |
| Interface and prose | Inter Tight | 400 to 600. Lesson prose at 13.5 to 15px, 60ch measure, 1.62 line height |
| Every label, chip, timestamp, path, and number under a heading | IBM Plex Mono | 10 to 11px, uppercase, tracking +13% |

All three are self-hosted, because the offline requirement means the app must render correctly with no network. Math through KaTeX. Code inside a Lesson uses IBM Plex Mono at prose size.

### 7.4 Rules that apply to every new screen

1. Radius is zero everywhere, including buttons, inputs, and the sandbox frame.
2. Separate with a rule, not a box. A hairline under a heading, a 1px frame at the window edge. Nothing floats and there are no drop shadows.
3. Amber is a signal, not a colour. One primary action per screen, plus selection and progress fill. Never a background wash.
4. Metadata is monospace and small. Content is Inter Tight.
5. The rail is the only dark surface. The run view's terminal reuses the rail colour, because it is the same family of chrome.
6. Motion is 150ms or nothing. Fades and progress fills only.

### 7.5 Layout and screens

Two or three columns, and both side columns collapse. A 186px rail, a reader, and a 210px Tutor column that is closed until the user opens it. Collapsed panels become a 34px stub in the rail colour so the window keeps its shape. The collapse state is remembered per Course. Prose sets at 60ch, or 66ch with both panels closed.

The rail holds one level at a time, and there is no breadcrumb.

| Screen | Rail | Reader |
|---|---|---|
| **Home** | Course titles as a flat list, then New course and Settings | The course library. One row per Course with its Subject, module count, and a pages-done count |
| **Course** | Back to all courses, then this Course's Modules and their Pages, each marked Lesson or Test. No tickboxes here | Summary, the Ladder drawn as the Rungs this Course uses, then every Module with its Pages, each with a tickbox, its type, and either a reading time or its task count and Depths |
| **Lesson** | The same Course contents, collapsible | Prose, diagrams, Mini-apps, and `try` questions that are answered in place and never recorded |
| **Test** | The same Course contents, collapsible | The Test's Tasks, numbered, each recorded as an Attempt. A wrong answer offers another go, the Tutor, or a defect report |
| **New course, brief** | Back, then Brief and Build | A conversation with the Constructor, an attachment tray, and one quiet line naming the harness and model |
| **New course, build** | Back, then Brief and Build | The activity feed and the staging tree, with Cancel |

The Tutor panel takes text, dropped files, and a pasted image, so showing it a photo of your working is a normal move.

There is no dashboard, no status bar, and no counters panel. The only progress figure anywhere is pages done out of pages total, and it appears on the home row and the Course header. Tickboxes appear on the course page only, never in the rail.

### 7.6 Stack

Tailwind CSS v4 with the tokens above as CSS custom properties, and shadcn/ui on Radix primitives restyled to them. Radix gives keyboard and focus behaviour for free, which matters for the reader. Icons from `lucide-react`.

## 8. Risks

| Risk | Effect | Mitigation |
|---|---|---|
| Codex or pi SDK surface differs from what the contract assumes | Phase 6 adapters need shims | The contract is files on disk plus an event stream. Any agent that writes files fits |
| The Constructor produces a folder that validates but reads badly | Wasted spend | The RunView shows text live. Cancel is one click. Budget cap on every run |
| A Mini-app validates but does not work | A dead activity in a Lesson | Smoke-load every Mini-app in a hidden sandbox during validation and require a `ready` message within five seconds |
| Prompt cache silently invalidates | Tutor costs rise | Test 10 asserts cache reads on a recorded exchange. The spend dashboard shows Tutor cost per turn |
| Electron size and update path | Larger app, manual updates | Accepted. No auto-update in the first version |
| API billing surprises | Money | Every run has a cap. The `runs` table shows spend per day. A soft monthly ceiling in Settings warns before a run starts |

---

## 9. Steps that need Victor at a browser

Each is a wizard step, not a chat instruction.

1. Create an Anthropic API key in the Console and store it in the app. Phase 3.
2. Create an OpenAI API key for Codex. Phase 6.
3. Any provider key pi needs beyond those two. Phase 6.

---

## 10. Not in scope

Unchanged from the handoff. Accounts, sync, sharing features beyond a copyable folder, mobile, a second-opinion grader, gamification, and local copies of Resources.
