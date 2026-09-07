import { Maths } from './Maths'
import { parseMarkdown } from '../shared/markdown'
import type { Align, Inline, MdBlock } from '../shared/markdown'

/**
 * Lesson prose. The parser hands over data, and this turns it into elements, so there is
 * no point at which a Lesson's text could become markup of its own.
 */
export function Prose({ markdown }: { markdown: string }): React.JSX.Element {
  return (
    <div className="prose">
      {parseMarkdown(markdown).map((block, index) => (
        <Block key={index} block={block} />
      ))}
    </div>
  )
}

function Block({ block }: { block: MdBlock }): React.JSX.Element {
  switch (block.type) {
    case 'p':
      return <p><Run inline={block.inline} /></p>
    case 'h': {
      const Tag = (['h2', 'h3', 'h4'] as const)[block.level - 2] ?? 'h3'
      return <Tag className="ph"><Run inline={block.inline} /></Tag>
    }
    case 'quote':
      return <blockquote className="pull"><Run inline={block.inline} /></blockquote>
    case 'code':
      return <pre className="code"><code>{block.text}</code></pre>
    case 'list':
      return block.ordered ? (
        <ol>{block.items.map((item, index) => <li key={index}><Run inline={item} /></li>)}</ol>
      ) : (
        <ul>{block.items.map((item, index) => <li key={index}><Run inline={item} /></li>)}</ul>
      )
    case 'math':
      return <Maths text={block.text} display />
    case 'rule':
      return <hr className="pbreak" />
    case 'table':
      return (
        // A table can be wider than the column, so it scrolls inside its own box rather
        // than making the whole page scroll sideways.
        <div className="tablebox">
          <table>
            <thead>
              <tr>
                {block.head.map((cell, index) => (
                  <th key={index} style={{ textAlign: lined(block.align[index]) }}>
                    <Run inline={cell} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, rowIndex) => (
                <tr key={rowIndex}>
                  {row.map((cell, index) => (
                    <td key={index} style={{ textAlign: lined(block.align[index]) }}>
                      <Run inline={cell} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )
  }
}

/** The parser's word for a column's alignment, in the one CSS understands. */
const lined = (align: Align | undefined): 'left' | 'right' | 'center' =>
  align === 'right' ? 'right' : align === 'centre' ? 'center' : 'left'

export function Run({ inline }: { inline: Inline[] }): React.JSX.Element {
  return (
    <>
      {inline.map((piece, index) => {
        if (piece.href !== undefined) {
          // target=_blank routes through the window open handler, which hands the url to
          // the real browser. A Resource is a link out of the app, never a page in it.
          return (
            <a key={index} href={piece.href} target="_blank" rel="noreferrer">
              {piece.text}
            </a>
          )
        }
        if (piece.math === true) return <Maths key={index} text={piece.text} />
        if (piece.code === true) return <code key={index}>{piece.text}</code>
        if (piece.strong === true) return <strong key={index}>{piece.text}</strong>
        if (piece.em === true) return <em key={index}>{piece.text}</em>
        return <span key={index}>{piece.text}</span>
      })}
    </>
  )
}
