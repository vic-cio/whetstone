# AI School: design handoff

> **Resolved 2026-09-05.** Every open question below was closed in one interview round with Victor. The result is `PLAN.md`. The status board in section 4 is now historical. Decision records 0003 to 0007 in `docs/adr/` hold the reasons.

**Written:** 2026-09-05
**Written by:** Claude Opus 5, in a `serious-mode` session with Victor.
**Written for:** Claude Fable 5.1, to construct the implementation plan.
**Status:** design partly settled. Five decisions are still open. Do not start the plan by assuming them.

---

## 0. How to read this document

This document replaces the conversation. It is deliberately verbose. Read it in order.

- **Sections 1 to 3** give you the product and where it came from.
- **Section 4** is the status board. It tells you what is settled, what I decided on Victor's behalf, and what is still open.
- **Sections 5 and 6** are the settled decisions and the ones Victor overturned. Section 6 matters most. It stops you re-proposing ideas he already rejected.
- **Section 7** holds the standing constraints. Read it before you design anything.
- **Sections 8 and 9** are the revised domain model and architecture.
- **Section 10** lists the open questions. Each one has options and a recommendation.
- **Section 11** holds API facts that constrain the design. Several are counter-intuitive. Do not skip it.
- **Sections 12 to 14** cover non-goals, verification, and pointers.

Two companion files sit beside this one.

- `CONTEXT.md` is the glossary. Use its terms exactly. Do not invent synonyms.
- `docs/adr/` holds two proposed architecture decision records.

---

## 1. The product in one paragraph

A macOS app that is one person's private learning environment. The user names a topic, states objectives, and optionally pastes source material. A frontier model then builds a structured course: modules, lessons, curated resources, and a ladder of assessable tasks. The tasks climb in difficulty. The bottom of the ladder is a multiple choice question the app grades instantly and offline. The top is a project that runs for days, that the user does outside the app, and that a frontier model grades against a rubric. A dashboard shows progress and outstanding work. Settings let the user choose which model builds courses and which model tutors.

The reference points Victor named are Khan Academy and Brilliant. He wants clear category separation, an interactive and visual feel, and a real sense of ramping difficulty.

---

## 2. Where this came from

Victor's original brief, near verbatim:

> I want to make learning things easier for myself. Let's create a macOS app I can use as a virtual learning environment where you or any other advanced model can take a topic, objectives, curriculum etc and create a structured course with many resources and tasks to help me master a topic. I would like it to be interactive and visual with the tasks gradually ramping up in complexity as I advance (ie starting with basic hard coded multiple choice questions that doesn't need an agent review all the way to long spanning tasks in which I might work outside the app to complete and then upload my answer as a doc or csv etc which a frontier agent will evaluate). Take inspiration from leading online education providers like Khan Academy or Brilliant and add clear category separation.
>
> The dashboard should display relevant progress and quick access to outstanding tasks and an option to create a new curriculum (from content ideas etc). In settings I should be able to choose my course constructor harness + model and the tutor model.

I then built a review artifact with three diagrams and five questions. Victor answered inside it and ended the session. His answers are the substance of sections 5 and 6.

---

## 3. Who the user is

One person. Victor. This matters for several decisions.

- He is not an advanced programmer. He builds through agents. Prefer stacks where an agent writes reliable code.
- He is the only user. There is no certificate, no cohort, and no deadline. Motivation systems designed for classrooms do not apply.
- He may already know parts of a topic. A course that forces him through beginner material is a course he abandons.
- He said he may share the app with friends later. Do not build multi-user features now. Do avoid decisions that make sharing impossible.

---

## 4. Status board

| # | Decision | State | Who decided |
|---|---|---|---|
| 1 | Tech stack, native or web | **OPEN** | Victor did not answer |
| 2 | How the app reaches a model | **OPEN** | Victor said "you pick", then asked to discuss further |
| 3 | Course is fixed, with append-only additions | **SETTLED** | Victor |
| 4 | Progression is not gated | **SETTLED** | Victor |
| 5 | Grading is harsh, non-blocking, narrow appeals | **SETTLED** | Victor |
| 6 | Ladders are per-course and fluid | **SETTLED** | Victor, stated twice |
| 7 | Lessons may contain generated interactive mini-apps | **SETTLED** | Victor |
| 8 | Courses are easy to delete | **SETTLED** | Victor |
| 9 | Review mode over covered topics | **SETTLED** | Victor |
| 10 | Depth and check are independent axes | **MY CALL** | Me, from Victor's constraint |
| 11 | Depth scale is fixed, courses use a subset | **MY CALL** | Me, needs his veto |
| 12 | Content in files, progress in a database | **ACCEPTED BY SILENCE** | Proposed, not reopened |
| 13 | Category hierarchy | **ACCEPTED BY SILENCE** | Proposed, not reopened |
| 14 | Cost visibility and spend ceiling | **ACCEPTED BY SILENCE** | Proposed, not reopened |
| 15 | Offline behaviour | **REVISED** | Victor changed the framing |
| 16 | Credentials and API keys | **OPEN** | Victor reopened it |
| 17 | Lesson content format | **OPEN** | Victor reopened it |
| 18 | The app's name | **OPEN** | Victor raised it |

---

## 5. Settled decisions, with the reasoning

### 5.1 A course is fixed. It grows by addition, never by silent rewrite.

Victor: *"yeah i think generally the courses remain prebuilt with the option to add modules later."*

The constructor writes the course once. After that the content does not change under the user. Two things may add to it.

1. The user asks the constructor for more. For example, "add a harder tier on top of this course."
2. The user fails the same objective repeatedly, and the app offers to generate a remediation block.

Both write new files. Neither edits existing ones. The reason is honesty: if questions can silently get easier, the user cannot tell improvement from drift.

### 5.2 Nothing is locked. Progression is a design property, not a gate.

Victor: *"i'd say anything should be permitted whenever, just that the courses should be designed for natural progression. i may have prior knowledge anyway so it could be frustrating not being able to skip beginner lessons (i might want them there for the sake of completeness though)."*

This overturns my recommendation. Read it carefully, because it has three parts.

- **No lesson or task is ever locked.** The user can open anything at any time.
- **The constructor must still order content so that it builds.** Natural progression is the constructor's job, expressed in ordering and in a suggested next step. It is not the app's job, expressed as a lock.
- **Beginner material still gets written**, even when the user already knows it, because he may want the course to be complete.

The third part implies a feature that does not exist yet in this design. The user needs a way to say "I already know this" about a lesson or an objective. That marking must collapse the item in the reader and remove it from progress denominators, without deleting it. Build this. Without it, prior knowledge permanently drags every progress number down, and the dashboard becomes a liar.

### 5.3 Grading is harsh. It never blocks. Appeals are narrow.

Victor: *"idk since no content is progress locked i think we can afford to be harsh here. appeals should just be for when the criteria relies on blatant inaccurate info, impossible to fulfil or something broke in an unforeseeable way."*

This is a precise and useful position. Note what it is not. It is not a grade dispute channel. The user is not allowed to argue that he deserved a better score, and the app should not offer that.

An appeal claims one of exactly three things.

1. The task rests on information that is factually wrong.
2. The task is impossible to complete as written.
3. Something broke in a way nobody could have foreseen.

Model this as a **defect report against the task**, not as a dispute against the verdict. When a defect report is upheld, the correct repair is to fix or regenerate the task and void the attempt. It is not to change the score. That distinction should be visible in the data model and in the UI wording.

Because grading is harsh and non-blocking, the grader can be genuinely strict without risk. A harsh grade costs the user nothing except information. This also means the grader does not need a second-opinion pass or a consensus mechanism. Do not build one.

### 5.4 Ladders are per-course and fluid.

Victor said this twice, which means I got it wrong the first time.

> *"lets keep tiers fluid for now - some courses i generate may not even need those long spanning project tasks. just want a layering curriculum generator with a nice ui to interact with that gradually helps internalise concepts and potentially use them in real world situation - adapt to scope of course."*

> *"not every course will have the same amount of tiers. some can be short throwaway ones that don't even need an ai reviewer for answers. i could always ask the constructor to add new tiers on top of a course. also they dont need to be fully linear - they could also feature a review mode where i get random questions based on topics ive already covered."*

Four requirements sit in those two sentences.

1. A course declares its own ladder. A throwaway course may have two rungs and need no model at all. A deep course may have five.
2. The constructor chooses the ladder from the scope of the course. It is not told to always produce five rungs.
3. The user can later ask for another rung on top of an existing course.
4. Progression is not purely linear. A review mode draws questions at random from objectives already covered.

Note that requirement 4 is different from a spaced repetition queue of items the user got wrong. Victor asked for random review across covered ground. Both are worth having, and they are different features. See `CONTEXT.md` under **Review session** and **Miss queue**.

### 5.5 Lessons may contain generated interactive mini-apps.

This is the most consequential piece of feedback. Quoted in full:

> *"along the right lines but remember we have multimodel coding agents that will only keep getting better - they can certainly write mini apps for lessons/projects that can be stored locally. this app just needs to be as modular as possible. can also delete courses easily if i feel that i don't need them anymore. important thing is dont limit yourself to what a static website does or the intelligence/modal limitations of previous models."*

Read this as a standing instruction, not as one feature request. Section 7 expands it. The immediate consequences are:

- A lesson may ship with an interactive artifact that the constructor **wrote as code**, not chosen from a fixed menu of block types.
- That code is stored locally inside the course folder.
- The app is a **host**. Lessons are content plus optional generated micro-frontends. The host stays small and modular.
- A project task may likewise be a generated mini-app the user works inside.

This creates a security requirement that did not exist before. Generated code runs on Victor's machine. See section 10.5.

### 5.6 Courses are cheap to delete.

Victor listed easy deletion as a requirement. Deleting a course must remove its folder and its progress rows in one action, with a confirmation and no orphaned state. This is easy to get wrong if progress and content are split across two stores. Design for it from the start rather than adding it later.

---

## 6. What I proposed and Victor overturned

Read this section before you design. These are dead ends. Do not re-propose them.

| I proposed | Victor's response | What replaces it |
|---|---|---|
| A fixed five tier ladder for every course | Rejected twice. Ladders adapt to the course. | Per-course ladder drawn from a fixed depth scale |
| Gating: tier N+1 locks until tier N passes | Rejected. Nothing locks. | Ordering plus a suggested next step |
| Advisory grader, disputable, gentle | Rejected. Be harsh. | Harsh grader, narrow defect reports |
| Difficulty tier determines grading method | Rejected. They are independent. | Depth and check as two separate fields |
| Lessons use a fixed set of interactive blocks, never generated code | Rejected. Agents can write mini-apps. | Generated micro-apps in a sandbox |
| Spawn the Claude Code CLI as the harness | Not rejected, but he asked for more options | See section 10.2. The Agent SDK is a better answer |

One correction of my own, unprompted by Victor. In the review artifact I framed the choice for model access as "CLI subprocess, direct API, or both". That framing was incomplete and it under-served his question. There are four ways to build an agent, and the one that best matches what he described is the **Claude Agent SDK**, which is Claude Code packaged as a library. Section 10.2 covers it.

---

## 7. Standing design constraints

These are not features. They are rules that apply to every design decision you make.

### 7.1 Do not design for the previous generation of models

Victor's words: *"dont limit yourself to what a static website does or the intelligence/modal limitations of previous models."*

Concretely, this means the following assumptions are banned from the plan.

- "The model cannot reliably write working code, so it must pick from a fixed menu." It can. Let it write code.
- "The model cannot judge open-ended work, so scoring must be keyword based." It can judge.
- "Generation is too slow or expensive to do properly, so keep courses thin." Build the good version and put a spend ceiling on it.
- "Content must be text, because rendering anything else is hard." It does not.

Where a constraint is real, name the real reason. Sandboxing untrusted generated code is a real constraint. Model capability is not.

### 7.2 Modularity is a first-class requirement

Victor asked for the app to be "as modular as possible". Interpret this as:

- The **host** app is small: navigation, reader, progress, settings, sandbox.
- A **course** is a self-contained folder that the host loads. Removing the folder removes the course completely.
- A **generated mini-app** is a self-contained bundle inside a course. It talks to the host over one narrow, documented interface, and over nothing else.
- Model providers sit behind an interface. Swapping the constructor model must not touch the reader.

### 7.3 Content must survive the app

A course is months of the user's time. It must be readable if the app is uninstalled, if it breaks, or if it is replaced. Keep course content in plain, readable files. This also makes courses shareable later, which Victor hinted at.

### 7.4 Most study must work with no network

Revised from my original framing, which tied this to tiers. Victor corrected it:

> *"yes but we can be more fluid with tiers - can add a little marker on the lessons to indicate that it need an agent. also not every lesson in the later tiers needs to abandon the cheap multi q form. sometimes the concept is complicated but can be cheaply tested."*

So the rule is not "tiers 1 and 2 work offline". The rule is: **any task whose check is deterministic works offline, at any depth.** The UI shows a marker on tasks that need a model. That marker is derived from the task's check field, not from its depth.

---

## 8. The domain model, revised

Full definitions live in `CONTEXT.md`. This section explains the two structural ideas behind it.

### 8.1 Depth and check are independent

This is the correction Victor forced, and it is the single most important modelling result of the session.

My original diagram conflated two things that are not the same:

- **Depth**: how demanding the thinking is. Recognising a definition is shallow. Designing and defending a system is deep.
- **Check**: how the answer gets judged. Some answers have one correct form a machine can compare. Some have many valid forms and need a model to read them.

I assumed these moved together. They do not. Victor's example: a complicated concept can often be tested cheaply. A well-written multiple choice question can probe deep understanding, and it still grades instantly and offline.

So a `Task` carries two independent fields.

```
depth:  recall | apply | construct | transfer | project
check:  deterministic | model | rubric
```

Any combination is legal. `depth: transfer, check: deterministic` is a good task, not a mistake. The constructor should be told this explicitly, because a naive prompt will correlate the two.

The `check` field alone decides three things: whether the task works offline, whether it costs money, and whether it shows the "needs a model" marker.

### 8.2 The depth scale is fixed. The ladder is per-course.

This is my call, and Victor should veto it if he disagrees, because he pushed twice for fluidity.

The tension: he wants ladders that adapt to the course. But if every course invents its own private rungs, then "tier 3" means nothing across courses, the dashboard cannot compare anything, and asking for "a tier on top" has no defined meaning.

The resolution: **the scale is fixed at five points. Which points a course uses is free.**

- A throwaway course uses `recall` and `apply` only. Two rungs, no model needed, exactly what Victor described.
- A deep course uses all five.
- A course can start with three and gain a fourth later. "Add a tier on top" then has a precise meaning: generate tasks at the next depth up.
- The dashboard can still compare, because the scale is shared.

This satisfies every requirement Victor stated while keeping the data comparable. If he wants genuinely arbitrary named rungs instead, that is a legitimate choice, and it costs the cross-course dashboard.

### 8.3 Objectives are the unit of progress, not lessons

Progress measured in lessons completed rewards scrolling. Progress measured against objectives rewards learning. Every task names the objective it tests. Every attempt records that objective. This costs almost nothing now and it cannot be reconstructed later, so record it from the first version even though nothing consumes it yet.

---

## 9. Architecture as it stands

```
                 CALLS A MODEL
   ┌──────────────┐   ┌─────────┐   ┌──────────┐
   │ Constructor  │   │  Tutor  │   │  Grader  │
   │ once/course  │   │on demand│   │ tier 3+  │
   └──────┬───────┘   └────▲────┘   └────▲─────┘
          │ writes         │ hint        │ submission
 ─────────┼────────────────┼─────────────┼──────────
          ▼   RUNS LOCALLY │             │
   ┌──────────────┐   ┌────┴─────────────┴────┐   ┌────────────┐
   │Course folder │──▶│      The host app     │──▶│ Progress DB│
   │ plain files  │   │ reader, sandbox, quiz │   │  attempts  │
   │ + mini-apps  │   │ dashboard, settings   │   │  mastery   │
   └──────────────┘   └───────────────────────┘   └────────────┘
```

- **Constructor**: runs once per course, agentic, needs web search and file writing. Expensive and slow. Also runs for "add a rung" and for remediation blocks.
- **Tutor**: on demand while studying. Explains, hints, answers "why was I wrong".
- **Grader**: only for tasks whose check is `model` or `rubric`.
- **Course folder**: plain files. Survives the app. Deleting it deletes the course.
- **Host app**: everything else. Renders lessons, runs generated mini-apps in a sandbox, grades deterministic tasks, tracks progress, runs review sessions.
- **Progress DB**: every attempt, with its objective, outcome, and timestamp.

The proposed folder shape, subject to the stack decision:

```
courses/<slug>/
  course.json         manifest: title, objectives, ladder, module order
  modules/*.md        lesson prose plus embedded activity references
  tasks/*.json        task definitions: depth, check, objective, rubric
  apps/<id>/          generated interactive mini-apps, sandboxed
  resources.json      curated links with a note on why each matters
```

---

## 10. Open questions

Five decisions are unmade. Each has options and a recommendation. Do not silently pick one.

### 10.1 The tech stack

**Victor did not answer this.** It remains the highest-cost decision.

| Option | For | Against |
|---|---|---|
| Tauri v2 + React + TypeScript | Real `.app`. Generated mini-apps are web bundles, which is what a model writes best. Sandboxing is a solved problem via iframes and CSP. Agents write this stack reliably. | Not truly native. Larger than a Swift app. |
| Native SwiftUI | Genuinely native feel, speed, and OS integration. | Every interactive lesson widget is a custom build. Generated mini-apps would need a web view anyway. Agents are less reliable in Swift. |
| SwiftUI shell plus web view | Native chrome, web content. | Two codebases and a bridge. Worst of both for a solo project. |

**Recommendation: Tauri v2 with React and TypeScript.** Section 5.5 largely decides it. Once lessons can carry generated interactive apps, the content layer is a web runtime whichever shell you pick. Choosing a native shell means building that web runtime anyway, plus a bridge, plus a second language. The argument is not that native is worse. It is that Victor's own requirement makes the web the content substrate, and the shell should match the substrate.

**SwiftUI wins instead** if Victor wants menu bar presence, Spotlight indexing, Shortcuts integration, or an iPad version. Ask him.

### 10.2 How the app reaches a model

Victor said "you pick", then immediately added *"I guess the app can host a shell inside? lets discuss the options further maybe"* and later *"again need to discuss model integration further"*. So this is not settled, and his instinct deserves a proper answer.

His instinct is right, and there are **four** approaches, not the three I offered.

| # | Approach | What you write | What it gives you |
|---|---|---|---|
| 1 | Messages API, manual loop | The whole tool-use loop | Total control. Most code. |
| 2 | Messages API, Tool Runner (`client.beta.messages.tool_runner`) | Only the tool functions | The loop, for tools **you** define. No built-in tools, no filesystem, no search. |
| 3 | Managed Agents | Agent config | Anthropic runs the loop **and** hosts a sandbox. Cloud-side. |
| 4 | **Claude Agent SDK** (`@anthropic-ai/claude-agent-sdk`) | A prompt and options | Claude Code as a library. Built-in Read, Write, Edit, Bash, Glob, Grep, WebSearch, WebFetch, plus MCP and subagents. You host it. |

**Recommendation: option 4 for the constructor, option 1 or 2 for the tutor and grader.**

Option 4 is the direct answer to "can the app host a shell inside". The Claude Agent SDK is a library, so it embeds in a Tauri or Electron app with no CLI installed and no subprocess. It already has web search, web fetch, and file writing, which is exactly the constructor's job. It gives Victor a real "harness plus model" choice in Settings without depending on his machine having Claude Code.

The tutor and grader want the opposite shape. One question in, one structured verdict out, as fast as possible. An agent loop there adds latency and cost for nothing.

**Important caveat for you, Fable.** The `claude-api` skill states plainly that it does **not** cover the Agent SDK, and points to `code.claude.com/docs/en/agent-sdk`. Do not write Agent SDK code from memory. Fetch those docs first. The Tool Runner and the Agent SDK have similar names and are different packages; do not substitute one for the other.

Also worth putting in front of Victor: an embedded terminal view, using something like xterm.js, that shows the constructor's agentic run as it happens. It makes a four minute course build feel like progress instead of a spinner, and it makes failures debuggable. This is a UI idea, independent of options 1 to 4.

### 10.3 Credentials

Victor reopened this. I do not know why, and you should ask rather than guess. My best reading is that it connects to 10.2: if the app embeds an agent harness, the credential might come from his existing Claude Code login rather than from a pasted API key.

Facts that bear on it:

- The SDKs resolve credentials in a fixed order. `ANTHROPIC_API_KEY`, then `ANTHROPIC_AUTH_TOKEN`, then an OAuth profile created by `ant auth login`, then Workload Identity Federation, then the default on-disk profile.
- A zero-argument client works after `ant auth login` with no environment variable set. An unset API key does not mean there are no credentials.
- `ant auth status` reports which source is active.

**Recommendation:** support both. Prefer an existing OAuth profile when one is present, and fall back to an API key stored in the macOS Keychain. Never write a key to a file or into the database. Whichever path is chosen, set it up with the `wizard` skill rather than a list of steps in chat, because it involves a browser and a secret.

**Verify before writing this into the plan:** whether Agent SDK usage inside a third-party app can ride a Claude subscription, or whether it requires API billing. Do not assert either way from memory.

### 10.4 Lesson content format

Victor reopened this, and section 5.5 is why. My original assumption was that the model picks from a fixed menu of block types and never writes runnable code. He rejected that.

The question is now: what exactly can a lesson contain?

| Option | Description |
|---|---|
| A | Markdown plus a fixed block set. Safe, limited. **Victor rejected this.** |
| B | Markdown plus a fixed block set, plus generated mini-apps in a sandbox for the cases the block set cannot express |
| C | Every lesson is a generated app. Maximum freedom, no consistency, no reuse, expensive |

**Recommendation: B.** Most of a lesson is prose, a diagram, and some questions, and those should be consistent, styled by the host, searchable, and cheap. Reach for a generated mini-app when the block set genuinely cannot express the idea, for example an interactive simulation. This keeps courses consistent and legible while removing the ceiling Victor objected to.

### 10.5 Sandboxing generated code

This did not exist as a question until section 5.5, and Victor has not seen it. Raise it with him.

Generated code will run on his machine. Even with a trusted model, the code is written by an automated process against material fetched from the open web, so treat it as untrusted by default.

**Recommendation:** run every generated mini-app in a locked-down iframe with a strict Content Security Policy. No filesystem access, no network access, and no access to the host app's state except through one narrow, documented message channel. The mini-app receives inputs and returns a result. It does not read the progress database, and it does not call out.

State clearly in the plan what a mini-app **cannot** do. That list is the security boundary, and it should be written before the first mini-app runs, not after.

### 10.6 The name

Victor: *"lets also discuss the name this is a little bland - might share the app with friends after this."*

"AI School" is a placeholder. It describes the category, not the product, and it dates itself.

Some directions, offered as starting points rather than a shortlist to pick from:

- **Ladder**, **Rungs**, **Ascent**: names the mechanic Victor cares about, the climb.
- **Whetstone**, **Anvil**, **Forge**: names the effect, sharpening through work.
- **Curriculum**, **Syllabus**, **Praxis**, **Quorum**: plain nouns with a scholarly register.
- **Groundwork**, **Firsthand**, **Longform**: names the value, real understanding rather than skimming.

My own lean is **Whetstone**. It says the app makes the user sharper through effort, it is a real word people can spell, it does not mention AI, and it does not age. But this is Victor's call and he should pick it himself.

---

## 11. API facts that constrain the design

Taken from the `claude-api` skill, cached 2026-06-24. Several of these are counter-intuitive. Verify anything you plan to depend on.

### 11.1 Models and prices

| Model | ID | Context | Input $/1M | Output $/1M |
|---|---|---|---|---|
| Claude Fable 5.1 | `claude-fable-5-1` | 1M | $10.00 | $50.00 |
| Claude Opus 5 | `claude-opus-5` | 1M | $5.00 | $25.00 |
| Claude Sonnet 5 | `claude-sonnet-5` | 1M | $2.00 | $10.00 |
| Claude Haiku 4.5 | `claude-haiku-4-5` | 200K | $1.00 | $5.00 |

Use the exact ID strings. Never append a date suffix.

Suggested defaults for the Settings screen, all user-overridable:

- **Constructor**: `claude-opus-5`, with `claude-fable-5-1` offered for the most demanding courses.
- **Tutor**: `claude-sonnet-5`.
- **Grader**: `claude-haiku-4-5` for short answers, `claude-opus-5` for project rubrics.

### 11.2 Things that will bite you

- **`budget_tokens` is gone.** On current models it returns a 400. Use `thinking: {type: "adaptive"}` and control depth with `output_config: {effort: ...}`, where effort ranges `low` through `max`.
- **Structured outputs use `output_config: {format: {...}}`.** The old `output_format` parameter is deprecated. Prefer `client.messages.parse()`, which validates the response against your schema. The grader depends on this.
- **Citations and structured output are mutually exclusive.** Setting `citations: {enabled: true}` on a document block returns a 400 when combined with `output_config.format`. This matters directly. The "evidence quotes" idea for grading maps onto the native citations feature, and native citations cannot be combined with a validated rubric JSON in one call. Either make two calls, or get the quotes through a tool with `strict: true`. Decide this deliberately.
- **Assistant prefill is removed** on all current models. It returns a 400.
- **Task budgets**, beta `task-budgets-2026-03-13`, set `output_config.task_budget` to give an agentic run a token ceiling it can pace itself against. Minimum total is 20,000. This is the clean implementation of the constructor's spend ceiling. Note it is advisory, not a hard cap.
- **Refusal fallbacks.** On `claude-opus-5` and `claude-fable-5-1`, check `stop_reason` for `"refusal"` before reading content, and enable server-side fallbacks by default with `betas: ["server-side-fallback-2026-07-01"]` and `fallbacks: "default"`.
- **Stream anything long.** Course construction produces large output. Non-streaming requests hit HTTP timeouts.
- **Prompt caching is a prefix match.** Cache the course context so tutor turns stay cheap. Any byte change in the prefix invalidates everything after it. Verify with `usage.cache_read_input_tokens`; if it stays zero, something is silently invalidating the cache.

### 11.3 Features worth using

- **Files API** (`client.files.upload`) for the user's uploaded submissions. Reference them as a `document` block. PDFs also work base64, up to 32MB and 600 pages.
- **Batches API** at 50% cost for anything not latency sensitive. Generating a large bank of deterministic questions overnight is a natural fit. Results come back in any order, so key them by `custom_id`.
- **Token counting** via `messages.count_tokens` for the pre-flight cost estimate. Do not use `tiktoken`.
- **Web search** and **web fetch** server tools for the constructor if you go with a Messages API path instead of the Agent SDK. Current types are `web_search_20260209` and `web_fetch_20260209`. Errors return HTTP 200 with an error object, not an exception, so branch on the content shape.

---

## 12. Non-goals

Explicitly out of scope. Victor did not reopen any of these.

- Accounts, authentication, and multiple users.
- Sync across devices.
- Sharing courses with other people. Keep it possible, do not build it.
- Mobile and iPad.
- A second-opinion or consensus grader.
- Gamification: streaks as pressure, points, badges, leaderboards. There is one user and no competition.
- Scraping or storing local copies of linked resources. Store the link, the title, the type, and one line on why it matters.

---

## 13. Verification

This session ran under `serious-mode`, which requires tests written from the request before any implementation exists. No code was written in this session, so no tests were owed. That obligation transfers to you.

The tests that should exist before implementation starts:

1. **Course format parser.** A hand-written example course is the fixture. It must parse, and a malformed one must fail with a useful error rather than a crash. Golden-file test.
2. **The depth and check independence rule.** A task with `depth: transfer` and `check: deterministic` must be valid and must be gradeable offline. This is the test that encodes section 8.1, and it is the one most likely to be quietly broken later.
3. **Grader contract.** Given a submission and a rubric, the verdict validates against the schema, scores every criterion, and never returns a partial object. Use a recorded model response, not a live call.
4. **Deletion.** Deleting a course removes its folder and every progress row, and leaves nothing orphaned.
5. **Offline path.** With the network disabled, every deterministic task at any depth still grades.
6. **Sandbox boundary.** A generated mini-app cannot reach the filesystem, the network, or the progress database. Write this test before the first mini-app runs.

Test 2 and test 6 are the ones worth writing first. Test 2 encodes the correction Victor made. Test 6 encodes a boundary that is painful to add after the fact.

---

## 14. Pointers

- **This document:** `~/Documents/Education/AI School/HANDOFF.md`
- **Glossary:** `~/Documents/Education/AI School/CONTEXT.md`
- **Decision records:** `~/Documents/Education/AI School/docs/adr/`
- **The review artifact** with the three diagrams and Victor's inline annotations: `~/Documents/Education/AI School/.lavish/ai-school-design/index.html`. Open it with `npx -y lavish-axi ".lavish/ai-school-design/index.html" --reopen`, or open `index.standalone.html` in the same folder directly in a browser with no server.
- **Lavish Library:** the folder is registered, so the artifact appears under the project "AI School".
- **Agent SDK docs**, needed for section 10.2: `code.claude.com/docs/en/agent-sdk`.

---

## 15. What I would ask Victor first

In this order, because each answer unblocks the next.

1. The stack, section 10.1. Everything depends on it.
2. Model integration, section 10.2, now that the Agent SDK is on the table.
3. The sandbox boundary, section 10.5. He has not seen this question yet.
4. The name, section 10.6.
5. Credentials, section 10.3, which is partly downstream of question 2.
