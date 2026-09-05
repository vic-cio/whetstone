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
}: {
  course: CourseView
  onOpen: (pageId: string) => void
  onTick: (page: PageView) => void
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
    </>
  )
}
