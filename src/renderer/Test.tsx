import { useEffect, useState } from 'react'

import { Answer } from './Answer'
import { Run } from './Prose'
import { newRunId } from '../shared/harness'
import { parseInline } from '../shared/markdown'
import type { PublicTask } from '../shared/format'
import type { RubricVerdict } from '../shared/verdict'
import type { Evaluation } from '../shared/defect'
import type { RevealedView, SittingView, TestView } from '../main/study'

/**
 * A Test, which is a sitting (docs/adr/0022).
 *
 * You answer a question and press Check. The run happens then, and the result is held.
 * When the last question is checked, every result is revealed at once. There is no mark and
 * no number: the reveal is the list of questions with a tick or a cross beside each.
 *
 * Nothing is timed and nothing is locked. A Test is a place to find out what you can do,
 * not a gate, and `minutes` is what the Constructor thinks it takes rather than a clock.
 */
export function Test({
  slug,
  test,
  moduleTitle,
  onAnswered,
  grading,
  building,
}: {
  slug: string
  test: TestView
  moduleTitle: string
  onAnswered: () => void
  /** Which harness judges a Task the host cannot. Unused by a deterministic one. */
  grading: { harnessId: string; model: string }
  /** Which harness reads a defect report and mends what it agrees is broken. */
  building: { harnessId: string; model: string }
}): React.JSX.Element {
  const [sitting, setSitting] = useState<SittingView | undefined>(undefined)
  const [feedback, setFeedback] = useState(false)
  const [reporting, setReporting] = useState('')

  useEffect(() => {
    setFeedback(false)
    void window.whetstone.tasks.sitting(slug, test.id).then(setSitting)
  }, [slug, test.id])

  const checked = test.tasks.filter((task) => sitting?.answers[task.id]?.checked === true).length

  const head = (
    <div className="head">
      <div>
        <h1 className="title">{test.title}</h1>
        <p className="sub">
          {moduleTitle} / Test / {test.tasks.length} tasks
          {test.minutes !== undefined && ` / about ${test.minutes} minutes`}
        </p>
      </div>
    </div>
  )

  if (sitting === undefined) return head

  if (sitting.revealed) {
    return (
      <>
        {head}
        <Reveal
          test={test}
          sitting={sitting}
          feedback={feedback}
          onFeedback={() => setFeedback(true)}
          onRetake={() => {
            void window.whetstone.tasks.retake(slug, test.id).then((fresh) => {
              setFeedback(false)
              setSitting(fresh)
            })
          }}
        />
      </>
    )
  }

  return (
    <>
      {head}
      {/*
        Counting, never scoring. How many questions have been checked is a fact about where
        the reader is in the sitting, and says nothing about how any of them went.
      */}
      <p className="sitting">
        {checked} of {test.tasks.length} checked. Nothing is shown until you have checked
        every question.
      </p>

      {test.tasks.map((task, index) => (
        <div key={task.id} className="panel">
          <div className="prow">
            <span className="ptype">
              {String(index + 1).padStart(2, '0')} / {String(test.tasks.length).padStart(2, '0')}
            </span>
            <span className={`chip depth-${task.depth}`}>{task.depth}</span>
            <span className="chip k">{task.check === 'deterministic' ? '⚡ instant' : '✦ needs a model'}</span>
            {/*
              A flag, on the question's own row and out of the way. Reporting a broken task
              is rare and a sentence-long link beneath every question read as an invitation
              to argue with the marking, which is the one thing this is not.
            */}
            <button
              type="button"
              className={`flag${reporting === task.id ? ' on' : ''}`}
              title="Report this question as broken"
              aria-label="Report this question as broken"
              onClick={() => setReporting(reporting === task.id ? '' : task.id)}
            >
              ⚑
            </button>
          </div>
          <p className="q"><Run inline={parseInline(task.prompt)} /></p>
          {task.rubric !== undefined && (
            <ul className="rubric">
              {task.rubric.map((criterion) => (
                <li key={criterion.id}><Run inline={parseInline(criterion.criterion)} /></li>
              ))}
            </ul>
          )}
          <Answer
            // Keyed to the sitting, so a retake gives every control a fresh one rather than
            // the last sitting's answer still sitting in it.
            key={`${sitting.id}-${task.id}`}
            question={task}
            slug={slug}
            holding={{
              ...(sitting.answers[task.id] === undefined ? {} : { given: sitting.answers[task.id]!.given }),
              checked: sitting.answers[task.id]?.checked === true,
              onChange: (given) => {
                // Written down as it changes, so a half-answered Test survives a closed
                // window. Nothing is judged here (PLAN 3.4).
                void window.whetstone.tasks.hold(slug, test.id, task.id, given).then(setSitting)
              },
            }}
            send={async (given, submission) => {
              const result = await window.whetstone.tasks.check(
                newRunId(),
                slug,
                test.id,
                task.id,
                given,
                { ...grading, ...(submission === undefined ? {} : { submission }) },
              )
              if (result.at === 'trouble') return { trouble: result.message }
              setSitting(result.sitting)
              onAnswered()
              return { checked: true }
            }}
          />

          {/*
            A defect report is a claim that the Task itself is broken, on three grounds. It
            is not a dispute about a verdict, and upholding one never rescores (PLAN 3.15).
          */}
          {reporting === task.id && (
            <Report
              slug={slug}
              taskId={task.id}
              building={building}
              onDone={() => setReporting('')}
              onRepaired={onAnswered}
            />
          )}
        </div>
      ))}
    </>
  )
}

/**
 * The reveal.
 *
 * Every question, in order, with a tick or a cross. No mark, no percentage and no count of
 * how many went which way, because the moment there is a number at the top of this screen
 * the whole design has been undone (docs/adr/0022).
 */
function Reveal({
  test,
  sitting,
  feedback,
  onFeedback,
  onRetake,
}: {
  test: TestView
  sitting: SittingView
  feedback: boolean
  onFeedback: () => void
  onRetake: () => void
}): React.JSX.Element {
  return (
    <>
      <ul className="reveal">
        {test.tasks.map((task, index) => {
          const result = sitting.results?.[task.id]
          return (
            <li key={task.id} className={result?.passed ? 'ok' : 'no'}>
              <span className="ptype">{String(index + 1).padStart(2, '0')}</span>
              <span className="mark" aria-label={result?.passed ? 'Right' : 'Not right'}>
                {result?.passed ? '✓' : '✗'}
              </span>
              <span className="q"><Run inline={parseInline(task.prompt)} /></span>
            </li>
          )
        })}
      </ul>

      {feedback &&
        test.tasks.map((task) => {
          const result = sitting.results?.[task.id]
          if (!result) return null
          return <Feedback key={task.id} task={task} result={result} />
        })}

      {/* Under the list, and under the feedback once it is open, because both are read
          downwards and a button in the middle of the reading is a button in the way. */}
      <div className="acts">
        {!feedback && (
          <button type="button" className="quiet" onClick={onFeedback}>
            Get feedback
          </button>
        )}
        <button type="button" className="btn" onClick={onRetake}>
          Retake
        </button>
      </div>
    </>
  )
}

/** One question after the reveal: what you gave, how it went, and the Course's own words. */
function Feedback({ task, result }: { task: PublicTask; result: RevealedView }): React.JSX.Element {
  return (
    <div className="panel">
      <div className="prow">
        <span className={`chip depth-${task.depth}`}>{task.depth}</span>
        <span className={`mark ${result.passed ? 'ok' : 'no'}`}>{result.passed ? '✓' : '✗'}</span>
      </div>
      <p className="q"><Run inline={parseInline(task.prompt)} /></p>
      <p className="gave">
        <b>You gave</b> {gave(task, result.given)}
      </p>
      {result.assertions !== undefined && (
        <ul className="kass">
          {result.assertions.map((assertion) => (
            <li key={assertion.name} className={assertion.passed ? '' : 'f'}>
              {assertion.name}
            </li>
          ))}
        </ul>
      )}
      {result.explanation !== undefined && (
        <p className="why"><Run inline={parseInline(result.explanation)} /></p>
      )}
      {result.verdict?.kind === 'rubric' && (
        <Scored verdict={result.verdict} rubric={task.rubric ?? []} />
      )}
    </div>
  )
}

/**
 * What the reader gave, in the words of the question.
 *
 * An index is what the app recorded and it is meaningless to a person, so it is turned back
 * into the option they pressed.
 */
function gave(task: PublicTask, given: unknown): string {
  if (task.kind === 'multiple-choice' && Array.isArray(given)) {
    const options = task.options ?? []
    return given.map((index) => options[Number(index)] ?? String(index)).join(', ')
  }
  if (task.kind === 'ordering' && Array.isArray(given)) {
    const items = task.items ?? []
    return given.map((index) => items[Number(index)] ?? String(index)).join(' → ')
  }
  if (typeof given === 'string') return given === '' ? 'nothing' : given
  if (typeof given === 'number') return String(given)
  if (given !== null && typeof given === 'object' && 'files' in given) {
    const held = given as { note?: unknown; files?: unknown }
    const files = Array.isArray(held.files) ? held.files.map((file) => named(String(file))) : []
    const note = typeof held.note === 'string' && held.note !== '' ? `, and: ${held.note}` : ''
    return `${files.join(', ')}${note}`
  }
  return JSON.stringify(given)
}

const named = (path: string): string => path.split('/').filter(Boolean).pop() ?? path

/** A Rubric's score, one line per criterion, in the order the Task declared them. */
function Scored({
  verdict,
  rubric,
}: {
  verdict: RubricVerdict
  rubric: { id: string; criterion: string }[]
}): React.JSX.Element {
  const said = new Map(verdict.criteria.map((entry) => [entry.id, entry]))
  return (
    <ul className="scored">
      {rubric.map((criterion) => {
        const line = said.get(criterion.id)
        return (
          <li key={criterion.id} className={line?.met ? 'met' : 'unmet'}>
            <b><Run inline={parseInline(criterion.criterion)} /></b>
            {line && <span className="ev">{line.evidence}</span>}
            {line && line.missing.toLowerCase() !== 'nothing' && <span className="ms">{line.missing}</span>}
          </li>
        )
      })}
    </ul>
  )
}

const GROUNDS = [
  { id: 'inaccurate', says: 'It rests on something that is not true' },
  { id: 'impossible', says: 'It cannot be done as written' },
  { id: 'broke', says: 'Something broke' },
] as const

/**
 * Reporting a broken Task.
 *
 * Three grounds and no others, because the thing this must not become is an appeal. It
 * records a claim and never changes what was recorded.
 *
 * Filing one now brings the Constructor in (PLAN 3.15, phase 6). It reads the Task and the
 * note and comes back either agreeing or naming something that may have been missed, and it
 * settles nothing: the reader upholds the report or drops it. **Overriding a Constructor
 * that disagrees is theirs to do**, and a report that stands voids the Attempts against
 * that question and sends it back to be mended or removed.
 */
function Report({
  slug,
  taskId,
  building,
  onDone,
  onRepaired,
}: {
  slug: string
  taskId: string
  building: { harnessId: string; model: string }
  onDone: () => void
  onRepaired: () => void
}): React.JSX.Element {
  const [ground, setGround] = useState<(typeof GROUNDS)[number]['id']>('inaccurate')
  const [note, setNote] = useState('')
  const [reportId, setReportId] = useState('')
  const [asking, setAsking] = useState(false)
  const [said, setSaid] = useState<Evaluation | undefined>(undefined)
  const [upheld, setUpheld] = useState<{ note: string; lastInItsTest: boolean } | undefined>(undefined)
  const [mending, setMending] = useState('')

  /** File it, then ask. Filing is the record; asking is a run, and it costs money. */
  const fileIt = async (): Promise<void> => {
    setAsking(true)
    const id = await window.whetstone.defects.file(slug, taskId, ground, note.trim())
    setReportId(id)
    setSaid(
      await window.whetstone.defects.evaluate(newRunId(), slug, id, building.harnessId, building.model),
    )
    setAsking(false)
  }

  const uphold = async (overriding: boolean): Promise<void> => {
    const done = await window.whetstone.defects.uphold(slug, reportId, overriding)
    if (done.ok) setUpheld({ note: done.note, lastInItsTest: done.lastInItsTest })
  }

  /** Send it back to the Constructor to be mended or taken away. */
  const repair = (kind: 'fix-task' | 'remove-task'): void => {
    setMending(kind)
    void window.whetstone.course
      .revise(newRunId(), slug, building.harnessId, building.model, { kind, taskId, note: upheld?.note ?? '' })
      .then((result) => {
        setMending('')
        if (result.at === 'revised') onRepaired()
        else window.alert(result.at === 'trouble' ? result.message : 'The task could not be changed.')
        onDone()
      })
  }

  if (upheld) {
    return (
      <div className="report">
        <p className="filed">
          The report stands. Your attempts at this question are void, and it goes back to be
          mended.
        </p>
        <div className="acts">
          {mending !== '' && <span className="waiting">Working on it</span>}
          <button
            type="button"
            className="quiet"
            disabled={mending !== '' || upheld.lastInItsTest}
            title={
              upheld.lastInItsTest
                ? 'It is the only question in its test, so it is replaced rather than removed'
                : 'Take the question out of the course'
            }
            onClick={() => repair('remove-task')}
          >
            Remove it
          </button>
          <button type="button" className="btn" disabled={mending !== ''} onClick={() => repair('fix-task')}>
            Mend it
          </button>
        </div>
      </div>
    )
  }

  if (said?.at === 'evaluated') {
    return (
      <div className="report">
        <p className="said">
          <b>{said.agrees ? 'Agreed' : 'Not so'}</b>
          <Run inline={parseInline(said.text)} />
        </p>
        <div className="acts">
          <button type="button" className="quiet" onClick={() => void window.whetstone.defects.drop(reportId).then(onDone)}>
            {said.agrees ? 'Leave it' : 'Fair enough'}
          </button>
          <button type="button" className="btn" onClick={() => void uphold(!said.agrees)}>
            {said.agrees ? 'Have it mended' : 'It still stands'}
          </button>
        </div>
      </div>
    )
  }

  // Trouble is not a decision. The report is filed and open, and asking again is free of
  // any consequence except the run (PLAN 3.15).
  if (said?.at === 'trouble') {
    return (
      <div className="report">
        <p className="filed">Reported, and not yet read: {said.message}</p>
        <div className="acts">
          <button type="button" className="quiet" onClick={onDone}>
            Leave it filed
          </button>
          <button type="button" className="btn" onClick={() => void fileIt()}>
            Ask again
          </button>
        </div>
      </div>
    )
  }

  if (asking) return <p className="filed">Reported. The constructor is reading it.</p>

  return (
    <div className="report">
      {GROUNDS.map((entry) => (
        <label key={entry.id}>
          <input
            type="radio"
            name={`ground-${taskId}`}
            checked={ground === entry.id}
            onChange={() => setGround(entry.id)}
          />
          {entry.says}
        </label>
      ))}
      <textarea
        rows={2}
        value={note}
        placeholder="What is wrong with it?"
        onChange={(event) => setNote(event.target.value)}
      />
      <div className="acts">
        <button type="button" className="quiet" onClick={onDone}>
          Cancel
        </button>
        <button type="button" className="btn" disabled={note.trim() === ''} onClick={() => void fileIt()}>
          Report it
        </button>
      </div>
    </div>
  )
}
