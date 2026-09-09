---
name: writing-a-mini-app
description: How to write a Whetstone Mini-app, what the toolkit gives you, and what a sealed frame cannot do.
---

# Writing a Mini-app

A Mini-app is one `index.html` under `apps/<id>/`, with everything inline: no `<head>`, no
`<link>`, no `<script src>`, no image URL, no font. It runs in a sealed frame with no
network, no storage, and no way out except the toolkit's bridge. A reference to anything
outside the file is refused when the Course is parsed, so it fails at your desk rather than
at the reader's.

```html
<div id="app"></div>
<script>
  var pick = Kit.slider({ mount: '#app', label: 'x', min: 0, max: 10, value: 3 })
  Kit.bridge.action('Answer', function () { return pick.value() })
  Kit.bridge.ready()
</script>
```

## Declare it, if it is one of the eight common shapes

Before writing `apps/<id>/index.html` by hand, check whether the activity is one of the
eight toolkit widgets doing what it already does well: a slider, an order, a set of
pieces, a hotspot, a code editor with assertions, a sim, a steps walkthrough, or a plot.
If so, write `activities/<id>.json` instead — data, not code — and the build compiles it
into an ordinary Mini-app for you, at the id you gave it. From that point on it is a
Mini-app like any other: reference it from a Task's `app` field exactly the same way.

```json
{
  "id": "order-the-layers",
  "widget": "order",
  "label": "Put the layers in the order the signal passes through them",
  "items": ["input", "hidden", "output"]
}
```

Two things a declared activity cannot do, on purpose, because they are the bugs that
shipped without it: an `app-result` Task's `answer` may never equal the widget's own
untouched starting state (the build refuses it), and a declared `editor`'s assertions are
`{name, export, args, check: {type: 'equals'|'range'|'matches', ...}}` — a comparison
against the reader's real executed code, never against the raw text they typed. `Kit.steps`
and `Kit.plot` are presentation only here; neither has a natural answer, so the schema does
not let you invent one. `Kit.sim` still takes `stepBody`/`drawBody` as JavaScript strings —
a simulation is its behaviour, and pretending that is data would be dishonest — but its
`start` state still goes through the same untouched-state check as everything else.

Reach for a hand-written `apps/<id>/index.html` instead when the activity is not one of
the eight shapes, needs a library engine from `lib/`, needs sound, or needs anything else
this page describes below that a declared activity's data cannot say. Every Mini-app, declared
or hand-written, is booted for real at build time before the Course ships: it must call
`Kit.bridge.ready()` without throwing, and pressing at least one of its action buttons must
produce an answer or a review.

## What to build with it

The Mini-app is the reason this is not a web page with questions under it. Reach for the
thing the reader can drive, not the thing that quizzes them on what they read.

- **A playable version of the subject.** If the course is about a tool with a browser
  runtime, put a working one in front of them: an editor, a run button, and the result they
  can hear or see. The engine goes in the Course's `lib/`, listed under `library`, and is
  written by you. A frame has no network, so anything that fetches at run time is out:
  synthesise, generate, or carry the data inline.
- **A model of the idea.** A thing to drag, tune or step through, where the point is what
  changes when they change it.
- **A workbench.** The reader writes something and it runs, with your assertions saying what
  holds. That is `assertions-pass`, and it is the strongest Task the format has.

A frame with four buttons that asks which one is right is a multiple-choice question that
took an afternoon to build. Write the question instead, and spend the afternoon on an
activity that could not be a question.

## Sound, and anything else the browser can do on its own

The frame has no network. It does have the whole browser: Web Audio, canvas, timers,
`requestAnimationFrame`. So a course about live coding, synthesis or music can put a real
instrument in front of the reader, and the only thing it cannot do is fetch a sample pack.

- **Synthesise.** `new AudioContext()`, an oscillator and a gain envelope give you notes,
  basses and pads with no files at all. A noise burst through a short decay is a hat; a
  sine sweeping down fast is a kick.
- **Inline what you cannot synthesise.** A short percussive hit is a few tens of kilobytes
  as a base64 `data:` URI, decoded with `decodeAudioData`. Three of those is a drum kit.
  A library of full-length samples is not, and must not be attempted.
- **Start the context on a press.** A browser will not make a sound before the reader has
  clicked something. `Kit.bridge.action` is a press; use it, or resume the context in your
  own button's handler.
- **Put the engine in `lib/`.** A pattern player, a synth, a sequencer: written by you,
  listed under `library`, and shared by every Mini-app in the Course. That is what
  `docs/adr/0019` exists for, and it is how the reader gets an editor with a run button
  rather than a picture of one.

The same reasoning holds anywhere else: the frame is a whole browser with the outside world
taken away. Anything that runs on the reader's machine alone is available to you.

Two rules cover most mistakes.

- **A Mini-app reports; it never decides.** Nothing in the toolkit returns a pass or a fail.
  The app holds the Task and judges what you sent.
- **A Mini-app writes no colours and no faces.** Use the toolkit's classes and tokens. This
  is what makes an activity follow the reader's theme with no code of yours.

Write ES5-style JavaScript: `var`, `function`, no modules, no build step.

## Kit.bridge

The only way out of the frame. Never call `postMessage`.

| Call | What it does |
|---|---|
| `ready()` | Say the activity has drawn. Call it last |
| `answer(value)` | Report what the reader did |
| `review(png, state)` | Ask for a person to look at this. `png` is a data URL you drew |
| `resize()` | Report the height. It also happens on its own as the content changes |
| `action(label, produce, options)` | The answer button. Returns `{ enable(on), say(text) }` |

`action` is how anything leaves the frame. `produce` returns the value to send, or `null` to
send nothing and show `options.empty` instead. Nothing leaves without the reader pressing it.

## The widgets

Each takes `mount`, a selector or an element, and appends itself there.

**`Kit.slider({ mount, label, min, max, step, value, format })`** a dragged parameter with a
readout. `value()`, `set(v)`, `onChange(fn)`.

**`Kit.plot({ mount, domain, range, height, label })`** axes and curves. `curve(fn)` adds a
line, and the second is drawn amber and dashed, which is the convention for a tangent or a
comparison. `mark(x, y)`, `marks(list)`, `readout(text)`, `onPick(fn)`.

**`Kit.pieces({ mount, pieces, slots, bankLabel })`** draggable pieces and named slots, for
ordering, matching, labelling, or building an expression. `value()`, `complete()`.

**`Kit.hotspot({ mount, src, alt, width, height, regions })`** click to mark a place.
`value()` gives the region id, or `{ x, y }` as fractions.

**`Kit.editor({ mount, start, exports, assertions, label, runLabel })`** a code editor with
your assertions beside it. This is what an `assertions-pass` Task runs on. Each assertion is
`{ name, test(api) }` and throws with a message saying what was wrong. `run()` returns the
names that passed. The names here and in the Task must match exactly.

**`Kit.steps({ mount, steps })`** a walkthrough advanced one beat at a time. Each step is
`{ title, body }`. `index()`, `go(n)`, `onStep(fn)`.

**`Kit.order({ mount, items, label, enabled })`** a list the reader puts in order by dragging
a row or pressing the arrows beside it. `order()`, `items()`, `set(list)`, `enable(on)`,
`onChange(fn)`.

**`Kit.sim({ mount, state, step, draw, fps, width, height, label })`** a stepped model with a
play control. `step(state)` returns the next state, `draw(context, state, size)` paints it.

**`Kit.theme`** `color(name)` and `tint(depth)` for a value a style has to set from code.

## What the app does with what you send

`Kit.bridge.answer(value)` posts the value and the app compares it with the Task. For an
`app-result` Task the comparison is a deep equality against the `answer` in the Task, so
send the same shape you wrote there, and keep it small: a number, a string, or a flat
object. For an `assertions-pass` Task, send `{ passed: [...] }` from `code.run()`, and the
app passes the Task only on the assertion names the Task itself declared.

You never decide the outcome and you never need to. Report, and let the app judge.

**The signatures above are the whole toolkit.** There is nothing else in it, and this page is
the reference. Do not read `toolkit/kit.js`: it is nine hundred lines, reading it costs more
than the mini-app you are writing, and it will tell you exactly what is written here.

## When the toolkit is missing something

Write the widget anyway, and say in your run which one was missing. A gap is a defect in the
toolkit and never a reason for one Course to look unlike the rest.

That is about widgets every subject needs. Something only your subject needs is not a gap:
it is this Course's library. Put it in `lib/`, list it under `library` in `course.json`, and
hang one name on `window` per file. The app inlines the toolkit first, then the library in
the order you listed, then the app, so a library file may use the toolkit and an app may use
both. Nothing outside this Course can see any of it.

## The toolkit is already there

`toolkit/` is in the folder at the version `course.json` must record. Do not write to it and
do not write your own copy.
