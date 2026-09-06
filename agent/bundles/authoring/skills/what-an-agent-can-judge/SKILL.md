---
name: what-an-agent-can-judge
description: What an agent at study time can actually handle, so a Task can rely on it instead of writing down to a text box.
---

# What an agent at study time can do

When a Task's Check is `model` or `rubric`, something is spawned at study time to judge it.
That thing is an agent with tools, not a chat window, and it is worth knowing what it can
handle before you write the Task down to what a text box can hold.

It can:

- **Read a structured result a Mini-app emitted**, such as where the reader clicked, the
  parameters they settled on, or the state a simulation ended in.
- **Read a screenshot the Mini-app drew of itself**, as a picture, and judge what is in it.
- **Read work the reader made outside the app**: a repository, a document, a spreadsheet, a
  notebook, a CSV. It opens the files with its own tools rather than being handed a blob.
- **Quote what it read**, and the app checks each quote appears in the reader's work
  verbatim where the file type allows it. So a Verdict cites evidence rather than asserting.
- **Hold a conversation about a partly wrong answer** rather than returning a verdict and
  stopping.

So you can write "mark the inflection point on this curve" and ship a Mini-app that emits
the coordinate and a screenshot, and something at the other end will judge it properly.

It cannot:

- Run the reader's code. Code is checked by an `assertions-pass` Task, which runs in the
  Mini-app, against assertions you wrote.
- See the screen. It sees what a Mini-app chose to emit.
- Do any of this for free, or offline.

## Which is why most Tasks should not use it

Every `model` and `rubric` Task costs the reader money and needs a network. Every
deterministic Task is instant, free, and works on a train. The reader's Course should still
be usable when the model is not.

Reach for an agent when the answer genuinely has many valid forms. Do not reach for one
because writing the accepted-answer list was tedious, or because a Depth sounded advanced.
`depth: transfer` with `check: deterministic` is a good Task, and a Course with none of
those is a Course that took the easy road.
