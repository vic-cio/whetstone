/* whetstone-toolkit 1.3.0
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

  var VERSION = '1.3.0'

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
    /**
     * The Mini-app has drawn itself and is ready to be used.
     *
     * If the frame inlined a codeblock language runtime (docs/adr/0026), `window.
     * __whetstoneRuntimesReady` exists and this waits on it first: the runtime is not done
     * loading the instant the page's scripts run, and firing early would let the host show
     * an activity a reader could click before `Kit.run` has anything to call. Neither a
     * hand-written Mini-app nor a generated Lesson codeblock has to know this happens.
     */
    ready: function () {
      var runtimesReady = typeof window !== 'undefined' && window.__whetstoneRuntimesReady
      if (runtimesReady && typeof runtimesReady.then === 'function') {
        runtimesReady.then(function () { measure(); post({ type: 'ready' }) })
      } else {
        measure()
        post({ type: 'ready' })
      }
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

  // ------------------------------------------------------------ Kit.run

  /**
   * Runs source in one language and reports what happened. It never throws and never
   * judges: `ok`, the exports (or the injected runtime's return value) under `api`, every
   * line the code printed under `log`, and an error message when it failed. `Kit.editor`
   * and `Kit.codeblock` are both built on this; nothing else needs it.
   *
   * `js` is the only language built in. Anything else comes from `options.runtimes`
   * (falling back to `window.__whetstoneRuntimes`, which is where the host inlines a
   * fetched language runtime, docs/adr/0026) — a keyed map of
   * `function (source, exportNames, print) { ...; return api }`. Writing a parser or
   * interpreter for another language into this file was rejected (docs/adr/0016); the
   * sandbox is what makes running any of them safe, not this function.
   */
  function run(lang, source, options) {
    var settings = options || {}
    var names = settings.exports || []
    var runtimes = settings.runtimes || (typeof window !== 'undefined' && window.__whetstoneRuntimes) || {}
    var engine = !lang || lang === 'js' ? jsEngine : runtimes[lang]
    var log = []
    var print = function () {
      log.push(Array.prototype.slice.call(arguments).join(' '))
    }
    if (typeof engine !== 'function') {
      return { ok: false, api: null, log: log, error: 'no "' + lang + '" runtime is available in this frame' }
    }
    try {
      var api = engine(source, names, print)
      return { ok: true, api: api || {}, log: log, error: null }
    } catch (error) {
      return { ok: false, api: null, log: log, error: String(error && error.message ? error.message : error) }
    }
  }

  /** The built-in `js` engine. A local `console` is shadowed so real output is captured. */
  function jsEngine(source, names, print) {
    var give = names.map(function (name) {
      return name + ': typeof ' + name + ' === "undefined" ? undefined : ' + name
    })
    var body =
      '"use strict";\n' +
      'var console = { log: __print, warn: __print, error: __print };\n' +
      source +
      '\n;return {' + give.join(',') + '};'
    return new Function('__print', body)(print)
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
    var lang = settings.lang || 'js'
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
    var runBtn = el('button', 'k-btn k-quiet', settings.runLabel || 'Run')
    runBtn.type = 'button'
    var list = el('ul', 'k-asserts')

    bar.appendChild(runBtn)
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

    function evaluate() {
      results = []
      var outcome = run(lang, area.value, { exports: names, runtimes: settings.runtimes })
      var api = outcome.api
      for (var i = 0; i < assertions.length; i += 1) {
        var assertion = assertions[i]
        if (!outcome.ok) {
          results.push({ name: assertion.name, passed: false, why: outcome.error })
          continue
        }
        try {
          var passed = assertion.test(api)
          results.push({ name: assertion.name, passed: passed !== false, why: '' })
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

    runBtn.addEventListener('click', function () { evaluate() })
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

  // ------------------------------------------------------------ Kit.codeblock

  /**
   * A runnable code sample with real output beneath it. This is the general form: no
   * assertions, nothing graded, nothing sent to the host. `Kit.editor` is this same
   * machinery with a Task's assertions run against the result.
   *
   * Use it wherever a Course wants to show code and let the reader actually run it —
   * inside a Mini-app or, once a Lesson block wraps one (docs/adr/0026), in prose next to
   * an explanation.
   */
  function codeblock(options) {
    var settings = options || {}
    var lang = settings.lang || 'js'
    var ran = callbacks()
    var last = null

    var root = el('div', 'k-codeblock')
    var area = document.createElement('textarea')
    area.spellcheck = false
    area.value = settings.start || ''
    area.setAttribute('aria-label', settings.label || 'Code')
    area.rows = Math.min(Math.max(area.value.split('\n').length + 1, 6), 26)

    var bar = el('div', 'k-bar')
    var runBtn = el('button', 'k-btn k-quiet', settings.runLabel || 'Run')
    runBtn.type = 'button'
    var out = el('pre', 'k-output')
    out.setAttribute('aria-live', 'polite')

    bar.appendChild(runBtn)
    root.appendChild(area)
    root.appendChild(bar)
    root.appendChild(out)
    mount(settings.mount).appendChild(root)

    area.addEventListener('keydown', function (event) {
      if (event.key !== 'Tab') return
      event.preventDefault()
      var start = area.selectionStart
      area.value = area.value.slice(0, start) + '  ' + area.value.slice(area.selectionEnd)
      area.selectionStart = area.selectionEnd = start + 2
    })

    function execute() {
      last = run(lang, area.value, { runtimes: settings.runtimes })
      draw()
      ran.fire(last)
      return last
    }

    function draw() {
      out.className = 'k-output' + (last && !last.ok ? ' k-fail' : '')
      if (!last) { out.textContent = ''; return }
      var lines = last.log.slice()
      if (!last.ok) lines.push('Error: ' + last.error)
      out.textContent = lines.join('\n')
    }

    runBtn.addEventListener('click', function () { execute() })
    draw()

    return {
      /** Run the code and report what it printed and whether it threw. Never graded. */
      run: function () { return execute() },
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

  // ------------------------------------------------------------ Kit.order

  /**
   * A list the reader puts in order, by dragging a row or by pressing the arrows.
   *
   * Dragging is the direct way to order a list and is what a reader reaches for. The arrows
   * stay beside it because a keyboard has no drag, and because swapping two rows is quicker
   * with them. Both move the same list, so a reader may use either at any point.
   *
   * `Kit.order({ mount, items, label })`, where `items` is a list of strings. It returns
   * `order()` for the reader's arrangement as indexes into `items`, `items()` for the same
   * thing as the strings themselves, `set(list)`, `enable(on)`, and `onChange(fn)`.
   *
   * The widget never says whether the order is right. It reports, and the host decides.
   */
  function order(options) {
    var settings = options || {}
    var labels = settings.items || []
    var changed = callbacks()
    var live = settings.enabled !== false

    var at = []
    for (var i = 0; i < labels.length; i += 1) at.push(i)

    var wrap = el('div', 'k-order')
    if (settings.label) wrap.appendChild(el('div', 'k-label', settings.label))
    var list = el('ol', 'k-rows')
    wrap.appendChild(list)
    mount(settings.mount).appendChild(wrap)

    var held = -1

    /** Take a row out of the list and put it back at another place, closing the gap behind it. */
    function lift(from, to) {
      if (from === to || from < 0 || to < 0) return
      var row = at.splice(from, 1)[0]
      at.splice(to, 0, row)
      draw()
      changed.fire(value())
    }

    function swap(position, delta) {
      var target = position + delta
      if (target < 0 || target >= at.length) return
      var keep = at[position]
      at[position] = at[target]
      at[target] = keep
      draw()
      changed.fire(value())
    }

    function value() {
      return { order: at.slice(), items: at.map(function (index) { return labels[index] }) }
    }

    function row(position) {
      var node = el('li', 'k-row' + (held === position ? ' k-held' : ''))
      node.draggable = live
      node.appendChild(el('span', 'k-grip', '\u283F'))
      node.appendChild(el('span', 'k-num', String(position + 1)))
      node.appendChild(el('span', 'k-what', labels[at[position]]))

      var moves = el('span', 'k-moves')
      moves.appendChild(arrow('\u2191', position, -1, position === 0))
      moves.appendChild(arrow('\u2193', position, 1, position === at.length - 1))
      node.appendChild(moves)

      node.addEventListener('dragstart', function (event) {
        if (!live) { event.preventDefault(); return }
        held = position
        if (event.dataTransfer) {
          event.dataTransfer.effectAllowed = 'move'
          // A drag with nothing on it does not start, so the position rides along.
          event.dataTransfer.setData('text/plain', String(position))
        }
        node.classList.add('k-held')
      })
      node.addEventListener('dragover', function (event) {
        if (held < 0) return
        event.preventDefault()
        if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'
        node.classList.add('k-over')
      })
      node.addEventListener('dragleave', function () { node.classList.remove('k-over') })
      node.addEventListener('drop', function (event) {
        event.preventDefault()
        var from = held
        held = -1
        lift(from, position)
      })
      node.addEventListener('dragend', function () {
        held = -1
        draw()
      })
      return node
    }

    function arrow(glyph, position, delta, off) {
      var button = el('button', 'k-step', glyph)
      button.type = 'button'
      button.disabled = off || !live
      button.setAttribute('aria-label', delta < 0 ? 'Move up' : 'Move down')
      button.addEventListener('click', function () { swap(position, delta) })
      return button
    }

    function draw() {
      while (list.firstChild) list.removeChild(list.firstChild)
      for (var i = 0; i < at.length; i += 1) list.appendChild(row(i))
      measure()
    }

    draw()

    return {
      order: function () { return at.slice() },
      items: function () { return value().items },
      set: function (next) {
        if (!next || next.length !== labels.length) return
        at = next.slice()
        draw()
      },
      enable: function (on) {
        live = on !== false
        draw()
      },
      onChange: function (fn) { changed.add(fn) },
    }
  }

  return {
    version: VERSION,
    theme: theme,
    slider: slider,
    plot: plot,
    pieces: pieces,
    hotspot: hotspot,
    editor: editor,
    codeblock: codeblock,
    run: run,
    steps: steps,
    sim: sim,
    order: order,
    bridge: bridge,
  }
})()
