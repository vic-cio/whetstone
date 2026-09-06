---
name: course-format
description: The exact layout and schema of a Whetstone Course folder. Read this before writing any file into a Course.
---

# The Course format

A Course is a folder. The app parses it with a strict schema and refuses anything that
misses it, naming the file and the field. Nothing here is advisory.

```
course.json          the manifest
AGENTS.md            what you tell the Tutor about this Course
lessons/<id>.md      one file per Lesson, frontmatter plus body
tests/<id>.json      one file per Test
tasks/<id>.json      one file per Task
apps/<id>/index.html one folder per Mini-app, one file inside it
lib/<name>.js|.css   code this Course carries for itself, optional
diagrams/<name>.svg  images a Lesson points at, optional
resources.json       an array of links
toolkit/             already there. Do not touch it
```

## Ids

Lowercase, hyphenated, prefixed by type, stable forever.

| Thing | Prefix | Example |
|---|---|---|
| Objective | `obj-` | `obj-chain-rule` |
| Module | `mod-` | `mod-2` |
| Lesson | `les-` | `les-the-chain-rule` |
| Test | `tst-` | `tst-module-2` |
| Task | `tsk-` | `tsk-differentiate-a-composition` |
| Try | `try-` | `try-inner-derivative` |
| Resource | `res-` | `res-3b1b-backprop` |
| Rubric criterion | `cri-` | `cri-states-the-assumption` |

A Mini-app's id is its folder name under `apps/`, with no prefix.

## course.json

```json
{
  "formatVersion": 1,
  "id": "gradients-by-hand",
  "title": "Gradients by hand",
  "subject": "Machine learning",
  "summary": "One sentence on what the reader will be able to do.",
  "toolkitVersion": "1.1.0",
  "library": [],
  "objectives": [{ "id": "obj-chain-rule", "title": "Apply the chain rule to a composition" }],
  "ladder": ["recall", "apply", "construct"],
  "modules": [
    {
      "id": "mod-1",
      "title": "What a derivative measures",
      "pages": [
        { "type": "lesson", "id": "les-what-a-derivative-measures" },
        { "type": "test", "id": "tst-module-1" }
      ]
    }
  ],
  "suggestedOrder": ["les-what-a-derivative-measures", "tst-module-1"]
}
```

`toolkitVersion` must be the version already in `toolkit/`. `ladder` is any subset of
`recall`, `apply`, `construct`, `transfer`, `project`, in that order. `library` lists file
names inside `lib/`, never a path, and the app inlines them into every Mini-app in this
Course in the order listed.

## A Lesson

YAML frontmatter, then the body. Prose is everything between the blocks. Only these blocks
exist, and no Course can invent one.

```markdown
---
id: les-the-chain-rule
title: The chain rule
module: mod-2
objectives: [obj-chain-rule]
minutes: 8
---

Plain prose. Short paragraphs.

:::callout{kind=insight}
One idea worth stopping on. `kind` is insight, warning, or note.
:::

:::diagram{src=diagrams/two-layer.svg}
The alt text goes in the body of the block.
:::

:::app{id=slope-explorer height=320}
:::

:::resource{id=res-3b1b-backprop}
:::

:::try{id=try-inner-derivative}
{
  "kind": "multiple-choice",
  "prompt": "Differentiate f(x) = sin(3x^2).",
  "options": ["6x cos(3x^2)", "cos(3x^2)", "6x sin(3x^2)", "3x^2 cos(x)"],
  "answer": [0],
  "explanation": "Outer derivative cos(3x^2), inner derivative 6x, multiplied."
}
:::
```

A `try` block carries its whole question as JSON in the block body, drawn from the six
deterministic kinds. A Try is never recorded and never becomes an Attempt. Recorded
questions live in a Test.

Lesson prose becomes data, not HTML. Markup you write is shown as characters.

## A Test

```json
{ "id": "tst-module-2", "title": "Module 2", "module": "mod-2", "tasks": ["tsk-one", "tsk-two"] }
```

## resources.json

```json
[
  {
    "id": "res-3b1b-backprop",
    "url": "https://www.youtube.com/watch?v=Ilg3gGewQ5U",
    "title": "What is backpropagation really doing?",
    "type": "video",
    "why": "The clearest visual account of the gradient flowing backwards."
  }
]
```

A Resource is a link. Never copy the content in.

## AGENTS.md

You write this, and a Tutor reads it while somebody studies the Course. Cover what the
Course teaches and in what order, which Objectives are load-bearing, the common
misconceptions at each Objective and how to correct them, which Lesson answers which
Objective, the notation and conventions this Course uses, and where the Rubrics are.
