---
name: scoring-a-rubric
description: How to score a submission against exactly the criteria a task declares, with evidence quoted from the work.
---

# Scoring a rubric

`task.json` carries the rubric. The reader saw those criteria before they started, and they
are what they were promised they would be scored on. Score exactly those: not one fewer, not
one more, and each one once.

## Read the submission first

Open the files. Read them properly before you score anything. A rubric scored from a skim is
a rubric scored from the file names.

## One line per criterion

- **`met`**: true or false. There is no partial credit, because a criterion that can be half
  met was two criteria.
- **`evidence`**: what in the submission shows it. Quote it where the file type lets you,
  exactly, because the app checks the quote appears in the work. Name the file and the line
  when you can.
- **`missing`**: what was absent. When the criterion is fully met, write "nothing".

## The overall outcome

Not a count. A submission that meets four criteria of five has failed if the one it missed
was the point of the task, and the reason is where you say so.

## A whole verdict or none

If you cannot score every criterion, produce nothing and say why. The app records an
incomplete verdict as an error and lets the reader try again. A criterion you guessed at,
recorded as a fail, is not recoverable and they will believe it.
