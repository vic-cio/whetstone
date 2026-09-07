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

/**
 * A question inside a sitting.
 *
 * A Test holds its results (docs/adr/0022), so in a sitting this control shows none. It
 * collects, writes what it collected down through `onChange` so a closed window loses
 * nothing, and locks once the reader has pressed Check. `given` is what was written down
 * before, which is how a half-answered Test comes back.
 */
export interface Holding {
  given?: unknown
  checked: boolean
  onChange: (given: unknown) => void
}

export function Answer({
  question,
  send,
  slug,
  holding,
}: {
  question: Asked
  /**
   * What the host did with the answer. `trouble` is a Grader that could not judge: it is
   * not an outcome, nothing was recorded, and the question stays open (PLAN 3.15).
   * `checked` is a sitting: the run happened and the result is held.
   */
  send: (given: unknown, submission?: string[]) => Promise<Outcome | { trouble: string } | { checked: true }>
  /** Needed only by the kinds a Mini-app answers, which read one from the Course folder. */
  slug?: string
  /** Present inside a Test, absent in a Lesson and in a review. */
  holding?: Holding
}): React.JSX.Element {
  const sitting = holding !== undefined
  const [outcome, setOutcome] = useState<Outcome | undefined>(undefined)
  const [trouble, setTrouble] = useState('')
  const [busy, setBusy] = useState(false)
  const [picked, setPicked] = useState<number[]>(() => asNumbers(holding?.given))
  const [typed, setTyped] = useState(() => asText(holding?.given))
  const [order, setOrder] = useState<number[]>(() => {
    const written = asNumbers(holding?.given)
    const fresh = (question.items ?? []).map((_, index) => index)
    return written.length === fresh.length ? written : fresh
  })
  /** The row being dragged, and the row it is over, both as positions in the list. */
  const [held, setHeld] = useState<number | undefined>(undefined)
  const [over, setOver] = useState<number | undefined>(undefined)
  /** The files chosen for a `submission` Task, held only until this answer is sent. */
  const [files, setFiles] = useState<string[]>(() => asFiles(holding?.given))
  /** What a Mini-app has reported so far in a sitting, waiting for the reader to check it. */
  const [reported, setReported] = useState<unknown>(() => holding?.given)

  /** The reader has checked this one, or answered it outside a sitting. Either way it locks. */
  const locked = sitting ? holding!.checked : outcome !== undefined
  const label = sitting ? 'Check' : 'Answer'
  /** Write it down as it changes. Nothing is judged here; this is only so it survives. */
  const write = (given: unknown): void => holding?.onChange(given)

  const submit = async (given: unknown, submission?: string[]): Promise<void> => {
    setBusy(true)
    setTrouble('')
    try {
      const back = await send(given, submission)
      if ('trouble' in back) setTrouble(back.trouble)
      else if (!('checked' in back)) setOutcome(back)
    } finally {
      setBusy(false)
    }
  }

  const again = (): void => {
    setOutcome(undefined)
    setTrouble('')
  }

  /** Below every control: a result outside a sitting, and the held line inside one. */
  const foot = sitting ? (
    <Held checked={holding!.checked} trouble={trouble} onAgain={again} />
  ) : (
    <Verdict outcome={outcome} trouble={trouble} onAgain={again} />
  )

  switch (question.kind) {
    case 'multiple-choice':
      return (
        <>
          {(question.options ?? []).map((option, index) => (
            <button
              key={index}
              type="button"
              className={`opt${picked.includes(index) ? ' pick' : ''}`}
              disabled={locked || busy}
              onClick={() => {
                setPicked([index])
                write([index])
                // Outside a sitting a press is the answer. Inside one it is only a choice:
                // the run happens when the reader presses Check.
                if (!sitting) void submit([index])
              }}
            >
              <i />
              <span><Run inline={parseInline(option)} /></span>
            </button>
          ))}
          {sitting && (
            <Check busy={busy} locked={locked} ready={picked.length > 0} onCheck={() => void submit(picked)} />
          )}
          {foot}
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
              disabled={locked || busy}
              placeholder={question.kind === 'numeric' ? 'A number' : 'Type your answer'}
              onChange={(event) => {
                setTyped(event.target.value)
                write(event.target.value)
              }}
              inputMode={question.kind === 'numeric' ? 'decimal' : 'text'}
            />
            {question.units !== undefined && <span className="units">{question.units}</span>}
            <button type="submit" className="btn" disabled={locked || busy}>
              {label}
            </button>
          </form>
          {foot}
        </>
      )

    case 'ordering': {
      /** Put the list in this order, and write it down. Both, every time it moves. */
      const place = (next: number[]): void => {
        setOrder(next)
        write(next)
      }
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
        if (Number.isInteger(from) && from >= 0 && from < order.length) place(lift(order, from, to))
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
                    disabled={position === 0 || locked}
                    onClick={() => place(move(order, position, -1))}
                    aria-label="Move up"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    disabled={position === order.length - 1 || locked}
                    onClick={() => place(move(order, position, 1))}
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
            disabled={locked || busy}
            onClick={() => void submit(order)}
          >
            {label}
          </button>
          {foot}
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
              if (locked || busy) return
              // In a sitting the frame's report is written down and waits for Check, the
              // same as anything else the reader puts in.
              if (sitting) {
                setReported(value)
                write(value)
              } else void submit(value)
            }}
          />
          {sitting && (
            <Check
              busy={busy}
              locked={locked}
              ready={reported !== undefined}
              onCheck={() => void submit(reported)}
            />
          )}
          {foot}
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
              if (typed.trim() === '' || busy || locked) return
              void submit(typed.trim())
            }}
          >
            <textarea
              rows={4}
              value={typed}
              disabled={locked || busy}
              placeholder="Write your answer"
              onChange={(event) => {
                setTyped(event.target.value)
                write(event.target.value)
              }}
            />
            <div className="acts">
              {busy && <span className="waiting">Being marked</span>}
              <button type="submit" className="btn" disabled={locked || busy || typed.trim() === ''}>
                {label}
              </button>
            </div>
          </form>
          {foot}
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
              disabled={locked || busy}
              placeholder="Anything the marker should know (optional)"
              onChange={(event) => {
                setTyped(event.target.value)
                write({ note: event.target.value, files })
              }}
            />
            <div className="acts">
              {accepts.length > 0 && <span className="units">{accepts.join(' ')}</span>}
              {busy && <span className="waiting">Being marked</span>}
              <button
                type="button"
                className="quiet"
                disabled={locked || busy}
                onClick={() => {
                  void window.whetstone.tasks.attach(accepts).then((chosen) =>
                    setFiles((all) => {
                      const next = [...all, ...chosen.filter((file) => !all.includes(file))]
                      // A project-depth submission can take a day. What is attached is
                      // written down with the note, so a closed lid loses neither.
                      write({ note: typed, files: next })
                      return next
                    }),
                  )
                }}
              >
                Attach work
              </button>
              <button
                type="button"
                className="btn"
                disabled={locked || busy || files.length === 0}
                title={files.length === 0 ? 'Attach your work first' : 'Hand this in'}
                onClick={() => void submit(typed.trim(), files)}
              >
                {label}
              </button>
            </div>
          </div>
          {foot}
        </>
      )
    }

    default:
      return <div className="later">Unknown task kind “{question.kind}”.</div>
  }
}

/**
 * Reading back what was written down.
 *
 * A held answer is whatever the control put there and it comes back from the database as
 * JSON, so each of these takes the shape it wants and shrugs at anything else. A reader
 * whose written answer will not load gets an empty control, never a broken page.
 */
function asNumbers(given: unknown): number[] {
  return Array.isArray(given) && given.every((entry) => typeof entry === 'number') ? (given as number[]) : []
}

function asText(given: unknown): string {
  if (typeof given === 'string') return given
  if (typeof given === 'number') return String(given)
  if (given !== null && typeof given === 'object' && 'note' in given) {
    const note = (given as { note: unknown }).note
    return typeof note === 'string' ? note : ''
  }
  return ''
}

function asFiles(given: unknown): string[] {
  if (given === null || typeof given !== 'object' || !('files' in given)) return []
  const files = (given as { files: unknown }).files
  return Array.isArray(files) && files.every((entry) => typeof entry === 'string') ? (files as string[]) : []
}

/**
 * The Check button, for the controls that have no button of their own.
 *
 * A multiple choice and a Mini-app both answer on a press outside a sitting. Inside one
 * that press only writes the answer down, so the checking needs a button of its own.
 */
function Check({
  busy,
  locked,
  ready,
  onCheck,
}: {
  busy: boolean
  locked: boolean
  ready: boolean
  onCheck: () => void
}): React.JSX.Element {
  return (
    <div className="acts">
      {busy && <span className="waiting">Being marked</span>}
      <button type="button" className="btn" disabled={locked || busy || !ready} onClick={onCheck}>
        Check
      </button>
    </div>
  )
}

/**
 * What a checked question says: that it is checked, and nothing else.
 *
 * This is the sitting rule in the interface. No tick, no cross, and no wording that leans
 * one way, because a reader who can read the result off this line has been given the
 * result (docs/adr/0022).
 */
function Held({
  checked,
  trouble,
  onAgain,
}: {
  checked: boolean
  trouble: string
  onAgain: () => void
}): React.JSX.Element | null {
  // Trouble is not a wrong answer and not a checked question either. The run failed, so
  // nothing was recorded and the reveal is still waiting for this one (PLAN 3.15).
  if (trouble !== '') {
    return (
      <div className="vd" style={{ ['--vdc' as string]: 'var(--muted)' }}>
        <b>Not checked</b>
        <span>{trouble}</span>
        <button type="button" className="again" onClick={onAgain}>
          Try again
        </button>
      </div>
    )
  }
  if (!checked) return null
  return <p className="heldline">Checked. Held until you have checked every question.</p>
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
