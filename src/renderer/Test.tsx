import { useEffect, useState } from 'react'

import { Answer } from './Answer'
import { Run } from './Prose'
import { newRunId } from '../shared/harness'
import { parseInline } from '../shared/markdown'
import type { PublicTask } from '../shared/format'
import type { RubricVerdict } from '../shared/verdict'
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
}: {
  slug: string
  test: TestView
  moduleTitle: string
  onAnswered: () => void
  /** Which harness judges a Task the host cannot. Unused by a deterministic one. */
  grading: { harnessId: string; model: string }
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
          {reporting === task.id ? (
            <Report slug={slug} taskId={task.id} onDone={() => setReporting('')} />
          ) : (
            <button type="button" className="link small" onClick={() => setReporting(task.id)}>
              Report a broken task
            </button>
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
 * records a claim. It never changes what was recorded.
 */
function Report({
  slug,
  taskId,
  onDone,
}: {
  slug: string
  taskId: string
  onDone: () => void
}): React.JSX.Element {
  const [ground, setGround] = useState<(typeof GROUNDS)[number]['id']>('inaccurate')
  const [note, setNote] = useState('')
  const [filed, setFiled] = useState(false)

  if (filed) return <p className="filed">Reported. This does not change your answer.</p>

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
        <button
          type="button"
          className="btn"
          disabled={note.trim() === ''}
          onClick={() => {
            void window.whetstone.defects.file(slug, taskId, ground, note.trim()).then(() => setFiled(true))
          }}
        >
          Report it
        </button>
      </div>
    </div>
  )
}
