import { useState } from 'react'

import { Answer } from './Answer'
import { Run } from './Prose'
import { parseInline } from '../shared/markdown'
import type { RubricVerdict } from '../shared/verdict'
import type { TestView } from '../main/study'

/**
 * A Test. The same reader in a different mode: Tasks are numbered, every answer is
 * recorded as an Attempt, and a wrong one offers another go.
 *
 * Nothing is timed and nothing is locked. A Test is a place to find out what you can do,
 * not a gate.
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
  const [scored, setScored] = useState<Record<string, RubricVerdict>>({})
  const [reporting, setReporting] = useState('')

  return (
    <>
      <div className="head">
        <div>
          <h1 className="title">{test.title}</h1>
          <p className="sub">
            {moduleTitle} / Test / {test.tasks.length} tasks
          </p>
        </div>
      </div>

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
            question={task}
            slug={slug}
            send={async (given) => {
              const result = await window.whetstone.tasks.answer(slug, test.id, task.id, given, grading)
              if (result.at === 'trouble') return { trouble: result.message }
              onAnswered()
              if (result.verdict?.kind === 'rubric') {
                setScored((all) => ({ ...all, [task.id]: result.verdict as RubricVerdict }))
              }
              return result.outcome
            }}
          />

          {scored[task.id] && <Scored verdict={scored[task.id]!} rubric={task.rubric ?? []} />}

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
