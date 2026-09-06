/*
 * A chessboard for this Course.
 *
 * This file is the Course's, not the app's. Whetstone ships no board and has no opinion
 * about what one looks like (docs/adr/0019). The Course lists it under `library` in
 * course.json, the host inlines it into the sealed frame, and every Mini-app in the
 * Course can call `Board(...)`.
 *
 * The board draws and `Chess` rules. It reads the placement field of a FEN so it can
 * paint without asking anything, and it asks `Chess` for everything else: which moves are
 * legal, what a move produces, and whether the game is over. Both files are inlined into
 * the same frame, so every one of those calls is an ordinary function call.
 *
 * The opponent is either written down by the Constructor, as a list of replies, or played
 * by `Chess`. Neither of them is an agent, and neither costs anything.
 *
 * Nothing here tells the host how tall it is. The toolkit watches the body and reports a
 * change on its own, which is the sort of plumbing the toolkit is for.
 *
 * Board({
 *   mount,        // element or selector; the body by default
 *   fen,          // starting position; the opening position by default
 *   orientation,  // 'white' or 'black'
 *   label,        // a line above the board
 *   rules,        // false for a picture: pieces move anywhere and nothing is judged
 *   play,         // which colour the learner has, when there is an opponent
 *   opponent,     // { moves: ['e5', 'Nc6'] } or { depth: 2 }
 *   enabled,      // false for a frozen board
 * })
 *
 * It returns { fen, set, status, history, mark, enable, reset, onMove }.
 */

window.Board = (function () {
  const GLYPH = { k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' }
  const FILES = 'abcdefgh'

  function el(tag, className, text) {
    const node = document.createElement(tag)
    if (className) node.className = className
    if (text !== undefined && text !== null) node.textContent = String(text)
    return node
  }

  function where(target) {
    if (!target) return document.body
    if (typeof target !== 'string') return target
    const found = document.querySelector(target)
    if (!found) throw new Error(`Board: no element matches "${target}"`)
    return found
  }

  const squareName = (index) => FILES.charAt(index % 8) + String(8 - Math.floor(index / 8))
  const squareIndex = (name) => (8 - Number(name.charAt(1))) * 8 + FILES.indexOf(name.charAt(0))
  const fenTurn = (fen) => (String(fen).split(/\s+/)[1] === 'b' ? 'b' : 'w')

  /**
   * The 64 squares of a FEN, drawn without judging anything. A board has to paint a
   * position it was handed before it knows whether that position is legal.
   */
  function placement(fen) {
    const rows = String(fen).split(/\s+/)[0].split('/')
    const board = []
    for (const row of rows) {
      for (const mark of row) {
        if (mark >= '1' && mark <= '8') for (let i = 0; i < Number(mark); i += 1) board.push('')
        else board.push(mark)
      }
    }
    return board
  }

  return function Board(options) {
    const settings = options || {}
    const listeners = []

    const wrap = el('div', 'b-board')
    if (settings.label) wrap.appendChild(el('div', 'b-label', settings.label))
    const grid = el('div', 'b-grid')
    const say = el('div', 'b-say')
    wrap.appendChild(grid)
    wrap.appendChild(say)
    where(settings.mount).appendChild(wrap)

    const flipped = settings.orientation === 'black'
    const rules = settings.rules !== false
    const opponent = settings.opponent || null
    const start = settings.fen || window.Chess.START
    const mine = settings.play === 'black' ? 'b' : settings.play === 'white' ? 'w' : fenTurn(start)

    let fen = start
    let live = settings.enabled !== false
    let picked = -1
    let choices = []
    let targets = []
    let marked = []
    let last = null
    let history = []
    let state = null
    let scripted = 0
    let waiting = false

    const cells = new Array(64)
    for (let seat = 0; seat < 64; seat += 1) {
      const index = flipped ? 63 - seat : seat
      const shade = ((index % 8) + Math.floor(index / 8)) % 2 === 0 ? ' b-light' : ' b-dark'
      const cell = el('div', 'b-sq' + shade)
      // The square's name is on the element, so a board can be read from outside it.
      cell.setAttribute('data-square', squareName(index))
      cell.appendChild(el('span', 'b-man'))
      if (Math.floor(seat / 8) === 7) cell.appendChild(el('span', 'b-file', FILES.charAt(index % 8)))
      if (seat % 8 === 0) cell.appendChild(el('span', 'b-rank', String(8 - Math.floor(index / 8))))
      cells[index] = cell
      grid.appendChild(cell)
      hook(cell, index)
    }

    function hook(cell, index) {
      cell.addEventListener('click', () => touch(index))
      cell.addEventListener('dragover', (event) => {
        if (picked >= 0) event.preventDefault()
      })
      cell.addEventListener('drop', (event) => {
        event.preventDefault()
        if (picked >= 0 && picked !== index) attempt(picked, index)
      })
      cell.querySelector('.b-man').addEventListener('dragstart', (event) => {
        if (!live || waiting) {
          event.preventDefault()
          return
        }
        // A drag starts by picking the piece up, which is the same act as clicking it.
        choose(index)
        if (picked !== index) event.preventDefault()
      })
    }

    function paint() {
      const placed = placement(fen)
      const checked = state && state.check ? placed.indexOf(state.turn === 'w' ? 'K' : 'k') : -1
      for (let i = 0; i < 64; i += 1) {
        const cell = cells[i]
        const man = cell.querySelector('.b-man')
        const piece = placed[i] || ''
        man.textContent = piece === '' ? '' : GLYPH[piece.toLowerCase()]
        man.className =
          'b-man' + (piece === '' ? '' : piece === piece.toUpperCase() ? ' b-white' : ' b-black')
        man.draggable = piece !== '' && live
        const target = targets.indexOf(i) >= 0
        cell.classList.toggle('b-pick', i === picked)
        cell.classList.toggle('b-target', target)
        // A move onto a piece is a capture, and it is drawn as one.
        cell.classList.toggle('b-take', target && piece !== '')
        cell.classList.toggle('b-mark', marked.indexOf(i) >= 0)
        cell.classList.toggle('b-last', last !== null && (i === last.from || i === last.to))
        cell.classList.toggle('b-check', i === checked)
      }
    }

    function report(text, bad) {
      say.className = 'b-say' + (bad ? ' b-bad' : '')
      if (text !== undefined) {
        say.textContent = text
        return
      }
      if (!state) {
        say.textContent = ''
        return
      }
      const line = history.length > 0 ? history[history.length - 1] + '   ' : ''
      if (state.checkmate) {
        say.textContent = line + 'Checkmate, ' + (state.result === 'white' ? 'white' : 'black') + ' wins'
      } else if (state.stalemate) {
        say.textContent = line + 'Stalemate'
      } else {
        const side = state.turn === 'w' ? 'White' : 'Black'
        say.textContent = line + side + ' to move' + (state.check ? ', in check' : '')
      }
    }

    /** A rules error is the learner's answer going wrong, so it is shown, never thrown away. */
    function guard(work) {
      try {
        work()
      } catch (cause) {
        waiting = false
        report(cause.message, true)
      }
    }

    function mayMove(piece) {
      if (piece === '') return false
      const colour = piece === piece.toUpperCase() ? 'w' : 'b'
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
      const piece = placement(fen)[index] || ''
      if (!mayMove(piece)) {
        clear()
        paint()
        return
      }
      picked = index
      targets = []
      choices = []
      if (rules) {
        guard(() => {
          choices = window.Chess.moves(fen, squareName(index)).moves
          targets = choices.map((move) => squareIndex(move.to))
        })
      }
      paint()
    }

    function touch(index) {
      if (!live || waiting) return
      if (picked >= 0 && targets.indexOf(index) >= 0) {
        attempt(picked, index)
        return
      }
      if (picked === index) {
        clear()
        paint()
        return
      }
      choose(index)
    }

    function attempt(from, to) {
      const names = { from: squareName(from), to: squareName(to) }
      if (!rules) {
        clear()
        paint()
        fire({ from: names.from, to: names.to, san: '', fen, status: state, by: 'you' })
        return
      }
      const ways = choices.filter((move) => move.from === names.from && move.to === names.to)
      clear()
      paint()
      if (ways.length === 0) return
      if (ways.length === 1) {
        send(names.from, names.to, ways[0].promotion, 'you')
        return
      }
      // More than one way to the same square is a pawn reaching the far rank.
      offer(ways, (promotion) => send(names.from, names.to, promotion, 'you'))
    }

    function offer(ways, then) {
      const row = el('div', 'b-promote')
      for (const move of ways) {
        const button = el('button', 'k-btn k-quiet', GLYPH[move.promotion])
        button.type = 'button'
        button.title = move.san
        button.addEventListener('click', () => {
          wrap.removeChild(row)
          then(move.promotion)
        })
        row.appendChild(button)
      }
      wrap.insertBefore(row, say)
    }

    function send(from, to, promotion, by) {
      guard(() => {
        const answer = window.Chess.play(fen, from, to, promotion || '')
        fen = answer.fen
        state = answer.status
        last = { from: squareIndex(from), to: squareIndex(to) }
        history.push(answer.move.san)
        clear()
        paint()
        report()
        fire({ from, to, san: answer.move.san, fen, status: state, by })
        // The pause is the whole reason the opponent is not instant. A reply that lands in
        // the same frame as your own move reads as one move, not two.
        if (by === 'you' && opponent) {
          waiting = true
          setTimeout(answerBack, 300)
        }
      })
    }

    /** The opponent's reply: the Constructor's next written move, or one Chess picks. */
    function answerBack() {
      waiting = false
      if (!opponent || !state || state.over) return
      guard(() => {
        if (opponent.moves) {
          const written = opponent.moves[scripted]
          if (written === undefined) return
          scripted += 1
          const found = window.Chess.moves(fen).moves.find(
            (move) =>
              move.san === written ||
              move.from + move.to + move.promotion === written ||
              move.from + move.to === written,
          )
          if (!found) throw new Error(`the written reply "${written}" is not legal here`)
          send(found.from, found.to, found.promotion, 'opponent')
          return
        }
        const answer = window.Chess.reply(fen, opponent.depth || 2)
        if (answer.move) send(answer.move.from, answer.move.to, answer.move.promotion, 'opponent')
      })
    }

    function refresh() {
      if (!rules) {
        paint()
        return
      }
      guard(() => {
        state = window.Chess.status(fen).status
        paint()
        report()
      })
    }

    function fire(event) {
      for (const listener of listeners) listener(event)
    }

    paint()
    refresh()

    return {
      fen: () => fen,
      set(next) {
        fen = next || window.Chess.START
        clear()
        last = null
        refresh()
      },
      status: () => state,
      history: () => history.slice(),
      /** Point at squares. This says nothing about the rules; it draws a ring. */
      mark(list) {
        marked = (list || []).map(squareIndex)
        paint()
      },
      enable(on) {
        live = on !== false
        if (!live) clear()
        paint()
      },
      reset() {
        fen = start
        history = []
        scripted = 0
        last = null
        clear()
        refresh()
      },
      onMove(fn) {
        if (typeof fn === 'function') listeners.push(fn)
      },
    }
  }
})()
