# The toolkit, version 1.1.0

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

## Kit.ask

`Kit.ask(service, request)` asks the host a question and returns a promise.

A Mini-app is one file with no network and no second script, so a body of rules cannot live
inside it. A Service is that body of rules, written once in the host and shared by every
Course that asks for it. The host answers only for a Service the Course declared, so add the
Service to `course.json` as well as calling it:

```json
"services": [{ "id": "chess", "version": "1.0.0" }]
```

The promise rejects when the Course did not declare the Service, when this build does not
have it, or when the request makes no sense. Say so on the screen; do not fail silently.

### The chess service

```js
Kit.ask('chess', { op: 'moves', fen: position, from: 'e2' })
```

| `op` | Sends | Returns |
|---|---|---|
| `status` | `fen` | `{ fen, status }` |
| `moves` | `fen`, optional `from` | `{ moves, status }`, each move `{ from, to, promotion, san }` |
| `move` | `fen`, `from`, `to`, optional `promotion` | `{ fen, move, capture, status }`, or rejects when the move is not legal |
| `best` | `fen`, optional `depth` | `{ move, fen, status }`, `move` is null when the game is over |

`status` is `{ turn, check, checkmate, stalemate, moves, over, result }`. A position is
always a FEN, so the Service holds nothing between calls.

The opponent searches three moves ahead at most. It is a teaching opponent, not a strong
one: what makes a chess Course good is the position the Constructor chose. Castling, en
passant, promotion, check, mate and stalemate are all there. The fifty-move rule and
threefold repetition are not.

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

**`Kit.editor({ mount, start, exports, assertions, label, runLabel })`**
A code editor with the Constructor's assertions beside it. This is what `assertions-pass`
runs on.

`exports` names what the learner's code must define. Each assertion is
`{ name, test(api) }`, where `api` holds those names. A test returns a value or throws; a
throw is shown beside the assertion, so throw with a message that says what was wrong.
`run()` runs them and returns the names that passed, which is what `answer` sends.

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

**`Kit.steps({ mount, steps })`**
A walkthrough advanced one beat at a time, for a derivation or an algorithm trace. Each step
is `{ title, body }`. Returns `index()`, `go(n)`, `onStep(fn)`.

**`Kit.board({ mount, fen, orientation, label, rules, opponent, play, enabled })`**
A chessboard. It draws from the FEN and asks the chess service for everything else, so a
Course that uses it must declare that Service. Returns `fen()`, `set(fen)`, `status()`,
`history()`, `mark(squares)`, `enable(on)`, `reset()`, `onMove(fn)`.

`onMove` gets `{ from, to, san, fen, status, by }`, where `by` is `'you'` or `'opponent'`.

- `rules: false` turns a board into a picture. It reports a drag and enforces nothing.
- `opponent: { moves: ['e5', 'Nc6'] }` plays the replies you wrote, in order, in standard
  notation or as `e7e5`. A written reply that is not legal shows as an error under the board,
  so write the line the learner is being led down.
- `opponent: { depth: 2 }` lets the service play instead.
- `play: 'black'` sets which side is the learner's when there is an opponent. With no
  opponent the learner moves both sides, which is what a study position wants.
- `enabled: false` freezes the board. Use it for a demonstration, and drive it with `set`.

**`Kit.sim({ mount, state, step, draw, fps, width, height, label })`**
A stepped model with a play control. `step(state)` returns the next state and `draw(context,
state, size)` paints it on a canvas. The toolkit supplies the loop and the transport.

## When the toolkit is missing something

Write the widget anyway, and say in the run which one was missing. A gap is a defect in the
toolkit, to be filled in the next version, and never a reason for one Course to look unlike
the rest. Known gaps: a multiple-choice and an accepted-answers control for use inside an
activity, numeric entry with units, a sortable list, a table, an audio and a video player,
and a drawing surface. Plain multiple choice needs no Mini-app; the host draws it.

The same applies to a Service. A Course that needs rules the host does not have is a gap in
the app, not a reason to smuggle a rules engine into a Mini-app.

## Pinning

A copy of the toolkit lives at `toolkit/` inside every Course that has Mini-apps, and
`course.json` records `toolkitVersion`. The host injects the Course's copy, never its own, so
a Course keeps behaving the way it was built. The two must agree, and the parser says so when
they do not.
