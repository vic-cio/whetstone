import { useState } from 'react'

import { MiniApp } from './MiniApp'

import type { PublicTask, PublicTry } from '../shared/format'
import type { Outcome } from '../shared/grade'

/**
 * The answering controls.
 *
 * A Try and a Task use the same ones. They differ in what the app does with the outcome,
 * never in how the question looks, because a Try is an unrecorded question rather than an
 * easier one (docs/adr/0013).
 *
 * Nothing here knows the answer. The control collects what the user did, hands it to the
 * main process, and draws whatever comes back.
 */

type Asked = PublicTask | PublicTry

export function Answer({
  question,
  send,
  slug,
}: {
  question: Asked
  send: (given: unknown) => Promise<Outcome>
  /** Needed only by the kinds a Mini-app answers, which read one from the Course folder. */
  slug?: string
}): React.JSX.Element {
  const [outcome, setOutcome] = useState<Outcome | undefined>(undefined)
  const [busy, setBusy] = useState(false)
  const [picked, setPicked] = useState<number[]>([])
  const [typed, setTyped] = useState('')
  const [order, setOrder] = useState<number[]>(() => (question.items ?? []).map((_, index) => index))
  /** The row being dragged, and the row it is over, both as positions in the list. */
  const [held, setHeld] = useState<number | undefined>(undefined)
  const [over, setOver] = useState<number | undefined>(undefined)

  const submit = async (given: unknown): Promise<void> => {
    setBusy(true)
    try {
      setOutcome(await send(given))
    } finally {
      setBusy(false)
    }
  }

  const again = (): void => setOutcome(undefined)

  switch (question.kind) {
    case 'multiple-choice':
      return (
        <>
          {(question.options ?? []).map((option, index) => (
            <button
              key={index}
              type="button"
              className={`opt${picked.includes(index) ? ' pick' : ''}`}
              disabled={outcome !== undefined || busy}
              onClick={() => {
                setPicked([index])
                void submit([index])
              }}
            >
              <i />
              <span>{option}</span>
            </button>
          ))}
          <Verdict outcome={outcome} onAgain={again} />
        </>
      )

    case 'accepted-answers':
    case 'numeric':
      return (
        <>
          <form
            className="entry"
            onSubmit={(event) => {
              event.preventDefault()
              if (typed.trim() === '') return
              void submit(question.kind === 'numeric' ? Number(typed) : typed)
            }}
          >
            <input
              value={typed}
              disabled={outcome !== undefined || busy}
              placeholder={question.kind === 'numeric' ? 'A number' : 'Type your answer'}
              onChange={(event) => setTyped(event.target.value)}
              inputMode={question.kind === 'numeric' ? 'decimal' : 'text'}
            />
            {question.units !== undefined && <span className="units">{question.units}</span>}
            <button type="submit" className="btn" disabled={outcome !== undefined || busy}>
              Answer
            </button>
          </form>
          <Verdict outcome={outcome} onAgain={again} />
        </>
      )

    case 'ordering': {
      const locked = outcome !== undefined
      const drop = (event: React.DragEvent, to: number): void => {
        // The row being carried is read back off the drag itself rather than out of state.
        // State is a render behind while the drag is in flight, and the handler that runs
        // on the drop closes over the value from before it started.
        const from = Number(event.dataTransfer.getData('text/plain'))
        if (Number.isInteger(from)) setOrder(lift(order, from, to))
        setHeld(undefined)
        setOver(undefined)
      }
      return (
        <>
          <ol className="order">
            {order.map((item, position) => (
              <li
                key={item}
                // Dragging is the direct way to put a list in order. The arrows stay for a
                // keyboard, and because a two-item swap is quicker with them than with a drag.
                draggable={!locked}
                className={`${held === position ? 'held' : ''}${over === position && held !== position ? ' over' : ''}`}
                onDragStart={(event) => {
                  event.dataTransfer.effectAllowed = 'move'
                  // Firefox and Chromium both refuse to start a drag with nothing on it.
                  event.dataTransfer.setData('text/plain', String(position))
                  setHeld(position)
                }}
                onDragOver={(event) => {
                  if (locked) return
                  event.preventDefault()
                  event.dataTransfer.dropEffect = 'move'
                  setOver(position)
                }}
                onDrop={(event) => {
                  event.preventDefault()
                  drop(event, position)
                }}
                onDragEnd={() => {
                  setHeld(undefined)
                  setOver(undefined)
                }}
              >
                <span className="ogrip" aria-hidden="true">
                  ⠿
                </span>
                <span className="onum">{position + 1}</span>
                <span className="otext">{(question.items ?? [])[item]}</span>
                <span className="omove">
                  <button
                    type="button"
                    disabled={position === 0 || outcome !== undefined}
                    onClick={() => setOrder(move(order, position, -1))}
                    aria-label="Move up"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    disabled={position === order.length - 1 || outcome !== undefined}
                    onClick={() => setOrder(move(order, position, 1))}
                    aria-label="Move down"
                  >
                    ↓
                  </button>
                </span>
              </li>
            ))}
          </ol>
          <button
            type="button"
            className="btn"
            disabled={outcome !== undefined || busy}
            onClick={() => void submit(order)}
          >
            Answer
          </button>
          <Verdict outcome={outcome} onAgain={again} />
        </>
      )
    }

    /**
     * A Mini-app answers these. It reports what the user did and the main process decides,
     * so the frame never holds the answer and cannot pass by claiming an assertion the
     * Task does not declare.
     */
    case 'app-result':
    case 'assertions-pass': {
      if (slug === undefined || question.app === undefined) {
        return <div className="later">This task names no activity to answer it in.</div>
      }
      return (
        <>
          <MiniApp
            slug={slug}
            appId={question.app}
            onAnswer={(value) => {
              if (outcome === undefined && !busy) void submit(value)
            }}
          />
          <Verdict outcome={outcome} onAgain={again} />
        </>
      )
    }

    case 'short-answer':
    case 'submission':
      return (
        <div className="later">
          <span className="ptype">Needs a model</span>
          <p>This one is judged by a model, which arrives with the tutor.</p>
        </div>
      )

    default:
      return <div className="later">Unknown task kind “{question.kind}”.</div>
  }
}

/** Take a row out of the list and put it back at another place, closing the gap behind it. */
function lift(order: number[], from: number, to: number): number[] {
  if (from === to) return order
  const next = [...order]
  const [row] = next.splice(from, 1)
  if (row === undefined) return order
  next.splice(to, 0, row)
  return next
}

function move(order: number[], position: number, delta: number): number[] {
  const next = [...order]
  const target = position + delta
  const a = next[position]
  const b = next[target]
  if (a === undefined || b === undefined) return order
  next[position] = b
  next[target] = a
  return next
}

function Verdict({
  outcome,
  onAgain,
}: {
  outcome: Outcome | undefined
  onAgain: () => void
}): React.JSX.Element | null {
  if (!outcome) return null
  const failed = outcome.outcome === 'fail'
  return (
    <div className="vd" style={failed ? { ['--vdc' as string]: 'var(--fail)' } : undefined}>
      <b>{failed ? 'Not yet' : 'Correct'}</b>
      {outcome.assertions !== undefined && (
        <ul className="kass">
          {outcome.assertions.map((assertion) => (
            <li key={assertion.name} className={assertion.passed ? '' : 'f'}>
              {assertion.name}
            </li>
          ))}
        </ul>
      )}
      {outcome.explanation !== undefined && <span>{outcome.explanation}</span>}
      {failed && (
        <button type="button" className="again" onClick={onAgain}>
          Try again
        </button>
      )}
    </div>
  )
}
