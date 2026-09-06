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

The signatures above are the whole toolkit. `toolkit/kit.js` is in the folder you are
working in if you need to read one.

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
