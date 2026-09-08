# Whetstone

A single-user macOS learning environment. You say what you want to learn, a frontier model
builds a structured course for it, and you work through it: lessons to read, activities to
play with, and tests that record what you can do unaided.

Apple Silicon only.

## Install

One line, and no security warning to click through:

```bash
curl -fsSL https://github.com/vic-cio/whetstone/releases/latest/download/install.sh | bash
```

It downloads the latest release, puts Whetstone in `/Applications` and opens it.

There is no warning because there is nothing quarantined to warn about: macOS attaches the
quarantine flag in the browser, in AirDrop and in Messages, and `curl` attaches none. The
app is not signed with a Developer ID certificate, which needs a paid Apple Developer
membership, so a copy that arrives any other way **is** quarantined and macOS refuses it
until you allow it in System Settings → Privacy & Security. The install script exists to
avoid that conversation rather than to teach people to dismiss it.

## Updating

The app updates itself. The foot of the sidebar says which version is running and becomes an
**Update to …** button when a newer release exists; pressing it downloads, replaces the app
and relaunches. It checks once per launch, only ever tells you, and fails silently when
there is no network.

## What it needs

Whetstone has no model and no API key of its own. It spawns a command line tool you
installed and logged into yourself:

- [Claude Code](https://docs.claude.com/en/docs/claude-code/overview)
- [Codex CLI](https://developers.openai.com/codex/cli/)
- `pi`

Settings has a row per job, so an expensive model can build a course while a cheaper one
answers questions. A tool that is not installed is listed and greyed rather than hidden.

**Without any of them, most of the app still works.** Reading, the activities, and every
question the app answers by comparison are offline and free. What needs a model is building
a course, the tutor, and questions that have to be read rather than compared.

The app ships with one course, *Using Whetstone*, which explains the rest and needs no model
at all.

## Building it yourself

```bash
npm install
npm run dev            # electron-vite dev
npm test               # vitest
npm run typecheck      # tsc --noEmit, strict
npm run dist:mac       # dist/Whetstone-mac-arm64.{zip,dmg}
```

Releasing is a build and one command; the zip must keep its exact name, because the install
script and the in-app updater both fetch `latest/download/Whetstone-mac-arm64.zip`:

```bash
gh release create v0.2.3 dist/Whetstone-mac-arm64.zip scripts/install.sh \
  --title "Whetstone 0.2.3" --generate-notes
```

Attach `install.sh` to every release: `latest/download` resolves against the newest one, so
a release without it breaks the install line.

## Where the documentation is

| | |
|---|---|
| `AGENTS.md` | How to work in this repository, and the invariants worth failing a build over |
| `CONTEXT.md` | The vocabulary. Page, Lesson, Test, Task, Sitting, Harness and the rest mean something specific here |
| `PLAN.md` | The design, and what each phase turned out to be |
| `NEXT.md` | What is open now |
| `docs/adr/` | Why each structural decision was made, and what was rejected |
| `docs/toolkit.md` | The widget set a Mini-app is built from |
