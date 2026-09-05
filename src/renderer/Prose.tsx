import { parseMarkdown } from '../shared/markdown'
import type { Inline, MdBlock } from '../shared/markdown'

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
  }
}

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
        if (piece.code === true) return <code key={index}>{piece.text}</code>
        if (piece.strong === true) return <strong key={index}>{piece.text}</strong>
        if (piece.em === true) return <em key={index}>{piece.text}</em>
        return <span key={index}>{piece.text}</span>
      })}
    </>
  )
}
