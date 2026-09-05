---
status: accepted
---

# Every model role is a spawned harness, not an API call

An earlier design gave the Constructor an agent harness and gave the Tutor and Grader a direct chat API, reasoning that one question in and one structured answer out does not need an agent loop. Victor rejected this: a harness's capabilities supersede a plain provider layout, and designing around the weaker shape bakes in a limitation the models do not have. So the app never calls a model API. Every role spawns a harness with a working directory, a role instruction file, a plugin bundle, a tool allowance, and a budget, and the roles differ only in those five values.

The concrete gain is that the Tutor stops answering from memory about a Course it cannot read. It opens the Lesson, reads the Task the user just failed, and consults the Rubric, and it can review a project or judge a Mini-app payload, none of which a chat box can do. The pattern is taken from Victor's Strudel++, whose source states the contract plainly: the write-to-file loop and the live snapshot are the app's real contract with a coding agent.

## Considered options

Embedding the Claude Agent SDK as a library was the alternative. It was rejected because it locks the app to one vendor, and because Anthropic's documentation forbids an SDK-built product from using a claude.ai login, which would force API billing on every user. Spawning a CLI the user already installed and logged into avoids both.

## Scope

This governs how a model is reached when one is needed, not how often that happens. ADR-0012 sets the posture: most study is answered by the app itself with no model at all, and nothing spawns on navigation. A harness starts only when the user builds a Course, sends a chat message, submits work, or presses Review.

## Consequences

Harnesses are registry entries in `harnesses.json`, so adding one is configuration rather than code, and each needs only a small adapter that builds its arguments and normalises its event stream. Every agent result the app depends on is validated, either through the CLI's own structured-output flag or as a file the app checks. Tool allowances become a security boundary rather than a convention: the Tutor is spawned with read-only tools so it cannot alter a Course that other people may hold a copy of.
