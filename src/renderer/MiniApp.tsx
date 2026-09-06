import { useEffect, useRef, useState } from 'react'

/**
 * The host side of a Mini-app.
 *
 * The frame is sealed: `sandbox="allow-scripts"` and nothing else, so it has an opaque
 * origin, no storage, no navigation, no popups, and no reach into this document. The
 * document itself is served by the main process over `whetstone-app://`, which is what
 * gives it a policy of its own; a frame written with `srcdoc` would inherit this page's
 * policy instead, and this page denies inline scripts (docs/adr/0005).
 *
 * `postMessage` is the only thing that crosses. Nothing here trusts what comes back: it is
 * a report of what the user did, and the main process decides what it is worth.
 */

interface Message {
  kit?: string
  png?: string
  state?: unknown
  type?: string
  value?: unknown
  height?: number
}

export function MiniApp({
  slug,
  appId,
  height,
  onAnswer,
}: {
  slug: string
  appId: string
  /** Space held for the activity until it reports its own height. */
  height?: number
  /** Absent on a Lesson's `app` block, which is a demonstration and answers nothing. */
  onAnswer?: (value: unknown) => void
}): React.JSX.Element {
  /**
   * What the frame asked to have looked at, held here until a person presses.
   *
   * The toolkit will not send a review without `Kit.bridge.action`, so a well-behaved
   * Mini-app already needs a press. This is the second lock, and it is the one that holds
   * against a Mini-app that posts the message itself: a review costs money and reaches a
   * model, so the host will not start one because a frame asked (PLAN 3.10, test 14).
   */
  const frame = useRef<HTMLIFrameElement>(null)
  const [staged, setStaged] = useState<unknown>(undefined)
  const [tall, setTall] = useState(height ?? 260)
  const [started, setStarted] = useState(false)
  const [stalled, setStalled] = useState(false)

  useEffect(() => {
    const listen = (event: MessageEvent): void => {
      // The frame's origin is opaque, so it can only post to "*" and `event.origin` is
      // "null". Identity of the sending window is the check that holds.
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
        case 'answer':
          if (onAnswer) onAnswer(message.value)
          break
        case 'review':
          // Held, never acted on. Nothing is spawned and nothing is spent until the
          // person presses the button below.
          setStaged({ png: message.png, state: message.state })
          break
      }
    }
    window.addEventListener('message', listen)
    return () => window.removeEventListener('message', listen)
  }, [onAnswer])

  // A Mini-app says when it has drawn. One that never does is a broken activity, and
  // saying so beats leaving an empty rectangle on the page.
  useEffect(() => {
    if (started) return
    const timer = setTimeout(() => setStalled(true), 6000)
    return () => clearTimeout(timer)
  }, [started])

  return (
    <div className="kit">
      <iframe
        ref={frame}
        title={appId}
        className="kframe"
        style={{ height: `${tall}px` }}
        sandbox="allow-scripts"
        src={`whetstone-app://${encodeURIComponent(slug)}/${encodeURIComponent(appId)}`}
      />
      {stalled && !started && <p className="kstall">This activity did not start.</p>}

      {staged !== undefined && (
        <p className="kreview">
          This activity has something to be looked at. Sending it asks a model, which costs
          money, so nothing happens until you press.
          <button type="button" className="quiet" onClick={() => setStaged(undefined)}>
            Not now
          </button>
        </p>
      )}
    </div>
  )
}
