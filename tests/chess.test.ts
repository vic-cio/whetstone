import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * The chess library the sample Course carries.
 *
 * This is Course content, not app code. Whetstone knows nothing about chess; the Course
 * lists `chess.js` under `library` and the host inlines it into every one of its Mini-apps
 * (docs/adr/0019). It is checked here for the same reason the sample Lessons are parsed
 * here: a sample Course is what a Constructor reads to learn what good work looks like,
 * and a move generator that is quietly wrong teaches the wrong chess to a real person.
 *
 * The file runs in a frame and hangs itself on `window`, so it is loaded the way the frame
 * loads it rather than imported.
 */
const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..')
const LIBRARY = join(ROOT, 'fixtures', 'courses', 'forks-and-pins', 'lib', 'chess.js')

interface Move {
  from: string
  to: string
  promotion: string
  san: string
}
interface Status {
  turn: string
  check: boolean
  checkmate: boolean
  stalemate: boolean
  moves: number
  over: boolean
  result: string | null
}
interface Library {
  START: string
  DEEPEST: number
  status: (fen: string) => { fen: string; status: Status }
  moves: (fen: string, from?: string) => { moves: Move[]; status: Status }
  play: (
    fen: string,
    from: string,
    to: string,
    promotion?: string,
  ) => { fen: string; move: Move; capture: boolean; status: Status }
  reply: (fen: string, depth?: number) => { move: Move | null; fen: string; status: Status }
  parseFen: (fen: string) => unknown
  toFen: (position: unknown) => string
  bestMove: (position: unknown, depth: number) => Move | undefined
  positionStatus: (position: unknown) => Status
  perft: (position: unknown, depth: number) => number
}

const frame: { Chess?: Library } = {}
new Function('window', readFileSync(LIBRARY, 'utf8'))(frame)
const Chess = frame.Chess as Library

const { START, DEEPEST } = Chess
const parseFen = (fen: string): unknown => Chess.parseFen(fen)
const toFen = (position: unknown): string => Chess.toFen(position)
const perft = (position: unknown, depth: number): number => Chess.perft(position, depth)
const bestMove = (position: unknown, depth: number): Move | undefined => Chess.bestMove(position, depth)
const status = (position: unknown): Status => Chess.positionStatus(position)

/** The moves a position allows, named, so a failure reads like chess rather than indexes. */
const sans = (fen: string): string[] => Chess.moves(fen).moves.map((move) => move.san)

const after = (fen: string, from: string, to: string, promotion = ''): Record<string, unknown> =>
  Chess.play(fen, from, to, promotion) as unknown as Record<string, unknown>

describe('the rules', () => {
  /**
   * Counting every sequence of legal moves is the one check that catches a rules bug.
   * These four positions are the standard ones, and between them they exercise castling,
   * en passant, promotion, pins, and discovered check.
   */
  it('counts the moves the standard positions have', () => {
    expect(perft(parseFen(START), 1)).toBe(20)
    expect(perft(parseFen(START), 2)).toBe(400)
    expect(perft(parseFen(START), 3)).toBe(8902)
    expect(perft(parseFen(START), 4)).toBe(197_281)

    const wide = 'r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1'
    expect(perft(parseFen(wide), 1)).toBe(48)
    expect(perft(parseFen(wide), 2)).toBe(2039)
    expect(perft(parseFen(wide), 3)).toBe(97_862)

    const endgame = '8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1'
    expect(perft(parseFen(endgame), 3)).toBe(2812)
    expect(perft(parseFen(endgame), 4)).toBe(43_238)

    const promoting = 'r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1'
    expect(perft(parseFen(promoting), 3)).toBe(9467)
  })

  it('reads and writes a FEN unchanged', () => {
    const positions = [
      START,
      'r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1',
      'rnbqkbnr/ppp1p1pp/8/3pPp2/8/8/PPPP1PPP/RNBQKBNR w KQkq f6 0 3',
    ]
    for (const fen of positions) expect(toFen(parseFen(fen))).toBe(fen)
  })

  it('castles on both sides and moves the rook with the king', () => {
    const fen = 'r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1'
    expect(sans(fen)).toContain('O-O')
    expect(sans(fen)).toContain('O-O-O')
    expect(after(fen, 'e1', 'g1')['fen']).toBe('r3k2r/8/8/8/8/8/8/R4RK1 b kq - 1 1')
    expect(after(fen, 'e1', 'c1')['fen']).toBe('r3k2r/8/8/8/8/8/8/2KR3R b kq - 1 1')
  })

  it('refuses to castle through an attacked square', () => {
    // A rook on f8 covers f1, which is the square the king would walk over.
    expect(sans('5r2/8/8/8/8/8/8/R3K2R w KQ - 0 1')).not.toContain('O-O')
    expect(sans('5r2/8/8/8/8/8/8/R3K2R w KQ - 0 1')).toContain('O-O-O')
  })

  it('takes en passant, and removes the pawn that is not on the square', () => {
    const fen = 'rnbqkbnr/ppp1p1pp/8/3pPp2/8/8/PPPP1PPP/RNBQKBNR w KQkq f6 0 3'
    expect(sans(fen)).toContain('exf6')
    expect(after(fen, 'e5', 'f6')['fen']).toBe('rnbqkbnr/ppp1p1pp/5P2/3p4/8/8/PPPP1PPP/RNBQKBNR b KQkq - 0 3')
  })

  it('promotes to any of the four pieces', () => {
    const fen = '8/P6k/8/8/8/8/8/7K w - - 0 1'
    expect(sans(fen)).toEqual(expect.arrayContaining(['a8=Q', 'a8=R', 'a8=B', 'a8=N']))
    expect(after(fen, 'a7', 'a8', 'n')['fen']).toBe('N7/7k/8/8/8/8/8/7K b - - 0 1')
    // A promotion nobody chose becomes a queen, which is what a board with no chooser means.
    expect(after(fen, 'a7', 'a8')['fen']).toBe('Q7/7k/8/8/8/8/8/7K b - - 0 1')
  })

  it('knows checkmate from stalemate', () => {
    const fools = parseFen('rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3')
    expect(status(fools)).toMatchObject({ checkmate: true, over: true, result: 'black', moves: 0 })

    const stuck = parseFen('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1')
    expect(status(stuck)).toMatchObject({ stalemate: true, checkmate: false, result: 'draw' })

    expect(status(parseFen(START))).toMatchObject({ check: false, over: false, moves: 20, result: null })
  })

  it('names a move the way a player writes it', () => {
    // Knights on b1 and f1 both reach d2, so the file says which one moved.
    expect(sans('4k3/8/8/8/8/8/8/1N3N1K w - - 0 1')).toEqual(expect.arrayContaining(['Nbd2', 'Nfd2']))
    // One knight needs no help.
    expect(sans('4k3/8/8/8/8/8/8/1N5K w - - 0 1')).toContain('Nd2')
    // A move that ends the game is named as one.
    expect(sans('6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1')).toContain('Ra8#')
  })
})

describe('the opponent', () => {
  it('takes a free piece', () => {
    const move = bestMove(parseFen('4k3/8/8/3q4/4B3/8/8/4K3 w - - 0 1'), 2)
    expect(move?.san).toBe('Bxd5')
  })

  it('finds a mate in one', () => {
    const move = bestMove(parseFen('6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1'), 2)
    expect(move?.san).toBe('Ra8#')
  })

  it('has nothing to play once the game is over', () => {
    expect(bestMove(parseFen('rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3'), 2)).toBeUndefined()
  })

  it('never searches deeper than the cap, whatever it is asked for', () => {
    // The search runs in the frame, so a long one is a board that stops answering.
    expect(DEEPEST).toBeLessThanOrEqual(3)
    const started = Date.now()
    Chess.reply(START, 40)
    expect(Date.now() - started).toBeLessThan(3000)
  })
})

describe('what a board calls', () => {
  it('answers status, moves, play and reply', () => {
    expect(Chess.status(START)).toMatchObject({ status: { turn: 'w', moves: 20 } })
    expect(Chess.moves(START, 'e2').moves).toHaveLength(2)
    expect(Chess.moves(START).moves).toHaveLength(20)

    expect(after(START, 'e2', 'e4')).toMatchObject({
      fen: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1',
      move: { san: 'e4' },
      capture: false,
    })

    expect(Chess.reply(START)).toMatchObject({ move: { from: expect.any(String) } })
    expect(Chess.reply('rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3').move).toBeNull()
  })

  it('refuses an illegal move rather than playing it', () => {
    expect(() => after(START, 'e2', 'e5')).toThrow(/not a legal move/)
  })

  it('refuses a position it cannot read', () => {
    expect(() => Chess.status('not a position')).toThrow()
    expect(() => Chess.status('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP w KQkq - 0 1')).toThrow(/eight ranks/)
  })

  it('hangs one name on the window and nothing else', () => {
    // A library file shares a frame with the toolkit and with every other library file in
    // the Course. One global each is the whole of the etiquette.
    expect(Object.keys(frame)).toEqual(['Chess'])
  })
})
