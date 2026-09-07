import type { CourseView, PageView } from '../main/study'

/**
 * A Course page. The summary, the Ladder this Course uses, and every Module with its
 * Pages. The tickboxes are here and nowhere else, so progress is something the user
 * looks at deliberately rather than something following them around.
 */
const DEPTHS = ['recall', 'apply', 'construct', 'transfer', 'project'] as const

export function Course({
  course,
  onOpen,
  onTick,
  onReview,
  onRemediate,
}: {
  course: CourseView
  onOpen: (pageId: string) => void
  onTick: (page: PageView) => void
  /** Start a review session: a handful of questions drawn at random, offline and free. */
  onReview: () => void
  /** Ask for another run at one Objective. An offer, and pressing it costs money. */
  onRemediate: (objective: { id: string; title: string }) => void
}): React.JSX.Element {
  return (
    <>
      <div className="head">
        <div>
          <h1 className="title">{course.title}</h1>
          <p className="sub">
            {course.pagesDone} of {course.pageCount} pages · {course.modules.length} modules
          </p>
        </div>
      </div>

      <div className="prose">
        <p>{course.summary}</p>
      </div>

      <div className="ladder">
        {DEPTHS.map((depth) =>
          course.ladder.includes(depth) ? (
            <span key={depth} className={`depth-${depth}`}>
              {depth}
            </span>
          ) : (
            <span key={depth} className="off">
              {depth}
            </span>
          ),
        )}
      </div>

      {course.modules.map((module, index) => (
        <div key={module.id} className="mod">
          <div className="mh">
            {String(index + 1).padStart(2, '0')} {module.title}
          </div>
          {module.pages.map((page) => (
            <div key={page.id} className="lrow2">
              <button
                type="button"
                className={`tick${page.ticked ? ' on' : ''}`}
                aria-label={page.ticked ? `Untick ${page.title}` : `Tick ${page.title}`}
                aria-pressed={page.ticked}
                onClick={() => onTick(page)}
              >
                ✓
              </button>
              <button type="button" className="lname" onClick={() => onOpen(page.id)}>
                <span className="ptype">{page.type === 'lesson' ? 'Lesson' : 'Test'}</span> {page.title}
                {page.hasActivity === true && <small>has an activity</small>}
                {page.taskCount !== undefined && <small>{page.taskCount} tasks</small>}
              </button>
              <span className="prow end">
                {page.minutes !== undefined && <span className="chip k">{page.minutes} min</span>}
                {(page.depths ?? []).map((depth) => (
                  <span key={depth} className={`chip depth-${depth}`}>
                    {depth}
                  </span>
                ))}
                {page.checks !== undefined && (
                  <span className="chip k">
                    {page.checks.every((check) => check === 'deterministic') ? '⚡' : '✦'}
                  </span>
                )}
              </span>
            </div>
          ))}
        </div>
      ))}

      {/*
        What the reader got wrong and has not since got right. Reachable here and nowhere
        else: no count on the home screen, no due date, and no schedule, because that is
        the machinery that turns study into homework (PLAN 3.15).
      */}
      {course.missed.length > 0 && (
        <div className="mod">
          <div className="mh mhead">
            <span className="lname">Missed</span>
            <button type="button" className="quiet" onClick={onReview}>
              Review
            </button>
          </div>
          {course.missed.map((entry) => (
            <button key={entry.taskId} type="button" className="mrow" onClick={() => onOpen(entry.testId)}>
              <span className="mq">{entry.prompt}</span>
              <span className="cmeta">{entry.title}</span>
            </button>
          ))}
        </div>
      )}

      {course.missed.length === 0 && (
        <p className="onward">
          <button type="button" className="quiet" onClick={onReview}>
            Review a few at random
          </button>
        </p>
      )}

      {/* Three fails on one objective with no pass since. An offer, never an intervention. */}
      {course.struggling.map((objective) => (
        <div key={objective.id} className="offer">
          <b>{objective.title}</b>
          <span>
            This one has gone wrong three times. The course can take another run at it, in a
            different shape. That builds new pages and costs money.
          </span>
          <button type="button" className="quiet" onClick={() => onRemediate(objective)}>
            Teach it differently
          </button>
        </div>
      ))}
    </>
  )
}