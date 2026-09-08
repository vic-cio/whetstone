---
id: les-building
title: Getting a course built
module: mod-3
objectives: [obj-building]
minutes: 7
---

This course was written by hand. Every other one is built for you, on whatever you actually
want to learn, and that is what the app is for.

## What it runs on

Whetstone has no model of its own and no key of its own. It spawns a command line tool you
installed and logged into yourself, and it knows how to drive three of them. Settings has a
row for each job the app can give a model, so the expensive one can build a course while a
cheaper one answers questions.

If none of them is installed, everything you have read so far still works. Reading, the
activities, the questions the app answers itself: all offline, all free. What needs a model
is building a course, the tutor, and the questions that are marked by reading rather than by
comparison. Settings lists a tool that is not installed rather than hiding it, so the reason
something is greyed out is visible.

Install whichever you already pay for, then sign in to it once in a terminal:

:::resource{id=res-claude-code}
:::

:::resource{id=res-codex-cli}
:::

Whetstone never sees the key. It runs the tool as you, with the credentials it already has.

## The four stages

1. **The brief.** A conversation about what you want to learn. It asks what you can already
   do, how long you have, and whether you want it short. Answer honestly: how long you say
   you have is what decides how big the course is.
2. **The outline.** Ask for one before building. It comes back as a message with the
   objectives, the modules and the size, and it costs a fraction of a penny. Arguing with it
   here is free; arguing after the build is minutes and money.
3. **The build.** The model writes the whole course into a folder outside your library.
4. **The gate.** The app reads that folder. A course that will not parse goes back to be
   fixed, up to three times. A course that parses but is too thin to learn from goes back
   with the numbers: which lessons are short, which ideas are only ever asked once. Nothing
   reaches your library until it has been through both.

:::callout{kind=note}
The line at the bottom of the brief says which tool, which model, and the most it may spend.
Change any of them there. The model box takes anything your tool can reach, so a model that
appeared this morning can be typed in.
:::

## Afterwards

A course is a folder, and it stays yours. Export writes a zip of it. Delete moves it to the
Trash and takes its record with it.

You can also send the model back in: rebuild a module that is badly written, remove one that
should not be there, or ask for harder questions at a rung the course does not use yet. The
dashed rungs on the course page are the ones it has no questions at, and pressing one offers
exactly that.

:::try{id=try-outline}
{
  "kind": "multiple-choice",
  "prompt": "You have described what you want and the brief has stopped asking questions. What is the cheap thing to do next?",
  "options": [
    "Ask for an outline and read it",
    "Press Build the course",
    "Raise the spend cap first",
    "Attach some reading material"
  ],
  "answer": [0],
  "explanation": "An outline is a message. Finding out the shape is wrong there costs a fraction of a penny; finding out after the build costs the build."
}
:::
