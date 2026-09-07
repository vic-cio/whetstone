---
name: writing-a-lesson
description: How to write a Whetstone Lesson, the closed block set, and the difference between a Try and a Task.
---

# Writing a Lesson

A Lesson is a Page the reader reads, watches, and plays with. **Nothing in a Lesson is
recorded.** Recorded questions live in a Test. Getting this wrong turns reading into an
exam, which is the thing the app exists to avoid.

A Lesson is frontmatter and a body. Prose is everything between the blocks, and the block
set is closed: `callout`, `diagram`, `app`, `resource`, `try`. You cannot invent one.

```markdown
---
id: les-the-chain-rule
title: The chain rule
module: mod-2
objectives: [obj-chain-rule]
minutes: 8
---
```

`minutes` is an honest reading time, not an estimate that flatters the reader.

## How to write the prose

Say the thing. A paragraph should carry an idea, not announce one.

- No "in this lesson we will", no "as we saw earlier", no summary at the end.
- No encouragement. The reader chose to be here.
- Second person, present tense, active voice.
- Define a term the first time it appears, in the sentence that uses it.
- One idea per paragraph, and paragraphs of three or four sentences.

Prose becomes data, not HTML. Markup you write appears as characters.

## Maths and tables

Both are ordinary prose and need no block of their own.

**Maths** is LaTeX between dollars. `$f'(x)$` sets an expression inside a sentence, and a
`$$` line opens and closes a displayed equation:

```markdown
The transform is defined as

$$
\hat{x}(f) = \int_{-\infty}^{\infty} x(t)\, e^{-i 2\pi f t}\, dt
$$
```

It is typeset by KaTeX, so use KaTeX's commands. An expression that will not parse is shown
in red rather than breaking the page, which means a mistake is visible to the reader, so
check what you write. A single `$` against a space stays a dollar sign, and money is safe.

Maths works in a callout, in a task's prompt, in an option, and in an explanation, because
all of those go through the same parser. Use it wherever the notation is clearer than words.

**A table** is the usual pipe form, and the rule under the header sets the alignment:

```markdown
| Kind | What the reader does | What the app checks |
| --- | --- | :---: |
| `numeric` | Enters a number | Within a tolerance |
| `ordering` | Arranges steps | Sequence equality |
```

A cell holds inline markup, so it can carry code, a link, or an expression. Reach for a
table when the content really is a grid; two columns of prose is a list.

## The blocks

**`:::callout{kind=insight}`** one idea worth stopping on. `kind` is `insight`, `warning`,
or `note`. Use these sparingly; a page of callouts has no callouts.

**`:::diagram{src=diagrams/two-layer.svg}`** the body of the block is the alt text. Write the
SVG yourself, into `diagrams/`. A diagram is a separate file, so the app cannot hand it the
theme: carry both colour schemes in the SVG's own `<style>`, with the dark one under
`@media (prefers-color-scheme: dark)`, or it will vanish in one of them.

**`:::app{id=slope-explorer height=320}`** a Mini-app to play with. In a Lesson it demonstrates
and answers nothing.

**`:::resource{id=res-3b1b-backprop}`** a link from `resources.json`, drawn as a card.

**`:::try{id=try-inner-derivative}`** a question the reader answers in place, gets an answer
to, and is never recorded on. The whole question is JSON in the block body, drawn from the
six deterministic kinds.

```markdown
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

A Try carries no Objective, no Depth and no Check. It exists so the reader can check they
followed. Put one after the idea it checks, not at the end.

## Shape

A Module is usually several Lessons and then one Test, but the shape is yours. A Module may
be one Lesson with no Test at all. Split a long Lesson rather than writing a long one: a
Page is a sitting, and the tick counts Pages.
