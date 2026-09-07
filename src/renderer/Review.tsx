import { useEffect, useState } from 'react'

import { Answer } from './Answer'
import { Run } from './Prose'
import { newRunId } from '../shared/harness'
import { parseInline } from '../shared/markdown'
import type { PublicTask } from '../shared/format'

/**
 * A review session.
 *
 * A handful of Tasks drawn at random from Objectives the reader has already touched.
 * Deterministic only, so it runs offline and costs nothing (PLAN 3.15).
 *
 * At random is the whole of it. There is no weighting by how badly a Task went, no
 * interval, and no due date, because every one of those is a spaced-repetition scheduler
 * wearing a smaller hat, and that is the thing this app exists not to be.
 */
export function Review({
  slug,
  onDone,
  onAnswered,
}: {
  slug: string
  onDone: () => void
  onAnswered: () => void
}): React.JSX.Element {
  const [drawn, setDrawn] = useState<{ testId: string; task: PublicTask }[]>([])
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    void window.whetstone.review.draw(slug).then((session) => {
      setDrawn(session)
      setLoaded(true)
    })
  }, [slug])

  return (
    <>
      <div className="head">
        <div>
          <h1 className="title">Review</h1>
          <p className="sub">
            {drawn.length === 0 ? 'Nothing to review yet' : `${drawn.length} at random`}
          </p>
        </div>
        <button type="button" className="quiet" onClick={onDone}>
          Done
        </button>
      </div>

      {loaded && drawn.length === 0 && (
        <p className="empty">
          A review draws from what you have already answered. Work through a test first, and
          there will be something to come back to.
        </p>
      )}

      {drawn.map(({ testId, task }, index) => (
        <div key={task.id} className="panel">
          <div className="prow">
            <span className="ptype">{String(index + 1).padStart(2, '0')}</span>
            <span className={`chip depth-${task.depth}`}>{task.depth}</span>
          </div>
          <p className="q"><Run inline={parseInline(task.prompt)} /></p>
          <Answer
            question={task}
            slug={slug}
            send={async (given) => {
              // Recorded against the Test the Task lives in. A review Attempt is an
              // Attempt: getting one right here takes it off the missed list.
              const result = await window.whetstone.tasks.answer(newRunId(), slug, testId, task.id, given)
              if (result.at === 'trouble') return { trouble: result.message }
              onAnswered()
              return result.outcome
            }}
          />
        </div>
      ))}
    </>
  )
}
