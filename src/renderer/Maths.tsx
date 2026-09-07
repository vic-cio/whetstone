import katex from 'katex'
import { useEffect, useRef } from 'react'

import 'katex/dist/katex.css'

/**
 * Typesetting an expression.
 *
 * This is the one place a Lesson's own text becomes markup, so it is worth being exact
 * about what is and is not happening. The Lesson holds an expression as a string. That
 * string is handed to KaTeX, which produces its own markup from its own closed grammar,
 * and the result is put into a node this component owns. Nothing from the Lesson is ever
 * parsed as HTML: `<script>` in an expression is not a tag, it is an unknown control
 * sequence, and KaTeX says so in red.
 *
 * `trust: false` is the load-bearing option and it is the default. It disables the
 * commands that could produce a link or embed a resource, so an expression cannot become
 * a way out of the app. `tests/markdown.test.ts` checks that rather than trusting it.
 *
 * `katex.render` writes into an element rather than returning a string, so there is no
 * `dangerouslySetInnerHTML` anywhere in this app and there is no path that would let one
 * appear by accident.
 *
 * KaTeX and its fonts are bundled, so an equation renders with the network off, which is
 * the same promise the rest of the reader makes.
 */
export function Maths({ text, display }: { text: string; display?: true }): React.JSX.Element {
  const node = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    if (!node.current) return
    katex.render(text, node.current, {
      displayMode: display === true,
      // An expression that will not parse is shown as itself, in red, rather than taking
      // the page down. A Lesson is written by an agent and read by somebody who cannot fix
      // it, so a broken equation must never be a broken page.
      throwOnError: false,
      trust: false,
      strict: false,
    })
  }, [text, display])

  return <span ref={node} className={display === true ? 'mathblock' : 'math'} />
}
