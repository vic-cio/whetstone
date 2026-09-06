/* whetstone-toolkit 1.1.0
 *
 * The only library a Mini-app is given. The host inlines this file and kit.css into the
 * sandboxed frame ahead of the Mini-app's own markup, because the sandbox forbids
 * fetching anything (docs/adr/0005, docs/adr/0014).
 *
 * Two rules hold everywhere in here:
 *
 *  - A Mini-app reports; it never decides. Nothing in this file returns a pass or a fail.
 *    `Kit.editor` runs the Constructor's assertions and reports which passed by name, and
 *    the host compares that list against the Task before anything counts.
 *  - `Kit.bridge` is the only way out. A Mini-app never calls `postMessage` itself, so the
 *    protocol is one implementation rather than one per activity.
 */

window.Kit = (function () {
  'use strict'

  var VERSION = '1.1.0'

  // ------------------------------------------------------------ small helpers

  function mount(where) {
    if (!where) return document.body
    if (typeof where === 'string') {
      var found = document.querySelector(where)
      if (!found) throw new Error('Kit: no element matches "' + where + '"')
      return found
    }
    return where
  }

  function el(tag, className, text) {
    var node = document.createElement(tag)
    if (className) node.className = className
    if (text !== undefined && text !== null) node.textContent = String(text)
    return node
  }

  function svg(tag, attributes) {
    var node = document.createElementNS('http://www.w3.org/2000/svg', tag)
    for (var name in attributes) node.setAttribute(name, String(attributes[name]))
    return node
  }

  function callbacks() {
    var list = []
    return {
      add: function (fn) { if (typeof fn === 'function') list.push(fn) },
      fire: function (value) { for (var i = 0; i < list.length; i += 1) list[i](value) },
    }
  }

  // ------------------------------------------------------------ Kit.bridge

  var framed = window.parent !== window

  function post(message) {
    if (!framed) return
    // The frame has an opaque origin, so it cannot name the host's origin and must post
    // to "*". The host checks the source window instead, which is the check that holds.
    message.kit = VERSION
    window.parent.postMessage(message, '*')
  }

  var lastHeight = 0
  function measure() {
    // The body, not the document element: the root's scroll height never drops below the
    // frame it is in, so measuring that would let a frame grow and never shrink.
    var box = document.body.getBoundingClientRect()
    var height = Math.max(Math.ceil(box.height + box.top * 2), 40)
    if (height === lastHeight) return
    lastHeight = height
    post({ type: 'resize', height: height })
  }

  var bridge = {
    /** The Mini-app has drawn itself and is ready to be used. */
    ready: function () {
      measure()
      post({ type: 'ready' })
    },

    /** Report what the user did. The host compares it against the Task and decides. */
    answer: function (value) {
      post({ type: 'answer', value: value })
    },

    /**
     * Ask for a person to look at this. `png` is a data URL the Mini-app drew from its own
     * canvas. The host writes it outside the Course and starts the review; the Mini-app
     * never reaches an agent, and a review only ever starts from the user's button.
     */
    review: function (png, state) {
      post({ type: 'review', png: png || null, state: state === undefined ? null : state })
    },

    /** Tell the host how tall the frame is. This also happens on its own as content changes. */
    resize: function () {
      lastHeight = 0
      measure()
    },

    /**
     * The answer button. Every message that records something starts with a press here, so
     * a Mini-app cannot answer or ask for a review on its own.
     */
    action: function (label, produce, options) {
      var settings = options || {}
      var row = el('div', 'k-action')
      var button = el('button', 'k-btn', label)
      button.type = 'button'
      var said = el('span', 'k-said')
      row.appendChild(button)
      row.appendChild(said)
      mount(settings.mount).appendChild(row)

      button.addEventListener('click', function () {
        var value = produce()
        if (value === undefined || value === null) {
          said.textContent = settings.empty || 'Nothing to send yet'
          return
        }
        said.textContent = ''
        if (settings.review) bridge.review(value.png, value.state)
        else bridge.answer(value)
      })

      measure()
      return {
        enable: function (on) { button.disabled = !on },
        say: function (text) { said.textContent = text || '' },
      }
    },
  }

  // Content that grows after a widget draws still gets a correct frame height. The body
  // is what is watched, for the same reason it is what is measured.
  if (typeof ResizeObserver === 'function') {
    new ResizeObserver(function () { measure() }).observe(document.body)
  }

  // ------------------------------------------------------------ Kit.ask

  var asked = {}
  var askCount = 0

  /**
   * Ask the host for something a sealed frame cannot carry, and get a promise back.
   *
   * A Mini-app is one file with no network and no second script, so a body of rules such
   * as chess cannot live in here: every Course would carry its own, and each one would be
   * wrong in a different way. A Service is written once in the host and shared instead
   * (docs/adr/0018).
   *
   * The host answers only for a Service the Course declared in `course.json`. Anything
   * else is refused, and the promise rejects with the reason.
   */
  function ask(service, request) {
    return new Promise(function (resolve, reject) {
      if (!framed) {
        reject(new Error('Kit.ask needs the host, and this page has none'))
        return
      }
      askCount += 1
      var id = askCount
      var timer = setTimeout(function () {
        if (!asked[id]) return
        delete asked[id]
        reject(new Error('the "' + service + '" service did not answer'))
      }, 10000)
      asked[id] = function (message) {
        clearTimeout(timer)
        if (message.ok) resolve(message.value)
        else reject(new Error(message.error || 'the "' + service + '" service refused'))
      }
      post({ type: 'ask', ask: id, service: service, request: request })
    })
  }

  window.addEventListener('message', function (event) {
    // Only the host is above a sealed frame, and its origin cannot be named from in here,
    // so the sending window is the check that holds. This is the same reasoning as `post`.
    if (event.source !== window.parent) return
    var message = event.data
    if (!message || message.type !== 'told') return
    var waiting = asked[message.ask]
    if (!waiting) return
    delete asked[message.ask]
    waiting(message)
  })

  // ------------------------------------------------------------ Kit.theme

  var theme = {
    version: VERSION,
    /** A palette colour by name, as a value a style can use. Never a literal colour. */
    color: function (name) { return 'var(--kit-' + name + ')' },
    /** The tint for a Depth on the fixed five-point scale. */
    tint: function (depth) {
      var scale = { recall: 1, apply: 2, construct: 3, transfer: 4, project: 5 }
      return 'var(--kit-d' + (scale[depth] || 1) + ')'
    },
  }

  // ------------------------------------------------------------ Kit.slider

  function slider(options) {
    var settings = options || {}
    var min = settings.min === undefined ? 0 : settings.min
    var max = settings.max === undefined ? 1 : settings.max
    var step = settings.step === undefined ? (max - min) / 100 : settings.step
    var format = settings.format || function (value) { return value.toFixed(2) }
    var changed = callbacks()

    var root = el('div', 'k-slider')
    var top = el('div', 'k-top')
    var label = el('span', 'k-label', settings.label || '')
    var readout = el('span', 'k-read')
    var input = document.createElement('input')
    input.type = 'range'
    input.min = String(min)
    input.max = String(max)
    input.step = String(step)
    input.value = String(settings.value === undefined ? min : settings.value)
    if (settings.label) input.setAttribute('aria-label', settings.label)

    top.appendChild(label)
    top.appendChild(readout)
    root.appendChild(top)
    root.appendChild(input)
    mount(settings.mount).appendChild(root)

    function value() { return Number(input.value) }
    function draw() { readout.textContent = format(value()) }

    input.addEventListener('input', function () {
      draw()
      changed.fire(value())
    })
    draw()

    return {
      value: value,
      set: function (next) { input.value = String(next); draw(); changed.fire(value()) },
      onChange: function (fn) { changed.add(fn); fn(value()) },
    }
  }

  // ------------------------------------------------------------ Kit.plot

  function plot(options) {
    var settings = options || {}
    var domain = settings.domain || [-1, 1]
    var height = settings.height || 240
    var width = 620
    var pad = 30
    var picked = callbacks()

    var root = el('div', 'k-plot')
    var frame = svg('svg', { viewBox: '0 0 ' + width + ' ' + height, role: 'img' })
    if (settings.label) frame.setAttribute('aria-label', settings.label)
    var readout = el('span', 'k-readout')
    root.appendChild(frame)
    root.appendChild(readout)
    mount(settings.mount).appendChild(root)

    var range = settings.range || null
    var curves = []
    var marks = []

    function bounds() {
      if (range) return range
      var low = Infinity
      var high = -Infinity
      for (var c = 0; c < curves.length; c += 1) {
        for (var i = 0; i <= 200; i += 1) {
          var y = curves[c].fn(domain[0] + ((domain[1] - domain[0]) * i) / 200)
          if (isFinite(y)) {
            if (y < low) low = y
            if (y > high) high = y
          }
        }
      }
      if (!isFinite(low) || !isFinite(high) || low === high) return [-1, 1]
      var margin = (high - low) * 0.12
      return [low - margin, high + margin]
    }

    function toX(x) { return pad + ((x - domain[0]) / (domain[1] - domain[0])) * (width - pad * 2) }
    function toY(y, span) { return height - pad - ((y - span[0]) / (span[1] - span[0])) * (height - pad * 2) }
    function fromX(px) { return domain[0] + ((px - pad) / (width - pad * 2)) * (domain[1] - domain[0]) }

    function draw() {
      while (frame.firstChild) frame.removeChild(frame.firstChild)
      var span = bounds()

      var zeroY = span[0] <= 0 && span[1] >= 0 ? toY(0, span) : height - pad
      var zeroX = domain[0] <= 0 && domain[1] >= 0 ? toX(0) : pad
      frame.appendChild(svg('line', { class: 'k-axis', x1: pad, y1: zeroY, x2: width - pad, y2: zeroY }))
      frame.appendChild(svg('line', { class: 'k-axis', x1: zeroX, y1: pad, x2: zeroX, y2: height - pad }))

      var labels = [domain[0], domain[1]]
      for (var t = 0; t < labels.length; t += 1) {
        var tick = svg('text', { class: 'k-tick', x: toX(labels[t]), y: height - pad + 13, 'text-anchor': 'middle' })
        tick.textContent = String(labels[t])
        frame.appendChild(tick)
      }

      for (var c = 0; c < curves.length; c += 1) {
        var points = []
        for (var i = 0; i <= 300; i += 1) {
          var x = domain[0] + ((domain[1] - domain[0]) * i) / 300
          var y = curves[c].fn(x)
          points.push((i === 0 ? 'M' : 'L') + toX(x).toFixed(2) + ' ' + toY(y, span).toFixed(2))
        }
        frame.appendChild(svg('path', { class: 'k-curve' + (c > 0 ? ' k-second' : ''), d: points.join(' ') }))
      }

      for (var m = 0; m < marks.length; m += 1) {
        frame.appendChild(svg('circle', { class: 'k-mark', cx: toX(marks[m][0]), cy: toY(marks[m][1], span), r: 4 }))
      }
    }

    frame.addEventListener('click', function (event) {
      var box = frame.getBoundingClientRect()
      var x = fromX(((event.clientX - box.left) / box.width) * width)
      picked.fire(x)
    })

    return {
      curve: function (fn) { curves.push({ fn: fn }); draw(); return this },
      mark: function (x, y) { marks = [[x, y]]; draw(); return this },
      marks: function (list) { marks = list || []; draw(); return this },
      clear: function () { curves = []; marks = []; draw(); return this },
      readout: function (text) { readout.textContent = text || '' },
      onPick: function (fn) { picked.add(fn) },
    }
  }

  // ------------------------------------------------------------ Kit.pieces

  function pieces(options) {
    var settings = options || {}
    var list = settings.pieces || []
    var slots = settings.slots || []
    var changed = callbacks()
    var placed = {}
    var held = null

    var root = el('div', 'k-pieces')
    var bankLabel = el('div', 'k-label', settings.bankLabel || 'Pieces')
    var bank = el('div', 'k-bank')
    var slotBox = el('div', 'k-slots')
    root.appendChild(bankLabel)
    root.appendChild(bank)
    root.appendChild(slotBox)
    mount(settings.mount).appendChild(root)

    function value() {
      return list.map(function (piece) { return placed[piece.id] || null })
    }

    function hold(id) {
      held = held === id ? null : id
      draw()
    }

    function put(slotId) {
      if (!held) return
      placed[held] = slotId
      held = null
      draw()
      changed.fire(value())
    }

    function pieceNode(piece) {
      var node = el('button', 'k-piece' + (held === piece.id ? ' k-held' : ''), piece.label)
      node.type = 'button'
      node.draggable = true
      node.addEventListener('click', function () { hold(piece.id) })
      node.addEventListener('dragstart', function (event) {
        held = piece.id
        if (event.dataTransfer) event.dataTransfer.setData('text/plain', piece.id)
      })
      return node
    }

    function draw() {
      while (bank.firstChild) bank.removeChild(bank.firstChild)
      while (slotBox.firstChild) slotBox.removeChild(slotBox.firstChild)

      for (var i = 0; i < list.length; i += 1) {
        if (!placed[list[i].id]) bank.appendChild(pieceNode(list[i]))
      }
      if (!bank.firstChild) bank.appendChild(el('span', 'k-hint', 'Every piece is placed'))

      for (var s = 0; s < slots.length; s += 1) {
        (function (slot) {
          var node = el('div', 'k-slot')
          node.appendChild(el('div', 'k-label', slot.label))
          var drop = el('div', 'k-drop')
          var any = false
          for (var p = 0; p < list.length; p += 1) {
            if (placed[list[p].id] === slot.id) {
              any = true
              drop.appendChild(takeBack(list[p]))
            }
          }
          if (!any) drop.appendChild(el('span', 'k-hint', held ? 'Click to place it here' : 'Empty'))
          node.appendChild(drop)
          node.addEventListener('click', function () { put(slot.id) })
          node.addEventListener('dragover', function (event) {
            event.preventDefault()
            node.classList.add('k-over')
          })
          node.addEventListener('dragleave', function () { node.classList.remove('k-over') })
          node.addEventListener('drop', function (event) {
            event.preventDefault()
            node.classList.remove('k-over')
            put(slot.id)
          })
          slotBox.appendChild(node)
        })(slots[s])
      }
    }

    function takeBack(piece) {
      var node = el('button', 'k-piece', piece.label)
      node.type = 'button'
      node.addEventListener('click', function (event) {
        event.stopPropagation()
        delete placed[piece.id]
        draw()
        changed.fire(value())
      })
      return node
    }

    draw()
    return {
      value: value,
      /** True once every piece sits in a slot. */
      complete: function () { return list.every(function (piece) { return Boolean(placed[piece.id]) }) },
      onChange: function (fn) { changed.add(fn) },
    }
  }

  // ------------------------------------------------------------ Kit.hotspot

  function hotspot(options) {
    var settings = options || {}
    var regions = settings.regions || null
    var picked = callbacks()
    var at = null

    var root = el('div', 'k-hotspot')
    var surface = el('div', 'k-surface')
    var pin = el('div', 'k-pin')
    pin.style.display = 'none'

    if (settings.src) {
      var image = document.createElement('img')
      image.src = settings.src
      image.alt = settings.alt || ''
      root.appendChild(image)
    } else {
      var blank = el('div')
      blank.style.width = (settings.width || 480) + 'px'
      blank.style.height = (settings.height || 240) + 'px'
      root.appendChild(blank)
    }
    root.appendChild(surface)
    root.appendChild(pin)
    mount(settings.mount).appendChild(root)

    surface.addEventListener('click', function (event) {
      var box = surface.getBoundingClientRect()
      var x = (event.clientX - box.left) / box.width
      var y = (event.clientY - box.top) / box.height
      pin.style.left = x * 100 + '%'
      pin.style.top = y * 100 + '%'
      pin.style.display = 'block'
      at = { x: x, y: y }
      picked.fire(value())
    })

    function value() {
      if (!at) return null
      if (!regions) return { x: Number(at.x.toFixed(4)), y: Number(at.y.toFixed(4)) }
      for (var i = 0; i < regions.length; i += 1) {
        var region = regions[i]
        if (at.x >= region.x && at.x <= region.x + region.w && at.y >= region.y && at.y <= region.y + region.h) {
          return region.id
        }
      }
      return null
    }

    return { value: value, onPick: function (fn) { picked.add(fn) } }
  }

  // ------------------------------------------------------------ Kit.editor

  /**
   * A code editor with the Constructor's assertions beside it. This is what an
   * `assertions-pass` Task runs on.
   *
   * The learner's code runs in this frame, which has no network, no storage and no reach
   * into the host, so running it costs nothing that the Mini-app's own script did not
   * already have (docs/adr/0016).
   */
  function editor(options) {
    var settings = options || {}
    var names = settings.exports || []
    var assertions = settings.assertions || []
    var ran = callbacks()
    var results = []

    var root = el('div', 'k-editor')
    var area = document.createElement('textarea')
    area.spellcheck = false
    area.value = settings.start || ''
    area.setAttribute('aria-label', settings.label || 'Your code')
    // Open at the size of the code it starts with, so the learner is not reading their
    // own function through a slot.
    area.rows = Math.min(Math.max(area.value.split('\n').length + 1, 8), 26)

    var bar = el('div', 'k-bar')
    var run = el('button', 'k-btn k-quiet', settings.runLabel || 'Run')
    run.type = 'button'
    var list = el('ul', 'k-asserts')

    bar.appendChild(run)
    root.appendChild(area)
    root.appendChild(bar)
    root.appendChild(list)
    mount(settings.mount).appendChild(root)

    // A tab belongs in the code, not in the next control.
    area.addEventListener('keydown', function (event) {
      if (event.key !== 'Tab') return
      event.preventDefault()
      var start = area.selectionStart
      area.value = area.value.slice(0, start) + '  ' + area.value.slice(area.selectionEnd)
      area.selectionStart = area.selectionEnd = start + 2
    })

    function build() {
      var give = names.map(function (name) {
        return name + ': typeof ' + name + ' === "undefined" ? undefined : ' + name
      })
      var body = '"use strict";\n' + area.value + '\n;return {' + give.join(',') + '};'
      return new Function(body)()
    }

    function evaluate() {
      results = []
      var api = null
      var built = null
      try {
        api = build()
      } catch (error) {
        built = String(error && error.message ? error.message : error)
      }
      for (var i = 0; i < assertions.length; i += 1) {
        var assertion = assertions[i]
        if (built !== null) {
          results.push({ name: assertion.name, passed: false, why: built })
          continue
        }
        try {
          var outcome = assertion.test(api)
          results.push({ name: assertion.name, passed: outcome !== false, why: '' })
        } catch (error) {
          results.push({ name: assertion.name, passed: false, why: String(error && error.message ? error.message : error) })
        }
      }
      draw()
      ran.fire(results)
      return results
    }

    function draw() {
      while (list.firstChild) list.removeChild(list.firstChild)
      for (var i = 0; i < assertions.length; i += 1) {
        var found = results[i]
        var item = el('li', found ? (found.passed ? 'k-pass' : 'k-fail') : '')
        item.appendChild(document.createTextNode(assertions[i].name))
        if (found && !found.passed && found.why) {
          item.appendChild(el('span', 'k-why', '  ' + found.why))
        }
        list.appendChild(item)
      }
    }

    run.addEventListener('click', function () { evaluate() })
    draw()

    return {
      /** Run the assertions and report which passed, by name. Never a pass or a fail. */
      run: function () {
        evaluate()
        return results.filter(function (found) { return found.passed }).map(function (found) { return found.name })
      },
      code: function () { return area.value },
      onRun: function (fn) { ran.add(fn) },
    }
  }

  // ------------------------------------------------------------ Kit.steps

  function steps(options) {
    var settings = options || {}
    var list = settings.steps || []
    var moved = callbacks()
    var index = 0

    var root = el('div', 'k-steps')
    var title = el('div', 'k-title')
    var body = el('div', 'k-body')
    var bar = el('div', 'k-bar')
    var back = el('button', 'k-btn k-quiet', settings.backLabel || 'Back')
    var next = el('button', 'k-btn', settings.nextLabel || 'Next')
    back.type = 'button'
    next.type = 'button'
    var count = el('span', 'k-count')

    bar.appendChild(back)
    bar.appendChild(next)
    bar.appendChild(count)
    root.appendChild(title)
    root.appendChild(body)
    root.appendChild(bar)
    mount(settings.mount).appendChild(root)

    function draw() {
      var step = list[index] || { title: '', body: '' }
      title.textContent = step.title || ''
      body.textContent = step.body || ''
      count.textContent = index + 1 + ' of ' + list.length
      back.disabled = index === 0
      next.disabled = index === list.length - 1
      moved.fire(index)
    }

    back.addEventListener('click', function () { if (index > 0) { index -= 1; draw() } })
    next.addEventListener('click', function () { if (index < list.length - 1) { index += 1; draw() } })
    draw()

    return {
      index: function () { return index },
      go: function (to) { index = Math.max(0, Math.min(list.length - 1, to)); draw() },
      onStep: function (fn) { moved.add(fn); fn(index) },
    }
  }

  // ------------------------------------------------------------ Kit.sim

  function sim(options) {
    var settings = options || {}
    var width = settings.width || 620
    var height = settings.height || 260
    var start = settings.state
    var stepped = callbacks()
    var state = clone(start)
    var timer = null

    function clone(value) { return JSON.parse(JSON.stringify(value === undefined ? null : value)) }

    var root = el('div', 'k-sim')
    var canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    if (settings.label) canvas.setAttribute('aria-label', settings.label)
    var bar = el('div', 'k-bar')
    var play = el('button', 'k-btn', 'Play')
    var once = el('button', 'k-btn k-quiet', 'Step')
    var reset = el('button', 'k-btn k-quiet', 'Reset')
    play.type = once.type = reset.type = 'button'

    bar.appendChild(play)
    bar.appendChild(once)
    bar.appendChild(reset)
    root.appendChild(canvas)
    root.appendChild(bar)
    mount(settings.mount).appendChild(root)

    var context = canvas.getContext('2d')

    function paint() {
      context.clearRect(0, 0, width, height)
      if (settings.draw) settings.draw(context, state, { width: width, height: height })
    }

    function advance() {
      state = settings.step ? settings.step(state) : state
      paint()
      stepped.fire(state)
    }

    function stop() {
      if (timer !== null) clearInterval(timer)
      timer = null
      play.textContent = 'Play'
    }

    play.addEventListener('click', function () {
      if (timer !== null) { stop(); return }
      play.textContent = 'Pause'
      timer = setInterval(advance, 1000 / (settings.fps || 8))
    })
    once.addEventListener('click', function () { stop(); advance() })
    reset.addEventListener('click', function () { stop(); state = clone(start); paint() })

    paint()
    return {
      state: function () { return state },
      play: function () { if (timer === null) play.click() },
      pause: stop,
      onStep: function (fn) { stepped.add(fn) },
    }
  }

  // ------------------------------------------------------------ Kit.board

  /**
   * A chessboard.
   *
   * The widget draws and the host rules. It reads the placement field of a FEN so it can
   * paint without asking anything, and it asks the chess Service for everything else:
   * which moves are legal, what a move produces, and whether the game is over. That split
   * is why every chess Course looks and behaves the same way (docs/adr/0018).
   *
   * The opponent is either written down by the Constructor, as a list of replies, or
   * played by the Service. Neither of them is an agent, and neither costs anything.
   */

  var GLYPH = { k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' }
  var BOARD_FILES = 'abcdefgh'
  var START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'

  var squareName = function (index) {
    return BOARD_FILES.charAt(index % 8) + String(8 - Math.floor(index / 8))
  }
  var squareIndex = function (name) {
    return (8 - Number(name.charAt(1))) * 8 + BOARD_FILES.indexOf(name.charAt(0))
  }
  var fenTurn = function (fen) {
    return String(fen).split(/\s+/)[1] === 'b' ? 'b' : 'w'
  }

  /** The placement field only. The rules stay in the host; this just says what to draw. */
  function fenPlacement(fen) {
    var rows = String(fen).split(/\s+/)[0].split('/')
    var placed = []
    for (var r = 0; r < rows.length; r += 1) {
      var row = rows[r]
      for (var i = 0; i < row.length; i += 1) {
        var mark = row.charAt(i)
        if (mark >= '1' && mark <= '8') {
          for (var n = 0; n < Number(mark); n += 1) placed.push('')
        } else placed.push(mark)
      }
    }
    while (placed.length < 64) placed.push('')
    return placed
  }

  function board(options) {
    var settings = options || {}
    var moved = callbacks()

    var wrap = el('div', 'k-board')
    if (settings.label) wrap.appendChild(el('div', 'k-label', settings.label))
    var grid = el('div', 'k-grid')
    var say = el('div', 'k-boardsay')
    wrap.appendChild(grid)
    wrap.appendChild(say)
    mount(settings.mount).appendChild(wrap)

    var flipped = settings.orientation === 'black'
    var rules = settings.rules !== false
    var opponent = settings.opponent || null
    var start = settings.fen || START_FEN
    var fen = start
    var mine = settings.play === 'black' ? 'b' : settings.play === 'white' ? 'w' : fenTurn(start)

    var live = settings.enabled !== false
    var picked = -1
    var choices = []
    var targets = []
    var marked = []
    var last = null
    var history = []
    var state = null
    var scripted = 0
    var busy = false

    var cells = new Array(64)
    for (var d = 0; d < 64; d += 1) {
      var index = flipped ? 63 - d : d
      var shade = ((index % 8) + Math.floor(index / 8)) % 2 === 0 ? ' k-light' : ' k-dark'
      var cell = el('div', 'k-sq' + shade)
      // The square's name is on the element, so a board can be read from outside it.
      cell.setAttribute('data-square', squareName(index))
      cell.appendChild(el('span', 'k-man'))
      if (Math.floor(d / 8) === 7) cell.appendChild(el('span', 'k-file', BOARD_FILES.charAt(index % 8)))
      if (d % 8 === 0) cell.appendChild(el('span', 'k-rank', String(8 - Math.floor(index / 8))))
      cells[index] = cell
      grid.appendChild(cell)
      hook(cell, index)
    }

    function hook(cell, index) {
      cell.addEventListener('click', function () { touch(index) })
      cell.addEventListener('dragover', function (event) {
        if (picked >= 0) event.preventDefault()
      })
      cell.addEventListener('drop', function (event) {
        event.preventDefault()
        if (picked >= 0 && picked !== index) attempt(picked, index)
      })
      cell.querySelector('.k-man').addEventListener('dragstart', function (event) {
        if (!live || busy) { event.preventDefault(); return }
        // A drag starts by picking the piece up, which is the same act as clicking it.
        choose(index)
        if (picked !== index) event.preventDefault()
      })
    }

    function paint() {
      var placed = fenPlacement(fen)
      for (var i = 0; i < 64; i += 1) {
        var cell = cells[i]
        var man = cell.querySelector('.k-man')
        var piece = placed[i] || ''
        man.textContent = piece === '' ? '' : GLYPH[piece.toLowerCase()]
        man.className = 'k-man' + (piece === '' ? '' : piece === piece.toUpperCase() ? ' k-white' : ' k-black')
        man.draggable = piece !== '' && live
        cell.classList.toggle('k-pick', i === picked)
        cell.classList.toggle('k-target', targets.indexOf(i) >= 0)
        cell.classList.toggle('k-mark', marked.indexOf(i) >= 0)
        cell.classList.toggle('k-last', last !== null && (i === last.from || i === last.to))
      }
      measure()
    }

    function report(text, bad) {
      say.className = 'k-boardsay' + (bad ? ' k-bad' : '')
      if (text !== undefined) { say.textContent = text; measure(); return }
      if (!state) { say.textContent = ''; return }
      var line = history.length > 0 ? history[history.length - 1] + '   ' : ''
      if (state.checkmate) {
        say.textContent = line + 'Checkmate, ' + (state.result === 'white' ? 'white' : 'black') + ' wins'
      } else if (state.stalemate) {
        say.textContent = line + 'Stalemate'
      } else {
        say.textContent = line + (state.turn === 'w' ? 'White' : 'Black') + ' to move' + (state.check ? ', in check' : '')
      }
      measure()
    }

    function fail(cause) {
      busy = false
      report(cause.message, true)
    }

    function mayMove(piece) {
      if (piece === '') return false
      var colour = piece === piece.toUpperCase() ? 'w' : 'b'
      if (rules && colour !== fenTurn(fen)) return false
      // With an opponent in the game the learner has one colour. Without one the board is
      // a study position and both sides are the learner's to move.
      if (opponent && colour !== mine) return false
      return true
    }

    function clear() {
      picked = -1
      targets = []
      choices = []
    }

    function choose(index) {
      var piece = fenPlacement(fen)[index] || ''
      if (!mayMove(piece)) { clear(); paint(); return }
      picked = index
      targets = []
      choices = []
      paint()
      if (!rules) return
      ask('chess', { op: 'moves', fen: fen, from: squareName(index) }).then(function (answer) {
        if (picked !== index) return
        choices = answer.moves
        targets = answer.moves.map(function (move) { return squareIndex(move.to) })
        paint()
      }, fail)
    }

    function touch(index) {
      if (!live || busy) return
      if (picked >= 0 && targets.indexOf(index) >= 0) { attempt(picked, index); return }
      if (picked === index) { clear(); paint(); return }
      choose(index)
    }

    function attempt(from, to) {
      var names = { from: squareName(from), to: squareName(to) }
      if (!rules) {
        clear()
        paint()
        moved.fire({ from: names.from, to: names.to, san: '', fen: fen, status: state, by: 'you' })
        return
      }
      var ways = choices.filter(function (move) { return move.from === names.from && move.to === names.to })
      if (ways.length === 0) { clear(); paint(); return }
      clear()
      paint()
      if (ways.length === 1) { send(names.from, names.to, ways[0].promotion, 'you'); return }
      // More than one way to the same square is a pawn reaching the far rank.
      offer(ways, function (promotion) { send(names.from, names.to, promotion, 'you') })
    }

    function offer(ways, then) {
      var row = el('div', 'k-promote')
      ways.forEach(function (move) {
        var button = el('button', 'k-btn k-quiet', GLYPH[move.promotion])
        button.type = 'button'
        button.title = move.san
        button.addEventListener('click', function () {
          wrap.removeChild(row)
          then(move.promotion)
        })
        row.appendChild(button)
      })
      wrap.insertBefore(row, say)
      measure()
    }

    function send(from, to, promotion, by) {
      busy = true
      ask('chess', { op: 'move', fen: fen, from: from, to: to, promotion: promotion || '' }).then(
        function (answer) {
          busy = false
          fen = answer.fen
          state = answer.status
          last = { from: squareIndex(from), to: squareIndex(to) }
          history.push(answer.move.san)
          clear()
          paint()
          report()
          moved.fire({
            from: from,
            to: to,
            san: answer.move.san,
            fen: fen,
            status: state,
            by: by,
          })
          if (by === 'you') setTimeout(answerBack, 300)
        },
        fail,
      )
    }

    /** The opponent's reply: the Constructor's next written move, or the Service's. */
    function answerBack() {
      if (!opponent || !state || state.over) return
      if (opponent.moves) {
        var written = opponent.moves[scripted]
        if (written === undefined) return
        scripted += 1
        ask('chess', { op: 'moves', fen: fen }).then(function (answer) {
          var found = null
          answer.moves.forEach(function (move) {
            if (found) return
            if (move.san === written || move.from + move.to + move.promotion === written || move.from + move.to === written) {
              found = move
            }
          })
          if (!found) { fail(new Error('the written reply "' + written + '" is not legal here')); return }
          send(found.from, found.to, found.promotion, 'opponent')
        }, fail)
        return
      }
      ask('chess', { op: 'best', fen: fen, depth: opponent.depth || 2 }).then(function (answer) {
        if (!answer.move) return
        send(answer.move.from, answer.move.to, answer.move.promotion, 'opponent')
      }, fail)
    }

    function refresh() {
      if (!rules) { paint(); return }
      ask('chess', { op: 'status', fen: fen }).then(function (answer) {
        state = answer.status
        paint()
        report()
      }, fail)
    }

    paint()
    refresh()

    return {
      fen: function () { return fen },
      set: function (next) {
        fen = next || START_FEN
        clear()
        last = null
        refresh()
      },
      status: function () { return state },
      history: function () { return history.slice() },
      /** Point at squares. This says nothing about the rules; it draws a ring. */
      mark: function (list) {
        marked = (list || []).map(squareIndex)
        paint()
      },
      enable: function (on) {
        live = on !== false
        if (!live) clear()
        paint()
      },
      reset: function () {
        fen = start
        history = []
        scripted = 0
        last = null
        clear()
        refresh()
      },
      onMove: function (fn) { moved.add(fn) },
    }
  }

  return {
    version: VERSION,
    theme: theme,
    ask: ask,
    board: board,
    slider: slider,
    plot: plot,
    pieces: pieces,
    hotspot: hotspot,
    editor: editor,
    steps: steps,
    sim: sim,
    bridge: bridge,
  }
})()
