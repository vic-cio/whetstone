import { useState } from 'react'

import { Run } from './Prose'
import { parseInline } from '../shared/markdown'

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
  /**
   * What the host did with the answer. `trouble` is a Grader that could not judge: it is
   * not an outcome, nothing was recorded, and the question stays open (PLAN 3.15).
   */
  send: (given: unknown, submission?: string[]) => Promise<Outcome | { trouble: string }>
  /** Needed only by the kinds a Mini-app answers, which read one from the Course folder. */
  slug?: string
}): React.JSX.Element {
  const [outcome, setOutcome] = useState<Outcome | undefined>(undefined)
  const [trouble, setTrouble] = useState('')
  const [busy, setBusy] = useState(false)
  const [picked, setPicked] = useState<number[]>([])
  const [typed, setTyped] = useState('')
  const [order, setOrder] = useState<number[]>(() => (question.items ?? []).map((_, index) => index))
  /** The row being dragged, and the row it is over, both as positions in the list. */
  const [held, setHeld] = useState<number | undefined>(undefined)
  const [over, setOver] = useState<number | undefined>(undefined)
  /** The files chosen for a `submission` Task, held only until this answer is sent. */
  const [files, setFiles] = useState<string[]>([])

  const submit = async (given: unknown, submission?: string[]): Promise<void> => {
    setBusy(true)
    setTrouble('')
    try {
      const back = await send(given, submission)
      if ('trouble' in back) setTrouble(back.trouble)
      else setOutcome(back)
    } finally {
      setBusy(false)
    }
  }

  const again = (): void => {
    setOutcome(undefined)
    setTrouble('')
  }

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
              <span><Run inline={parseInline(option)} /></span>
            </button>
          ))}
          <Verdict outcome={outcome} trouble={trouble} onAgain={again} />
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
          <Verdict outcome={outcome} trouble={trouble} onAgain={again} />
        </>
      )

    case 'ordering': {
      const locked = outcome !== undefined
      const drop = (event: React.DragEvent, to: number): void => {
        /*
         * The row being carried is read back off the drag itself rather than out of state.
         * State is a render behind while the drag is in flight, and the handler that runs
         * on the drop closes over the value from before it started.
         *
         * Only a drag this list started counts. Anything can be dragged onto a page, and a
         * drag carrying the text "2" would otherwise reorder the answer under the reader's
         * hands. `held` is what says the drag began on one of these rows.
         */
        if (held === undefined) return
        const from = Number(event.dataTransfer.getData('text/plain'))
        if (Number.isInteger(from) && from >= 0 && from < order.length) setOrder(lift(order, from, to))
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
                  // Not a drop target for a drag from outside: without this the browser
                  // offers the drop, and refusing it only once it lands looks like a bug.
                  if (locked || held === undefined) return
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
          <Verdict outcome={outcome} trouble={trouble} onAgain={again} />
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
          <Verdict outcome={outcome} trouble={trouble} onAgain={again} />
        </>
      )
    }

    /**
     * The two kinds a Grader judges. The control collects and sends, exactly as every other
     * control here does; what makes these different is only where the outcome comes from,
     * and that is `answering.ts`'s business rather than this file's.
     *
     * Marking one costs money and takes a while, so `busy` says so out loud. A press is
     * what starts it: nothing here submits on its own.
     */
    case 'short-answer':
      return (
        <>
          <form
            className="written"
            onSubmit={(event) => {
              event.preventDefault()
              if (typed.trim() === '' || busy || outcome !== undefined) return
              void submit(typed.trim())
            }}
          >
            <textarea
              rows={4}
              value={typed}
              disabled={outcome !== undefined || busy}
              placeholder="Write your answer"
              onChange={(event) => setTyped(event.target.value)}
            />
            <div className="acts">
              {busy && <span className="waiting">Being marked</span>}
              <button type="submit" className="btn" disabled={outcome !== undefined || busy || typed.trim() === ''}>
                Answer
              </button>
            </div>
          </form>
          <Verdict outcome={outcome} trouble={trouble} onAgain={again} />
        </>
      )

    /**
     * Work done outside the app, handed in as files.
     *
     * The paths never reach the Course and are held here only until the answer is sent: the
     * Grader copies what it is given into the Attempt folder, and until Answer is pressed
     * there is no Attempt. The note beside them is optional, because the work is the answer.
     */
    case 'submission': {
      // A Try is never a submission, but the two share this component's type, so the field
      // is read off the one shape that has it.
      const accepts = 'accepts' in question ? (question.accepts ?? []) : []
      return (
        <>
          <div className="handin">
            {files.length > 0 && (
              <ul className="tray">
                {files.map((file) => (
                  <li key={file}>{named(file)}</li>
                ))}
              </ul>
            )}
            <textarea
              rows={3}
              value={typed}
              disabled={outcome !== undefined || busy}
              placeholder="Anything the marker should know (optional)"
              onChange={(event) => setTyped(event.target.value)}
            />
            <div className="acts">
              {accepts.length > 0 && <span className="units">{accepts.join(' ')}</span>}
              {busy && <span className="waiting">Being marked</span>}
              <button
                type="button"
                className="quiet"
                disabled={outcome !== undefined || busy}
                onClick={() => {
                  void window.whetstone.tasks
                    .attach(accepts)
                    .then((picked) => setFiles((all) => [...all, ...picked.filter((file) => !all.includes(file))]))
                }}
              >
                Attach work
              </button>
              <button
                type="button"
                className="btn"
                disabled={outcome !== undefined || busy || files.length === 0}
                title={files.length === 0 ? 'Attach your work first' : 'Hand this in'}
                onClick={() => void submit(typed.trim(), files)}
              >
                Answer
              </button>
            </div>
          </div>
          <Verdict outcome={outcome} trouble={trouble} onAgain={again} />
        </>
      )
    }

    default:
      return <div className="later">Unknown task kind “{question.kind}”.</div>
  }
}

/** Just the file's name. Where it sits on the disk is not the reader's business. */
const named = (path: string): string => path.split('/').filter(Boolean).pop() ?? path

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
  trouble,
  onAgain,
}: {
  outcome: Outcome | undefined
  trouble: string
  onAgain: () => void
}): React.JSX.Element | null {
  // Trouble is not a wrong answer. Nothing was recorded, so this says so and offers the
  // question back rather than a result (PLAN 3.15).
  if (trouble !== '') {
    return (
      <div className="vd" style={{ ['--vdc' as string]: 'var(--muted)' }}>
        <b>Not judged</b>
        <span>{trouble}</span>
        <button type="button" className="again" onClick={onAgain}>
          Try again
        </button>
      </div>
    )
  }
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
      {outcome.explanation !== undefined && (
        <span>
          <Run inline={parseInline(outcome.explanation)} />
        </span>
      )}
      {failed && (
        <button type="button" className="again" onClick={onAgain}>
          Try again
        </button>
      )}
    </div>
  )
}
