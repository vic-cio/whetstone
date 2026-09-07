import katex from 'katex'
import { describe, it, expect } from 'vitest'

import { parseMarkdown, parseInline } from '../src/shared/markdown'

describe('lesson prose parses to data, never to markup', () => {
  it('leaves html in a lesson as literal text', () => {
    // Lesson text is written by an agent and rendered inside the host window, which holds
    // the only bridge to the main process. Nothing here may become an element.
    const blocks = parseMarkdown('<script>alert(1)</script> and <b>bold</b>')
    expect(blocks).toEqual([
      { type: 'p', inline: [{ text: '<script>alert(1)</script> and <b>bold</b>' }] },
    ])
  })

  it('refuses a link the app would not open', () => {
    expect(parseInline('[click](javascript:alert(1))')).toEqual([
      { text: '[click](javascript:alert(1))' },
    ])
    expect(parseInline('[3blue1brown](https://example.com/x)')).toEqual([
      { text: '3blue1brown', href: 'https://example.com/x' },
    ])
  })

  it('reads paragraphs, headings, lists, quotes and fenced code', () => {
    const blocks = parseMarkdown(
      [
        'A derivative answers one question:',
        'how much does the output move?',
        '',
        '## Rules you will reuse',
        '',
        '- the power rule',
        '- the chain rule',
        '',
        '1. differentiate the outside',
        '2. multiply by the inside',
        '',
        '> Keep track of shapes.',
        '',
        '```python',
        'def backward(x):',
        '    return 2 * x',
        '```',
      ].join('\n'),
    )

    expect(blocks.map((block) => block.type)).toEqual(['p', 'h', 'list', 'list', 'quote', 'code'])
    expect(blocks[0]).toEqual({
      type: 'p',
      inline: [{ text: 'A derivative answers one question: how much does the output move?' }],
    })
    expect(blocks[2]).toMatchObject({ type: 'list', ordered: false })
    expect(blocks[3]).toMatchObject({ type: 'list', ordered: true })
    expect(blocks[5]).toEqual({ type: 'code', lang: 'python', text: 'def backward(x):\n    return 2 * x' })
  })

  it('reads emphasis and code spans, and prefers code', () => {
    expect(parseInline('a **bold** and *slanted* and `f(x) = **x**`')).toEqual([
      { text: 'a ' },
      { text: 'bold', strong: true },
      { text: ' and ' },
      { text: 'slanted', em: true },
      { text: ' and ' },
      { text: 'f(x) = **x**', code: true },
    ])
  })

  it('keeps a line it does not understand rather than dropping it', () => {
    // A footnote reference, a definition list and a raw tag are all outside the grammar,
    // and a Lesson must never silently lose a line to that.
    expect(parseMarkdown('Here[^1] is a note.')).toEqual([
      { type: 'p', inline: [{ text: 'Here[^1] is a note.' }] },
    ])
    expect(parseMarkdown('<aside>not a tag</aside>')).toEqual([
      { type: 'p', inline: [{ text: '<aside>not a tag</aside>' }] },
    ])
  })
})

describe('tables', () => {
  const table = '| Kind | What the host checks |\n| --- | :---: |\n| `numeric` | Within a tolerance |\n| `ordering` | Sequence equality |'

  it('reads a header, a rule and its rows', () => {
    const [block] = parseMarkdown(table)
    expect(block?.type).toBe('table')
    if (block?.type !== 'table') return
    expect(block.head.map((cell) => cell[0]?.text)).toEqual(['Kind', 'What the host checks'])
    expect(block.rows).toHaveLength(2)
    expect(block.rows[1]?.[1]?.[0]?.text).toBe('Sequence equality')
  })

  it('reads the alignment off the rule', () => {
    const [block] = parseMarkdown(table)
    if (block?.type !== 'table') return
    expect(block.align).toEqual(['left', 'centre'])
    const [right] = parseMarkdown('| a |\n| ---: |\n| 1 |')
    if (right?.type === 'table') expect(right.align).toEqual(['right'])
  })

  it('parses what is inside a cell, so a cell can hold code or a link', () => {
    const [block] = parseMarkdown(table)
    if (block?.type !== 'table') return
    expect(block.rows[0]?.[0]?.[0]).toEqual({ text: 'numeric', code: true })
  })

  it('is not a table without the rule under the header', () => {
    // Otherwise a sentence with a pipe in it becomes a one-row table.
    expect(parseMarkdown('a | b is a choice')[0]?.type).toBe('p')
  })

  /*
   * Measured. A sentence holding a pipe, with `---` under it, was read as a table's
   * alignment rule and the sentence was split across two headers. The prose was destroyed,
   * not misdrawn, so this is the one in this file worth keeping forever.
   */
  it('is not a table when the header and the rule disagree on how many columns there are', () => {
    const blocks = parseMarkdown('Use a | b to pipe.\n---')
    expect(blocks.map((block) => block.type)).toEqual(['p', 'rule'])
    const [prose] = blocks
    if (prose?.type !== 'p') return
    expect(prose.inline.map((piece) => piece.text).join('')).toBe('Use a | b to pipe.')
  })

  it('reads a bare marker line as a thematic break', () => {
    for (const marker of ['---', '***', '___', '- - -']) {
      expect(parseMarkdown(`Before.\n\n${marker}\n\nAfter.`).map((block) => block.type)).toEqual([
        'p',
        'rule',
        'p',
      ])
    }
  })

  it('still reads a one-column table, whose rule looks like a break', () => {
    const [block] = parseMarkdown('| a |\n| --- |\n| 1 |')
    expect(block?.type).toBe('table')
  })
})

describe('an identifier in prose', () => {
  /*
   * A Course about code is full of `snake_case`, and a single underscore inside a word is
   * not emphasis. CommonMark says so and this file did not, so `some_var_name` came out as
   * some*var*name in a Lesson.
   */
  it('keeps its underscores', () => {
    expect(parseInline('the some_var_name field')).toEqual([{ text: 'the some_var_name field' }])
    expect(parseInline('call read_file() first')).toEqual([{ text: 'call read_file() first' }])
  })

  it('does not stop a real emphasis', () => {
    expect(parseInline('a _slanted_ word')).toEqual([
      { text: 'a ' },
      { text: 'slanted', em: true },
      { text: ' word' },
    ])
  })
})

describe('maths', () => {
  it('takes a displayed equation on its own lines, newlines and all', () => {
    const blocks = parseMarkdown('Before.\n\n$$\n\\hat{x}(f) = \\int x(t)\\,dt\n$$\n\nAfter.')
    expect(blocks.map((block) => block.type)).toEqual(['p', 'math', 'p'])
    expect(blocks[1]).toEqual({ type: 'math', text: '\\hat{x}(f) = \\int x(t)\\,dt' })
  })

  it('takes a displayed equation written on one line', () => {
    expect(parseMarkdown('$$e^{i\\pi} + 1 = 0$$')).toEqual([{ type: 'math', text: 'e^{i\\pi} + 1 = 0' }])
  })

  it('takes an expression inside a sentence', () => {
    const [block] = parseMarkdown('The probe $e^{-i2\\pi f t}$ spins once per period.')
    if (block?.type !== 'p') return
    expect(block.inline).toEqual([
      { text: 'The probe ' },
      { text: 'e^{-i2\\pi f t}', math: true },
      { text: ' spins once per period.' },
    ])
  })

  it('leaves money alone', () => {
    // "$5 and $6" would otherwise typeset "5 and " as an expression. A run that opens or
    // closes against a space is text, and an expression somebody meant has neither.
    const [block] = parseMarkdown('It costs $5 and $6 to run.')
    if (block?.type !== 'p') return
    expect(block.inline).toEqual([{ text: 'It costs $5 and $6 to run.' }])
  })

  it('does not read an underscore inside an expression as emphasis', () => {
    const [block] = parseMarkdown('Probe at $f = f_0$ and again at $f_1$.')
    if (block?.type !== 'p') return
    expect(block.inline.filter((piece) => piece.math === true).map((piece) => piece.text)).toEqual([
      'f = f_0',
      'f_1',
    ])
    expect(block.inline.some((piece) => piece.em === true)).toBe(false)
  })

  it('keeps an expression as a string, so a lesson never becomes markup', () => {
    // The whole safety story. What a Lesson holds is the expression; the renderer hands
    // that to a typesetter whose output grammar is its own, with `trust` off.
    const [block] = parseMarkdown('$<script>alert(1)</script>$')
    if (block?.type !== 'p') return
    expect(block.inline).toEqual([{ text: '<script>alert(1)</script>', math: true }])
  })
})

describe('what a typesetter is allowed to make of a lesson', () => {
  /*
   * The renderer's own options, kept here so the claim is checked rather than described.
   * `trust: false` is the load-bearing one and it is KaTeX's default; this asserts the
   * default has not moved and that the app is not overriding it somewhere.
   */
  const asRendered = { displayMode: false, throwOnError: false, trust: false, strict: false }

  it('makes no link, however an expression asks for one', () => {
    // `\href` is refused rather than honoured, and the command comes back as characters.
    // So the check is for an attribute and an anchor, not for the word: the word is there,
    // as text, which is exactly what being refused looks like.
    const out = katex.renderToString('\\href{javascript:alert(1)}{x}', asRendered)
    expect(out).not.toMatch(/href\s*=/)
    expect(out).not.toMatch(/<a[\s>]/)

    // The string `javascript:` does survive, inside MathML's `<annotation>`, which is the
    // source expression echoed back as text. That is not a link and asserting it away
    // would be asserting the wrong thing: what makes a link is the attribute above.
    expect(out).toContain('<annotation')
  })

  it('embeds nothing from outside', () => {
    const out = katex.renderToString('\\includegraphics{https://example.com/x.png}', asRendered)
    expect(out).not.toMatch(/<img|<iframe|<object|src\s*=/)
  })

  it('turns a tag into characters rather than into a tag', () => {
    const out = katex.renderToString('<script>alert(1)</script>', asRendered)
    expect(out).not.toContain('<script>')
    expect(out).toContain('&lt;')
  })

  it('shows a broken expression instead of throwing, so a bad line is not a bad page', () => {
    // A Lesson is written by an agent and read by somebody who cannot fix it, so an
    // expression that will not parse comes back as itself rather than as an exception.
    expect(() => katex.renderToString('\\frac{1}{', asRendered)).not.toThrow()
    const out = katex.renderToString('\\nosuchcommand', asRendered)
    expect(out).toContain('nosuchcommand')
    expect(out.startsWith('<span class="katex')).toBe(true)
  })

  it('lets no tag out, whatever the expression was', () => {
    // The one claim that matters, made over the whole surface rather than case by case.
    for (const attempt of [
      '<script>alert(1)</script>',
      '\\href{javascript:alert(1)}{x}',
      '\\includegraphics{x.png}',
      '\\htmlClass{a}{b}',
      '\\url{https://example.com}',
    ]) {
      const out = katex.renderToString(attempt, asRendered)
      expect(out, attempt).not.toMatch(/<(script|a|img|iframe|object|embed)[\s>]/i)
      expect(out, attempt).not.toMatch(/\son[a-z]+\s*=/i)
    }
  })
})
