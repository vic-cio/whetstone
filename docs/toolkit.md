# The toolkit, version 1.2.0

Everything a Mini-app is built from. The host inlines `kit.css` and `kit.js` into the frame
ahead of the Mini-app's own markup, so `Kit` always exists and nothing has to be fetched.

Two rules cover most mistakes.

- **A Mini-app reports; it never decides.** Nothing here returns a pass or a fail. The host
  holds the Task and judges what the Mini-app sent.
- **A Mini-app writes no colours and no faces.** Use the tokens. This is what keeps every
  Course looking like the same product, and it is what makes an activity follow the theme
  with no code of its own.

## What a Mini-app looks like

One `index.html` with everything inline, no `<head>`, no external reference of any kind.

```html
<div id="app"></div>
<script>
  var pick = Kit.slider({ mount: '#app', label: 'x', min: 0, max: 10, value: 3 })
  Kit.bridge.action('Answer', function () { return pick.value() })
  Kit.bridge.ready()
</script>
```

Every widget takes `mount`, a selector or an element, and appends itself there.

## Kit.bridge

The only way out of the frame. A Mini-app never calls `postMessage`.

| Call | What it does |
|---|---|
| `ready()` | Say the activity has drawn. Call it last. Until it arrives the host says the activity did not start |
| `answer(value)` | Report what the user did. The host compares it with the Task |
| `review(png, state)` | Ask for a person to look at this. `png` is a data URL the Mini-app drew itself |
| `resize()` | Report the frame's height. This also happens on its own as content changes |
| `action(label, produce, options)` | The answer button. Returns `{ enable(on), say(text) }` |

`action` is how anything leaves the frame. `produce` returns the value to send, or `null` to
send nothing and show `options.empty` instead. Pass `options.review: true` and `produce`
returns `{ png, state }` for a review rather than an answer. A Mini-app cannot answer, and
cannot start a review, without the user pressing this button.

## The Course's own library

The toolkit is how a Mini-app plugs in. It is the same in every Course, and it carries no
subject: no chess, no circuits, no music. What a Course is about goes in the Course.

List the files in `course.json` and put them in `lib/`. The host inlines them into every
Mini-app in that Course, in this order, after the toolkit and before the app.

```json
"library": ["chess.js", "board.css", "board.js"]
```

So a library file may use the toolkit, and an app may use both. Hang one name on `window`
per file and nothing else: a library shares a frame with the toolkit and with every other
library file in the Course. Nothing outside the Course can see any of it.

This is how to add a feature the toolkit does not have. Do not ask for it to be added to the
toolkit unless every subject would want it.

## Kit.theme

`Kit.theme.color('amber')` and `Kit.theme.tint('construct')` return values a style can use.
Use them when a style has to be set from code. Everything else should be a class from
`kit.css`: `k-label`, `k-btn`, `k-btn k-quiet`.

## The widgets

Each returns a small object. `onChange` and its relatives take a function and call it on
every change.

**`Kit.slider({ mount, label, min, max, step, value, format })`**
A dragged parameter with a live readout. Returns `value()`, `set(v)`, `onChange(fn)`.

**`Kit.plot({ mount, domain, range, height, label })`**
Axes and curves. `curve(fn)` adds a line, and the second one is drawn as the amber dashed
line, which is the convention for a tangent or a comparison. `mark(x, y)` places the point,
`marks(list)` places several, `readout(text)` writes the line beneath, `onPick(fn)` reports
where the user clicked, in data coordinates. `range` is worth setting whenever a curve can
run away, because the bounds are otherwise taken from the curves themselves.

**`Kit.pieces({ mount, pieces, slots, bankLabel })`**
Draggable pieces and named slots: ordering, matching, labelling, building an expression.
Pieces move by dragging or by a click on the piece and a click on the slot. `value()` returns
the slot each piece sits in, in the order the pieces were declared, with `null` for one that
is still in the bank. `complete()` is true once every piece is placed.

**`Kit.hotspot({ mount, src, alt, width, height, regions })`**
Click to mark a place. With `regions`, `value()` returns the id of the region that was hit.
Without them it returns `{ x, y }` as fractions of the width and the height.

**`Kit.editor({ mount, start, exports, assertions, label, runLabel, lang })`**
A code editor with the Constructor's assertions beside it. This is what `assertions-pass`
runs on.

`exports` names what the learner's code must define. Each assertion is
`{ name, test(api) }`, where `api` holds those names. A test returns a value or throws; a
throw is shown beside the assertion, so throw with a message that says what was wrong.
`run()` runs them and returns the names that passed, which is what `answer` sends. `lang`
defaults to `'js'` — see **Languages** below.

```js
var code = Kit.editor({
  mount: '#app',
  start: 'function double(n) {\n  return n\n}',
  exports: ['double'],
  assertions: [
    { name: 'doubles a number', test: function (api) {
      if (api.double(3) !== 6) throw new Error('double(3) gave ' + api.double(3))
      return true
    } },
  ],
})
Kit.bridge.action('Check my code', function () { return { passed: code.run() } })
```

The assertion names in the Task and the names here must match exactly. The host passes only
the ones it declared, so a Mini-app cannot pass by naming an assertion the Task never asked
for.

**`Kit.codeblock({ mount, start, label, runLabel, lang })`**
A runnable code sample with real output beneath it — no assertions, nothing graded, nothing
sent to the host. `run()` returns `{ ok, log, error }`: `log` is what the code printed
(`console.log` is captured), `error` is set only when it threw. Use it to let the reader run
something next to your explanation, rather than a static snippet they take on faith.

```js
Kit.codeblock({
  mount: '#app',
  lang: 'js',
  start: "console.log('hello, ' + name)",
})
```

## Languages

`Kit.editor` and `Kit.codeblock` both call `Kit.run(lang, source, options)`, which actually
executes the code rather than describing it. `lang: 'js'` is built in and always works. Any
other language runs through a runtime the host fetched once at build time, from a short
allowlist, and proved works before it shipped (docs/adr/0025) — `writing-a-mini-app/SKILL.md`
has the current state of which languages that pipeline actually supplies.

**`Kit.steps({ mount, steps })`**
A walkthrough advanced one beat at a time, for a derivation or an algorithm trace. Each step
is `{ title, body }`. Returns `index()`, `go(n)`, `onStep(fn)`.

**`Kit.order({ mount, items, label, enabled })`**
A list the reader puts in order, by dragging a row or by pressing the arrows beside it.
`items` is a list of strings. Returns `order()` as indexes into `items`, `items()` as the
strings themselves, `set(list)`, `enable(on)`, and `onChange(fn)`. `onChange` gets
`{ order, items }`. The widget never says whether the order is right; report it and let the
host judge.

**`Kit.sim({ mount, state, step, draw, fps, width, height, label })`**
A stepped model with a play control. `step(state)` returns the next state and `draw(context,
state, size)` paints it on a canvas. The toolkit supplies the loop and the transport.

## When the toolkit is missing something

Write the widget anyway, and say in the run which one was missing. A gap is a defect in the
toolkit, to be filled in the next version, and never a reason for one Course to look unlike
the rest. Known gaps: a multiple-choice and an accepted-answers control for use inside an
activity, numeric entry with units, a table, an audio and a video player,
and a drawing surface. Plain multiple choice needs no Mini-app; the host draws it.

This is about widgets every subject needs. Something only one subject needs is not a gap in
the toolkit: it is the Course's library. `fixtures/courses/forks-and-pins/lib/` is a worked
example, a chessboard and a set of rules, neither of which the app knows anything about.

## Pinning

A copy of the toolkit lives at `toolkit/` inside every Course that has Mini-apps, and
`course.json` records `toolkitVersion`. The host injects the Course's copy, never its own, so
a Course keeps behaving the way it was built. The two must agree, and the parser says so when
they do not.
