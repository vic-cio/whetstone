import { Answer } from './Answer'
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
}: {
  slug: string
  test: TestView
  moduleTitle: string
  onAnswered: () => void
}): React.JSX.Element {
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
          <p className="q">{task.prompt}</p>
          {task.rubric !== undefined && (
            <ul className="rubric">
              {task.rubric.map((criterion) => (
                <li key={criterion.id}>{criterion.criterion}</li>
              ))}
            </ul>
          )}
          <Answer
            question={task}
            slug={slug}
            send={async (given) => {
              const result = await window.whetstone.tasks.answer(slug, test.id, task.id, given)
              onAnswered()
              return result.outcome
            }}
          />
        </div>
      ))}
    </>
  )
}
