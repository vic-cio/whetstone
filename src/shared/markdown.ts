/**
 * Lesson prose, parsed to a small tree.
 *
 * This produces data, never HTML. Lesson text is written by an agent into a folder the
 * user can also edit by hand, and it renders inside the host window, which holds the
 * only bridge to the main process. So there is no path here that could turn `<script>`
 * in a Lesson into a script in the app: angle brackets come out the other side as text.
 *
 * The grammar is deliberately small. Anything it does not know stays as literal
 * characters rather than being dropped, so a Lesson never silently loses a line.
 *
 * Maths is the one thing here that becomes markup, and it does so through KaTeX rather
 * than through this file: what a Lesson holds is the expression, as a string, and the
 * renderer hands that string to a typesetter whose output grammar is its own. A Course
 * cannot smuggle a tag through it, which `tests/markdown.test.ts` checks rather than
 * assumes.
 */

export interface Inline {
  text: string
  strong?: true
  em?: true
  code?: true
  /** Set on maths. `text` is the expression, and the renderer typesets it. */
  math?: true
  /** Set on a link. Links open in the real browser, never in the app. */
  href?: string
}

/** One cell of a table, and how its column is lined up. */
export type Align = 'left' | 'right' | 'centre'

export type MdBlock =
  | { type: 'p'; inline: Inline[] }
  | { type: 'h'; level: 2 | 3 | 4; inline: Inline[] }
  | { type: 'list'; ordered: boolean; items: Inline[][] }
  | { type: 'code'; lang: string; text: string }
  | { type: 'quote'; inline: Inline[] }
  /** A displayed equation, on its own line. `text` is the expression. */
  | { type: 'math'; text: string }
  | { type: 'table'; align: Align[]; head: Inline[][]; rows: Inline[][][] }
  /** A thematic break: `---`, `***` or `___` on a line of its own. */
  | { type: 'rule' }

export function parseMarkdown(source: string): MdBlock[] {
  const blocks: MdBlock[] = []
  const lines = source.replace(/\r\n?/g, '\n').split('\n')
  let index = 0

  const paragraph: string[] = []
  const flush = (): void => {
    const text = paragraph.join(' ').trim()
    paragraph.length = 0
    if (text !== '') blocks.push({ type: 'p', inline: parseInline(text) })
  }

  while (index < lines.length) {
    const line = lines[index] ?? ''

    if (line.trim() === '') {
      flush()
      index += 1
      continue
    }

    const fence = /^```(\w*)\s*$/.exec(line)
    if (fence) {
      flush()
      const body: string[] = []
      index += 1
      while (index < lines.length && !/^```\s*$/.test(lines[index] ?? '')) {
        body.push(lines[index] ?? '')
        index += 1
      }
      index += 1 // the closing fence, or the end of the lesson
      blocks.push({ type: 'code', lang: fence[1] ?? '', text: body.join('\n') })
      continue
    }

    /*
     * A displayed equation. `$$` on its own line opens and closes it, and `$$x$$` on one
     * line is the same thing said shorter. The expression is kept verbatim, newlines and
     * all, because a multi-line alignment is one expression rather than several.
     */
    if (line.trim().startsWith('$$')) {
      flush()
      const one = /^\s*\$\$(.+)\$\$\s*$/.exec(line)
      if (one) {
        blocks.push({ type: 'math', text: (one[1] ?? '').trim() })
        index += 1
        continue
      }
      const body: string[] = []
      index += 1
      while (index < lines.length && !(lines[index] ?? '').trim().startsWith('$$')) {
        body.push(lines[index] ?? '')
        index += 1
      }
      index += 1 // the closing marker, or the end of the lesson
      blocks.push({ type: 'math', text: body.join('\n').trim() })
      continue
    }

    /*
     * A thematic break. Without this, `---` under a line of prose was read as a table's
     * alignment rule, and any sentence above it holding a pipe was eaten:
     *
     *     Use a | b to pipe.
     *     ---
     *
     * became a two-column table with no rows, and the sentence was split across the two
     * headers. The prose was destroyed rather than misdrawn, which is why this is a rule
     * of its own rather than a tightening of the one below.
     */
    if (isBreak(line)) {
      flush()
      blocks.push({ type: 'rule' })
      index += 1
      continue
    }

    /*
     * A table, in the usual pipe form: a header row, a rule that sets the alignment, then
     * the body. Both lines have to be there, and they have to agree on how many columns
     * there are. The agreement is the second half of the fix above: a sentence with one
     * pipe in it makes two cells, and `---` under it makes one, so it is not a table.
     */
    const ruled = isRule(lines[index + 1] ?? '')
    if (line.includes('|') && ruled && cells(line).length === alignments(lines[index + 1] ?? '').length) {
      flush()
      const align = alignments(lines[index + 1] ?? '')
      const head = cells(line).map((cell) => parseInline(cell))
      index += 2
      const rows: Inline[][][] = []
      while (index < lines.length && (lines[index] ?? '').includes('|')) {
        rows.push(cells(lines[index] ?? '').map((cell) => parseInline(cell)))
        index += 1
      }
      blocks.push({ type: 'table', align, head, rows })
      continue
    }

    const heading = /^(#{2,4})\s+(.*)$/.exec(line)
    if (heading) {
      flush()
      const level = (heading[1] ?? '##').length as 2 | 3 | 4
      blocks.push({ type: 'h', level, inline: parseInline((heading[2] ?? '').trim()) })
      index += 1
      continue
    }

    if (/^>\s?/.test(line)) {
      flush()
      const body: string[] = []
      while (index < lines.length && /^>\s?/.test(lines[index] ?? '')) {
        body.push((lines[index] ?? '').replace(/^>\s?/, ''))
        index += 1
      }
      blocks.push({ type: 'quote', inline: parseInline(body.join(' ').trim()) })
      continue
    }

    const bullet = /^\s*([-*]|\d+\.)\s+/.exec(line)
    if (bullet) {
      flush()
      const ordered = /\d/.test(bullet[1] ?? '')
      const items: Inline[][] = []
      while (index < lines.length) {
        const next = lines[index] ?? ''
        const mark = /^\s*([-*]|\d+\.)\s+(.*)$/.exec(next)
        if (mark) {
          items.push(parseInline((mark[2] ?? '').trim()))
          index += 1
          continue
        }
        // A wrapped continuation line belongs to the item above it.
        if (next.trim() !== '' && /^\s+\S/.test(next) && items.length > 0) {
          items[items.length - 1]?.push(...parseInline(' ' + next.trim()))
          index += 1
          continue
        }
        break
      }
      blocks.push({ type: 'list', ordered, items })
      continue
    }

    paragraph.push(line.trim())
    index += 1
  }

  flush()
  return blocks
}

/**
 * A thematic break, as CommonMark has it: three or more of one marker, spaces allowed
 * between them, and nothing else on the line. A table's rule holds pipes, so it is never
 * one of these.
 */
const isBreak = (line: string): boolean => /^ {0,3}([-*_])(?:\s*\1){2,}\s*$/.test(line)

/** The `|---|:--:|` line under a table's header, which is what makes it a table. */
const isRule = (line: string): boolean => /^\s*\|?[\s:|-]*-[\s:|-]*\|?\s*$/.test(line) && line.includes('-')

/** A row's cells, with the outer pipes dropped and each cell trimmed. */
function cells(line: string): string[] {
  return line
    .replace(/^\s*\|/, '')
    .replace(/\|\s*$/, '')
    .split('|')
    .map((cell) => cell.trim())
}

function alignments(rule: string): Align[] {
  return cells(rule).map((cell) => {
    if (cell.startsWith(':') && cell.endsWith(':')) return 'centre'
    return cell.endsWith(':') ? 'right' : 'left'
  })
}

/**
 * `code` wins over the rest, because a span of code means what it literally says.
 *
 * The single `_` is fenced off from the letters and digits either side of it, so
 * `snake_case_name` in prose stays what it says rather than becoming snake*case*name. That
 * is CommonMark's own rule for an underscore, and it is the one that matters here because
 * a Course about code is full of identifiers. `*` is deliberately not fenced: an asterisk
 * inside a word does emphasise, in CommonMark and here.
 *
 * Known and left alone: emphasis holds plain text only, so a code span inside bold, as in
 * `**the `id` field**`, shows its backticks. Nesting would mean this scanner returning a
 * tree instead of a list, and the shallow case is not worth that. Write the code span
 * outside the bold.
 */
const INLINE =
  /(`[^`]+`)|(\$[^$\n]+\$)|(\[[^\]]+\]\([^)\s]+\))|(\*\*[^*]+\*\*)|(__[^_]+__)|(\*[^*]+\*)|((?<![A-Za-z0-9])_[^_]+_(?![A-Za-z0-9]))/

export function parseInline(text: string): Inline[] {
  const out: Inline[] = []
  let rest = text

  while (rest !== '') {
    const match = INLINE.exec(rest)
    if (!match || match.index === undefined) {
      out.push({ text: rest })
      break
    }
    if (match.index > 0) out.push({ text: rest.slice(0, match.index) })
    const token = match[0]

    if (token.startsWith('`')) {
      out.push({ text: token.slice(1, -1), code: true })
    } else if (token.startsWith('$')) {
      /*
       * Maths, unless it is money. `$5 and $6` would otherwise typeset "5 and " as an
       * expression, so a run that opens or closes against a space is left as text. An
       * expression written by somebody who means it has no space against its markers.
       */
      const expression = token.slice(1, -1)
      if (expression.trim() === '' || /^\s|\s$/.test(expression)) out.push({ text: token })
      else out.push({ text: expression, math: true })
    } else if (token.startsWith('[')) {
      const link = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(token)
      // Only a link the app is willing to open. Anything else stays as its own text,
      // so a `javascript:` href in a Lesson is never turned into something clickable.
      if (link && /^https?:\/\//i.test(link[2] ?? '')) {
        out.push({ text: link[1] ?? '', href: link[2] ?? '' })
      } else {
        out.push({ text: token })
      }
    } else if (token.startsWith('**') || token.startsWith('__')) {
      out.push({ text: token.slice(2, -2), strong: true })
    } else {
      out.push({ text: token.slice(1, -1), em: true })
    }

    rest = rest.slice(match.index + token.length)
  }

  // Coalesce neighbouring plain runs, so a rejected link comes back as one piece of text
  // rather than as the fragments the scanner happened to split it into.
  const merged: Inline[] = []
  for (const piece of out) {
    if (piece.text === '') continue
    const last = merged[merged.length - 1]
    if (last && plain(last) && plain(piece)) last.text += piece.text
    else merged.push({ ...piece })
  }
  return merged
}

const plain = (piece: Inline): boolean =>
  piece.strong === undefined &&
  piece.em === undefined &&
  piece.code === undefined &&
  piece.math === undefined &&
  piece.href === undefined
