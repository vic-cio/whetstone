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
  type?: string
  value?: unknown
  height?: number
  /** The number the frame gave this question, so the answer can be matched to it. */
  ask?: number
  service?: string
  request?: unknown
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
  const frame = useRef<HTMLIFrameElement>(null)
  const [tall, setTall] = useState(height ?? 260)
  const [started, setStarted] = useState(false)
  const [stalled, setStalled] = useState(false)

  useEffect(() => {
    const reply = (target: Window, message: Message): void => {
      const id = message.ask
      const service = message.service
      const told = (answer: { ok: boolean; value?: unknown; error?: string }): void => {
        target.postMessage({ kit: message.kit, type: 'told', ask: id, ...answer }, '*')
      }
      if (typeof id !== 'number' || typeof service !== 'string') return
      window.whetstone.services.ask(slug, service, message.request).then(told, (cause: Error) => {
        told({ ok: false, error: cause.message })
      })
    }

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
        case 'ask':
          // A Service request. This carries the question to the main process and the
          // reply back, and reads neither: the main process decides what a Course may
          // ask for, and the frame is told no when it asks for anything else.
          reply(event.source as Window, message)
          break
        case 'review':
          // The review path writes the payload outside the Course and spawns a Grader.
          // It arrives with the tutor, in phase 4.
          break
      }
    }
    window.addEventListener('message', listen)
    return () => window.removeEventListener('message', listen)
  }, [onAnswer, slug])

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
    </div>
  )
}
