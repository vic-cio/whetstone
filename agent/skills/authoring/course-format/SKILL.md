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
| Project | `prj-` | `prj-classify-one-dataset` |

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
  "tags": ["calculus", "machine-learning"],
  "small": false,
  "projects": [],
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

`tags` is what the library filters on. Each tag is lowercase and hyphenated. You are shown
the tags already in the library: reuse one that fits before you invent a new one, because
`ml`, `machine-learning` and `ML` are three tags that filter nothing.

`small` marks a short Course. A small Course carries no Projects, and the parser refuses a
manifest that says both.

## Projects

A Project is an open-ended assignment covering a theme or the whole Course. The reader does
it outside the app with ordinary tools, then comes back and submits a folder and a list of
links. There is no Tutor panel on a Project, because the point is that it is a real setting.

```json
{
  "id": "prj-classify-one-dataset",
  "title": "Classify one dataset end to end",
  "brief": "Pick a dataset, train a classifier, and write up what the errors tell you.",
  "criteria": [
    { "id": "cri-states-the-baseline", "criterion": "States a baseline before the model, and beats it." }
  ],
  "accepts": ["folder", "links"]
}
```

`accepts` holds `folder`, `links`, or both, and nothing else. Write the criteria with the
brief, so the reader knows before starting what the work is judged on. A Project gets one
written response from a Reviewer, in the register of a senior colleague reading the work.
There is no mark, no score and no pass.

Write a Project only when the Brief asked for one. Most Courses carry none.

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
{
  "id": "tst-module-2", "title": "Module 2", "module": "mod-2",
  "minutes": 20,
  "tasks": ["tsk-one", "tsk-two"]
}
```

`minutes` is optional and indicative. Nothing counts down and nothing is enforced: it tells
the reader what size of sitting this is.

A Test is a sitting. The reader answers a question and presses Check, and every result is
held until the last question is checked. Order `tasks` the way the reader should meet them,
because a Task that carries `follows` may only name a Task earlier in this same array.

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
