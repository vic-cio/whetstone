/**
 * Chess rules, offline and pure.
 *
 * This is the first Service (docs/adr/0018). A Mini-app cannot carry a rules engine of its
 * own: it is one file with no network and no second script, and every chess Course would
 * otherwise ship a different set of bugs. So the rules live in the host, a Course declares
 * that it uses them, and the frame asks across the bridge it already has.
 *
 * Every function here is pure and synchronous, for the same reason `grade.ts` is: there is
 * no I/O to disable, so a chess Course costs nothing and works with the machine offline.
 *
 * Positions are passed as FEN, so the Service holds no state between calls and a Mini-app
 * cannot leave one behind.
 *
 * What is here: legal moves, castling, en passant, promotion, check, checkmate, stalemate,
 * SAN, and an opponent that searches a few moves ahead. What is not: the fifty-move rule,
 * threefold repetition, and any opening or endgame knowledge.
 */

export type Colour = 'w' | 'b'

/** A position. `board` is 64 squares, index 0 is a8 and index 63 is h1. '' is an empty square. */
export interface Position {
  board: string[]
  turn: Colour
  castling: string
  /** The square a pawn may capture into, or null. */
  ep: number | null
  half: number
  full: number
}

/** A move as it crosses the bridge. Squares are named, never indexed. */
export interface Move {
  from: string
  to: string
  /** 'q', 'r', 'b' or 'n' when a pawn promotes, otherwise ''. */
  promotion: string
  san: string
}

export interface Status {
  turn: Colour
  check: boolean
  checkmate: boolean
  stalemate: boolean
  /** How many legal moves the side to move has. Zero means the game is over. */
  moves: number
  over: boolean
  /** Who stands better when it is over: 'white', 'black', 'draw', or null while it runs. */
  result: 'white' | 'black' | 'draw' | null
}

export const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'

// ---------------------------------------------------------------- squares

const FILES = 'abcdefgh'

const at = (board: string[], index: number): string => board[index] ?? ''
const isWhite = (piece: string): boolean => piece !== '' && piece === piece.toUpperCase()
const owner = (piece: string): Colour => (isWhite(piece) ? 'w' : 'b')
const other = (side: Colour): Colour => (side === 'w' ? 'b' : 'w')

/** -1 for anything off the board, so callers test one value instead of four. */
const spot = (file: number, row: number): number =>
  file < 0 || file > 7 || row < 0 || row > 7 ? -1 : row * 8 + file

export const squareName = (index: number): string =>
  `${FILES[index % 8] ?? '?'}${8 - Math.floor(index / 8)}`

export function squareIndex(name: string): number {
  const file = FILES.indexOf((name[0] ?? '').toLowerCase())
  const rank = Number(name[1])
  if (file < 0 || !Number.isInteger(rank) || rank < 1 || rank > 8 || name.length !== 2) {
    throw new Error(`"${name}" is not a square`)
  }
  return (8 - rank) * 8 + file
}

// ---------------------------------------------------------------- FEN

export function parseFen(fen: string): Position {
  const parts = String(fen).trim().split(/\s+/)
  if (parts.length < 4) throw new Error('a FEN has at least four fields')

  const rows = (parts[0] ?? '').split('/')
  if (rows.length !== 8) throw new Error('a FEN board has eight ranks')

  const board: string[] = []
  for (const row of rows) {
    let wide = 0
    for (const mark of row) {
      if (mark >= '1' && mark <= '8') {
        for (let i = 0; i < Number(mark); i += 1) board.push('')
        wide += Number(mark)
      } else if ('prnbqkPRNBQK'.includes(mark)) {
        board.push(mark)
        wide += 1
      } else {
        throw new Error(`"${mark}" is not a piece`)
      }
    }
    if (wide !== 8) throw new Error(`rank "${row}" is not eight squares wide`)
  }

  const turn: Colour = parts[1] === 'b' ? 'b' : 'w'
  const castling = (parts[2] ?? '-').replace(/[^KQkq]/g, '')
  const target = parts[3] ?? '-'
  const half = Number(parts[4] ?? 0)
  const full = Number(parts[5] ?? 1)

  return {
    board,
    turn,
    castling,
    ep: target === '-' ? null : squareIndex(target),
    half: Number.isFinite(half) ? half : 0,
    full: Number.isFinite(full) && full > 0 ? full : 1,
  }
}

export function toFen(position: Position): string {
  const rows: string[] = []
  for (let row = 0; row < 8; row += 1) {
    let line = ''
    let empty = 0
    for (let file = 0; file < 8; file += 1) {
      const piece = at(position.board, row * 8 + file)
      if (piece === '') empty += 1
      else {
        if (empty > 0) line += String(empty)
        empty = 0
        line += piece
      }
    }
    if (empty > 0) line += String(empty)
    rows.push(line)
  }
  const castling = position.castling === '' ? '-' : position.castling
  const target = position.ep === null ? '-' : squareName(position.ep)
  return `${rows.join('/')} ${position.turn} ${castling} ${target} ${position.half} ${position.full}`
}

// ---------------------------------------------------------------- attacks

const KNIGHT: number[][] = [
  [1, 2],
  [2, 1],
  [2, -1],
  [1, -2],
  [-1, -2],
  [-2, -1],
  [-2, 1],
  [-1, 2],
]
const DIAGONAL: number[][] = [
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
]
const STRAIGHT: number[][] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
]
const AROUND = [...DIAGONAL, ...STRAIGHT]

const step = (pair: number[]): [number, number] => [pair[0] ?? 0, pair[1] ?? 0]

/** Does `side` attack this square? Written from the square outwards, so it is one pass. */
export function attacked(board: string[], index: number, side: Colour): boolean {
  const file = index % 8
  const row = Math.floor(index / 8)

  // A white pawn attacks upwards, so it sits one row below the square it attacks.
  const pawnRow = side === 'w' ? row + 1 : row - 1
  const pawn = side === 'w' ? 'P' : 'p'
  for (const shift of [-1, 1]) {
    const from = spot(file + shift, pawnRow)
    if (from >= 0 && at(board, from) === pawn) return true
  }

  const knight = side === 'w' ? 'N' : 'n'
  for (const pair of KNIGHT) {
    const [df, dr] = step(pair)
    const from = spot(file + df, row + dr)
    if (from >= 0 && at(board, from) === knight) return true
  }

  const king = side === 'w' ? 'K' : 'k'
  for (const pair of AROUND) {
    const [df, dr] = step(pair)
    const from = spot(file + df, row + dr)
    if (from >= 0 && at(board, from) === king) return true
  }

  const rook = side === 'w' ? 'R' : 'r'
  const bishop = side === 'w' ? 'B' : 'b'
  const queen = side === 'w' ? 'Q' : 'q'
  const rays: [number[][], string][] = [
    [STRAIGHT, rook],
    [DIAGONAL, bishop],
  ]
  for (const [dirs, sliding] of rays) {
    for (const pair of dirs) {
      const [df, dr] = step(pair)
      for (let n = 1; n < 8; n += 1) {
        const from = spot(file + df * n, row + dr * n)
        if (from < 0) break
        const piece = at(board, from)
        if (piece === '') continue
        if (piece === sliding || piece === queen) return true
        break
      }
    }
  }
  return false
}

const kingSquare = (board: string[], side: Colour): number =>
  board.indexOf(side === 'w' ? 'K' : 'k')

export const inCheck = (position: Position, side: Colour): boolean => {
  const king = kingSquare(position.board, side)
  return king >= 0 && attacked(position.board, king, other(side))
}

// ---------------------------------------------------------------- moves

/** A move by index, which is what the generator and the search work in. */
interface Raw {
  from: number
  to: number
  promotion: string
}

const PROMOTIONS = ['q', 'r', 'b', 'n']

function pseudo(position: Position): Raw[] {
  const list: Raw[] = []
  const { board, turn } = position
  const add = (from: number, to: number): void => {
    list.push({ from, to, promotion: '' })
  }

  for (let from = 0; from < 64; from += 1) {
    const piece = at(board, from)
    if (piece === '' || owner(piece) !== turn) continue
    const file = from % 8
    const row = Math.floor(from / 8)
    const kind = piece.toLowerCase()

    if (kind === 'p') {
      const ahead = turn === 'w' ? -1 : 1
      const start = turn === 'w' ? 6 : 1
      const last = turn === 'w' ? 0 : 7
      const one = spot(file, row + ahead)
      if (one >= 0 && at(board, one) === '') {
        if (row + ahead === last) for (const to of PROMOTIONS) list.push({ from, to: one, promotion: to })
        else add(from, one)
        const two = spot(file, row + ahead * 2)
        if (row === start && two >= 0 && at(board, two) === '') add(from, two)
      }
      for (const shift of [-1, 1]) {
        const to = spot(file + shift, row + ahead)
        if (to < 0) continue
        const target = at(board, to)
        const takes = target !== '' && owner(target) !== turn
        if (!takes && to !== position.ep) continue
        if (row + ahead === last) for (const name of PROMOTIONS) list.push({ from, to, promotion: name })
        else add(from, to)
      }
      continue
    }

    if (kind === 'n' || kind === 'k') {
      const dirs = kind === 'n' ? KNIGHT : AROUND
      for (const pair of dirs) {
        const [df, dr] = step(pair)
        const to = spot(file + df, row + dr)
        if (to < 0) continue
        const target = at(board, to)
        if (target !== '' && owner(target) === turn) continue
        add(from, to)
      }
      continue
    }

    const dirs = kind === 'r' ? STRAIGHT : kind === 'b' ? DIAGONAL : AROUND
    for (const pair of dirs) {
      const [df, dr] = step(pair)
      for (let n = 1; n < 8; n += 1) {
        const to = spot(file + df * n, row + dr * n)
        if (to < 0) break
        const target = at(board, to)
        if (target === '') {
          add(from, to)
          continue
        }
        if (owner(target) !== turn) add(from, to)
        break
      }
    }
  }

  // Castling. The king may not start in check, pass through an attacked square, or land
  // on one, and every square between king and rook must be empty.
  const home = turn === 'w' ? 60 : 4
  const rights = turn === 'w' ? ['K', 'Q'] : ['k', 'q']
  const rook = turn === 'w' ? 'R' : 'r'
  if (at(board, home) === (turn === 'w' ? 'K' : 'k')) {
    for (const right of rights) {
      if (!position.castling.includes(right)) continue
      const short = right.toLowerCase() === 'k'
      const corner = short ? home + 3 : home - 4
      if (at(board, corner) !== rook) continue
      const between = short ? [home + 1, home + 2] : [home - 1, home - 2, home - 3]
      if (between.some((square) => at(board, square) !== '')) continue
      const walked = short ? [home, home + 1, home + 2] : [home, home - 1, home - 2]
      if (walked.some((square) => attacked(board, square, other(turn)))) continue
      add(home, short ? home + 2 : home - 2)
    }
  }

  return list
}

/** Play a move. The caller has already decided it is legal. */
function play(position: Position, move: Raw): Position {
  const board = position.board.slice()
  const piece = at(board, move.from)
  const kind = piece.toLowerCase()
  const target = at(board, move.to)
  const turn = position.turn

  board[move.from] = ''
  board[move.to] = move.promotion === '' ? piece : turn === 'w' ? move.promotion.toUpperCase() : move.promotion

  // En passant takes a pawn that is not on the square the capturer lands on.
  if (kind === 'p' && move.to === position.ep && target === '') {
    board[move.to + (turn === 'w' ? 8 : -8)] = ''
  }

  // Castling moves the rook as well. The king has already moved two files.
  if (kind === 'k' && Math.abs((move.to % 8) - (move.from % 8)) === 2) {
    const short = move.to > move.from
    const corner = short ? move.from + 3 : move.from - 4
    board[short ? move.from + 1 : move.from - 1] = at(board, corner)
    board[corner] = ''
  }

  // Rights go when the king moves, and when a rook leaves or is taken on its corner.
  let castling = position.castling
  if (kind === 'k') castling = castling.replace(turn === 'w' ? /[KQ]/g : /[kq]/g, '')
  const corners: [number, string][] = [
    [63, 'K'],
    [56, 'Q'],
    [7, 'k'],
    [0, 'q'],
  ]
  for (const [square, right] of corners) {
    if (move.from === square || move.to === square) castling = castling.replace(right, '')
  }

  const doubled = kind === 'p' && Math.abs(move.to - move.from) === 16
  return {
    board,
    turn: other(turn),
    castling,
    ep: doubled ? (move.from + move.to) / 2 : null,
    half: kind === 'p' || target !== '' ? 0 : position.half + 1,
    full: turn === 'b' ? position.full + 1 : position.full,
  }
}

function legalRaw(position: Position): Raw[] {
  const side = position.turn
  return pseudo(position).filter((move) => !inCheck(play(position, move), side))
}

/** The legal moves, named. */
export function legalMoves(position: Position): Move[] {
  const raw = legalRaw(position)
  return raw.map((move) => ({
    from: squareName(move.from),
    to: squareName(move.to),
    promotion: move.promotion,
    san: sanOf(position, move, raw),
  }))
}

export function status(position: Position): Status {
  const moves = legalRaw(position).length
  const check = inCheck(position, position.turn)
  const checkmate = moves === 0 && check
  const stalemate = moves === 0 && !check
  return {
    turn: position.turn,
    check,
    checkmate,
    stalemate,
    moves,
    over: moves === 0,
    result: checkmate ? (position.turn === 'w' ? 'black' : 'white') : stalemate ? 'draw' : null,
  }
}

// ---------------------------------------------------------------- SAN

function sanOf(position: Position, move: Raw, legal: Raw[]): string {
  const piece = at(position.board, move.from)
  const kind = piece.toLowerCase()
  const target = at(position.board, move.to)
  const takes = target !== '' || (kind === 'p' && move.to === position.ep)

  let text: string
  if (kind === 'k' && Math.abs((move.to % 8) - (move.from % 8)) === 2) {
    text = move.to > move.from ? 'O-O' : 'O-O-O'
  } else if (kind === 'p') {
    text = takes ? `${FILES[move.from % 8] ?? ''}x${squareName(move.to)}` : squareName(move.to)
    if (move.promotion !== '') text += `=${move.promotion.toUpperCase()}`
  } else {
    // Name only as much of the starting square as it takes to tell the moves apart.
    const rivals = legal.filter(
      (one) =>
        one.from !== move.from &&
        one.to === move.to &&
        at(position.board, one.from).toLowerCase() === kind,
    )
    let mark = ''
    if (rivals.length > 0) {
      const sameFile = rivals.some((one) => one.from % 8 === move.from % 8)
      const sameRow = rivals.some((one) => Math.floor(one.from / 8) === Math.floor(move.from / 8))
      if (!sameFile) mark = FILES[move.from % 8] ?? ''
      else if (!sameRow) mark = String(8 - Math.floor(move.from / 8))
      else mark = squareName(move.from)
    }
    text = piece.toUpperCase() + mark + (takes ? 'x' : '') + squareName(move.to)
  }

  const after = play(position, move)
  if (inCheck(after, after.turn)) text += legalRaw(after).length === 0 ? '#' : '+'
  return text
}

// ---------------------------------------------------------------- the opponent

/**
 * The opponent that comes with the app.
 *
 * It searches a few moves ahead and counts material and squares. It is not a strong
 * engine and is not meant to be: what teaches a fork is the position the Constructor
 * chose, not the rating of the thing replying. The Service boundary is what matters,
 * because a stronger engine can be put behind it without touching a single Course.
 */
const VALUE: Record<string, number> = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 20000 }

// Read from White's side, first row is rank 8. Black reads the same table flipped.
const SQUARES: Record<string, number[]> = {
  p: [
    0, 0, 0, 0, 0, 0, 0, 0, 50, 50, 50, 50, 50, 50, 50, 50, 10, 10, 20, 30, 30, 20, 10, 10, 5, 5, 10,
    25, 25, 10, 5, 5, 0, 0, 0, 20, 20, 0, 0, 0, 5, -5, -10, 0, 0, -10, -5, 5, 5, 10, 10, -20, -20, 10,
    10, 5, 0, 0, 0, 0, 0, 0, 0, 0,
  ],
  n: [
    -50, -40, -30, -30, -30, -30, -40, -50, -40, -20, 0, 0, 0, 0, -20, -40, -30, 0, 10, 15, 15, 10, 0,
    -30, -30, 5, 15, 20, 20, 15, 5, -30, -30, 0, 15, 20, 20, 15, 0, -30, -30, 5, 10, 15, 15, 10, 5,
    -30, -40, -20, 0, 5, 5, 0, -20, -40, -50, -40, -30, -30, -30, -30, -40, -50,
  ],
  b: [
    -20, -10, -10, -10, -10, -10, -10, -20, -10, 0, 0, 0, 0, 0, 0, -10, -10, 0, 5, 10, 10, 5, 0, -10,
    -10, 5, 5, 10, 10, 5, 5, -10, -10, 0, 10, 10, 10, 10, 0, -10, -10, 10, 10, 10, 10, 10, 10, -10,
    -10, 5, 0, 0, 0, 0, 5, -10, -20, -10, -10, -10, -10, -10, -10, -20,
  ],
  r: [
    0, 0, 0, 0, 0, 0, 0, 0, 5, 10, 10, 10, 10, 10, 10, 5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0,
    0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, 0, 0, 0, 5, 5,
    0, 0, 0,
  ],
  q: [
    -20, -10, -10, -5, -5, -10, -10, -20, -10, 0, 0, 0, 0, 0, 0, -10, -10, 0, 5, 5, 5, 5, 0, -10, -5,
    0, 5, 5, 5, 5, 0, -5, 0, 0, 5, 5, 5, 5, 0, -5, -10, 5, 5, 5, 5, 5, 0, -10, -10, 0, 5, 0, 0, 0, 0,
    -10, -20, -10, -10, -5, -5, -10, -10, -20,
  ],
  k: [
    -30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50,
    -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -20, -30, -30, -40, -40, -30, -30, -20,
    -10, -20, -20, -20, -20, -20, -20, -10, 20, 20, 0, 0, 0, 0, 20, 20, 20, 30, 10, 0, 0, 10, 30, 20,
  ],
}

const MATE = 100_000

/** Material and squares, from the side to move. */
function judge(position: Position): number {
  let score = 0
  for (let index = 0; index < 64; index += 1) {
    const piece = at(position.board, index)
    if (piece === '') continue
    const kind = piece.toLowerCase()
    const table = SQUARES[kind] ?? []
    // A black piece reads the table flipped top to bottom, keeping its file.
    const worth = (VALUE[kind] ?? 0) + (table[isWhite(piece) ? index : index ^ 56] ?? 0)
    score += isWhite(piece) ? worth : -worth
  }
  return position.turn === 'w' ? score : -score
}

/** Captures first, biggest prize first. Ordering is most of what makes the cut-offs work. */
function order(position: Position, moves: Raw[]): Raw[] {
  const rank = (move: Raw): number => {
    const target = at(position.board, move.to)
    const taken = target === '' ? 0 : VALUE[target.toLowerCase()] ?? 0
    const mover = VALUE[at(position.board, move.from).toLowerCase()] ?? 0
    return (taken === 0 ? 0 : 10_000 + taken * 10 - mover) + (move.promotion === '' ? 0 : 800)
  }
  return moves.slice().sort((a, b) => rank(b) - rank(a))
}

/** Keep looking while pieces are still being taken, so the count is not read mid-trade. */
function quiet(position: Position, alpha: number, beta: number, left: number): number {
  const standing = judge(position)
  if (standing >= beta) return beta
  if (standing > alpha) alpha = standing
  if (left <= 0) return alpha

  const captures = legalRaw(position).filter((move) => at(position.board, move.to) !== '')
  for (const move of order(position, captures)) {
    const score = -quiet(play(position, move), -beta, -alpha, left - 1)
    if (score >= beta) return beta
    if (score > alpha) alpha = score
  }
  return alpha
}

function search(position: Position, depth: number, alpha: number, beta: number, ply: number): number {
  const moves = legalRaw(position)
  if (moves.length === 0) return inCheck(position, position.turn) ? -MATE + ply : 0
  if (depth <= 0) return quiet(position, alpha, beta, 4)

  for (const move of order(position, moves)) {
    const score = -search(play(position, move), depth - 1, -beta, -alpha, ply + 1)
    if (score >= beta) return beta
    if (score > alpha) alpha = score
  }
  return alpha
}

/**
 * The move the opponent plays, or undefined when the game is over.
 *
 * The depth is capped. A Service runs in the main process, so a search is a freeze of the
 * whole window while it lasts, and a Mini-app must not be able to ask for a long one.
 * Three plies costs about a tenth of a second; four costs more than a second.
 */
export const DEEPEST = 3

export function bestMove(position: Position, depth: number): Move | undefined {
  const moves = legalRaw(position)
  if (moves.length === 0) return undefined
  const look = Math.max(1, Math.min(Math.floor(depth) || 2, DEEPEST))

  let choice = moves[0] as Raw
  let best = -Infinity
  for (const move of order(position, moves)) {
    const score = -search(play(position, move), look - 1, -Infinity, -best, 1)
    if (score > best) {
      best = score
      choice = move
    }
  }
  return {
    from: squareName(choice.from),
    to: squareName(choice.to),
    promotion: choice.promotion,
    san: sanOf(position, choice, moves),
  }
}

// ---------------------------------------------------------------- counting, for the tests

/** Every sequence of `depth` legal moves. The one check that catches a rules bug. */
export function perft(position: Position, depth: number): number {
  if (depth <= 0) return 1
  const moves = legalRaw(position)
  if (depth === 1) return moves.length
  let total = 0
  for (const move of moves) total += perft(play(position, move), depth - 1)
  return total
}

// ---------------------------------------------------------------- the service

const text = (value: unknown, name: string): string => {
  if (typeof value !== 'string' || value === '') throw new Error(`the chess service needs "${name}"`)
  return value
}

/**
 * One request from a Mini-app. The frame sends plain data and gets plain data back, so
 * nothing here holds a position between calls.
 */
export function askChess(request: unknown): unknown {
  const ask = (request ?? {}) as Record<string, unknown>
  const op = text(ask['op'], 'op')

  if (op === 'status') {
    const position = parseFen(text(ask['fen'], 'fen'))
    return { fen: toFen(position), status: status(position) }
  }

  if (op === 'moves') {
    const position = parseFen(text(ask['fen'], 'fen'))
    const all = legalMoves(position)
    const from = typeof ask['from'] === 'string' ? ask['from'] : ''
    return {
      moves: from === '' ? all : all.filter((move) => move.from === from),
      status: status(position),
    }
  }

  if (op === 'move') {
    const position = parseFen(text(ask['fen'], 'fen'))
    const from = text(ask['from'], 'from')
    const to = text(ask['to'], 'to')
    const wanted = typeof ask['promotion'] === 'string' ? ask['promotion'] : ''
    const legal = legalMoves(position)
    const found =
      legal.find((move) => move.from === from && move.to === to && move.promotion === wanted) ??
      // A promotion nobody named becomes a queen, which is what a board without a chooser
      // wants and what nearly every player means.
      legal.find((move) => move.from === from && move.to === to && move.promotion === 'q')
    if (!found) throw new Error(`${from}${to} is not a legal move here`)
    const after = play(position, {
      from: squareIndex(found.from),
      to: squareIndex(found.to),
      promotion: found.promotion,
    })
    return {
      fen: toFen(after),
      move: found,
      capture: at(position.board, squareIndex(to)) !== '',
      status: status(after),
    }
  }

  if (op === 'best') {
    const position = parseFen(text(ask['fen'], 'fen'))
    const depth = typeof ask['depth'] === 'number' ? ask['depth'] : 2
    const move = bestMove(position, depth)
    if (!move) return { move: null, fen: toFen(position), status: status(position) }
    const after = play(position, {
      from: squareIndex(move.from),
      to: squareIndex(move.to),
      promotion: move.promotion,
    })
    return { move, fen: toFen(after), status: status(after) }
  }

  throw new Error(`the chess service has no "${op}"; it has status, moves, move and best`)
}
