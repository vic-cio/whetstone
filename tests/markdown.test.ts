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
    const blocks = parseMarkdown('| a | b |\n| - | - |')
    expect(blocks).toEqual([{ type: 'p', inline: [{ text: '| a | b | | - | - |' }] }])
  })
})
