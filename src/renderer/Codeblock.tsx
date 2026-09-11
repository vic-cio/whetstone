import { useEffect, useRef, useState } from 'react'

/**
 * The host side of a Lesson codeblock: `Kit.codeblock` running in the same sealed frame a
 * Mini-app runs in (docs/adr/0026), served by the main process at
 * `whetstone-app://<slug>/__codeblock__/<lessonId>/<blockIndex>`.
 *
 * Unlike `MiniApp`, this never answers and never reviews — a codeblock is ungraded, so the
 * only messages it ever sends are `ready` and `resize`.
 */

interface Message {
  kit?: string
  type?: string
  height?: number
}

export function Codeblock({
  slug,
  lessonId,
  blockIndex,
  height,
}: {
  slug: string
  lessonId: string
  blockIndex: number
  /** Space held for the block until it reports its own height. */
  height?: number
}): React.JSX.Element {
  const frame = useRef<HTMLIFrameElement>(null)
  const [tall, setTall] = useState(height ?? 220)
  const [started, setStarted] = useState(false)
  const [stalled, setStalled] = useState(false)

  useEffect(() => {
    const listen = (event: MessageEvent): void => {
      if (!frame.current || event.source !== frame.current.contentWindow) return
      const message = event.data as Message
      if (typeof message !== 'object' || message === null || typeof message.kit !== 'string') return

      switch (message.type) {
        case 'ready':
          setStarted(true)
          break
        case 'resize':
          if (typeof message.height === 'number' && message.height > 0) {
            setTall(Math.min(Math.max(message.height + 4, 120), 1400))
          }
          break
      }
    }
    window.addEventListener('message', listen)
    return () => window.removeEventListener('message', listen)
  }, [])

  useEffect(() => {
    if (started) return
    const timer = setTimeout(() => setStalled(true), 6000)
    return () => clearTimeout(timer)
  }, [started])

  return (
    <div className="kit">
      <iframe
        ref={frame}
        title="codeblock"
        className="kframe"
        style={{ height: `${tall}px` }}
        sandbox="allow-scripts"
        src={`whetstone-app://${encodeURIComponent(slug)}/__codeblock__/${encodeURIComponent(lessonId)}/${blockIndex}`}
      />
      {stalled && !started && <p className="kstall">This codeblock did not start.</p>}
    </div>
  )
}
