---
id: les-activities
title: Activities, and the tutor
module: mod-1
objectives: [obj-pages]
minutes: 6
---

Some pages carry an activity: a small interactive thing built into the course. Here is one.
Drag it.

:::app{id=first-activity height=190}
:::

It has an Answer button, and pressing it here does nothing at all, because this is a Lesson.
In a Test, the same activity answers a question: it sends the number to the app, and the app
compares it with what the course wrote down.

That order matters more than it looks. **The activity never decides whether you are right.**
It reports what you did, and the judging happens outside it, where the answer is kept. An
activity that could mark its own work could be talked into passing you, and the courses here
are written by a model.

:::callout{kind=note}
An activity runs sealed off: no network, no files, no way of reaching the rest of the app
except that one button. It can play sounds, draw, and run code you type into it, and it
cannot phone anywhere or read anything of yours.
:::

## The tutor

Every page has a tab on the right marked Tutor. Opening it costs nothing and starts nothing:
the panel is drawn, and if you have talked about this page before, that conversation is read
back out of the database.

It begins when you send a message, not when you open the panel. That is a rule the app is
built around: **nothing here spawns a model because you navigated somewhere.** Reading is
free and always works, including with no internet. What costs money is asking for something:
a tutor message, a question that has to be marked by a model, or building a course.

The tutor sees the course you are in and what you are working on. It cannot change a byte of
the course, and the app checks that after every conversation rather than trusting it.

:::try{id=try-tutor-cost}
{
  "kind": "multiple-choice",
  "prompt": "You open the tutor panel on this page and read the last conversation, then close it again. What has that cost?",
  "options": [
    "Nothing: a model runs when you send a message",
    "One tutor turn",
    "It depends which model is set in Settings",
    "Nothing now, but it is billed when you close the course"
  ],
  "answer": [0],
  "explanation": "Opening the panel reads the database. A run starts on the press that sends a message."
}
:::
