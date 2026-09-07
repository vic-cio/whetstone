import { useState } from 'react'

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
  onProject,
  onRemediate,
  onModule,
}: {
  course: CourseView
  onOpen: (pageId: string) => void
  onTick: (page: PageView) => void
  /** Start a review session: a handful of questions drawn at random, offline and free. */
  onReview: () => void
  /** Open a Project. It is a page of its own and it carries no tutor panel. */
  onProject: (projectId: string) => void
  /** Ask for another run at one Objective. An offer, and pressing it costs money. */
  onRemediate: (objective: { id: string; title: string }) => void
  /**
   * A whole Module is irrelevant or badly written. Rebuilding it costs money, and removing
   * it voids every Attempt under it, so both start from the reader saying what is wrong.
   */
  onModule: (
    module: { id: string; title: string },
    kind: 'rebuild-module' | 'remove-module',
    note: string,
  ) => void
}): React.JSX.Element {
  /** Which Module the reader is writing about, if any. One at a time. */
  const [saying, setSaying] = useState('')
  const [note, setNote] = useState('')
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
            <button
              type="button"
              className="link small"
              onClick={() => {
                setSaying(saying === module.id ? '' : module.id)
                setNote('')
              }}
            >
              {saying === module.id ? 'Never mind' : 'Something wrong with this module?'}
            </button>
          </div>

          {/*
            Module scale. A defect report is the small case; this is the large one, and it
            is deliberately not a button on its own: what is wrong has to be written down,
            because that sentence is the whole of what the Constructor is given to work from.
          */}
          {saying === module.id && (
            <div className="report">
              <textarea
                rows={2}
                value={note}
                placeholder="What is wrong with it?"
                onChange={(event) => setNote(event.target.value)}
              />
              <div className="acts">
                <button
                  type="button"
                  className="quiet"
                  disabled={note.trim() === ''}
                  title="Take the module out of the course, and void every attempt under it"
                  onClick={() => {
                    setSaying('')
                    onModule(module, 'remove-module', note.trim())
                  }}
                >
                  Remove it
                </button>
                <button
                  type="button"
                  className="btn"
                  disabled={note.trim() === ''}
                  onClick={() => {
                    setSaying('')
                    onModule(module, 'rebuild-module', note.trim())
                  }}
                >
                  Rebuild it
                </button>
              </div>
            </div>
          )}
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
        Projects, below the last Module. A section rather than a Page type, so it reaches
        neither the rail, the tick rules, nor the next-page logic. Most Courses have none,
        and a small Course cannot have one (PLAN 3.15, phase 6).
      */}
      {course.projects.length > 0 && (
        <div className="mod">
          <div className="mh">Projects</div>
          {course.projects.map((project) => (
            <div key={project.id} className="lrow2">
              <span className="tick off" aria-hidden="true" />
              <button type="button" className="lname" onClick={() => onProject(project.id)}>
                <span className="ptype">Project</span> {project.title}
                <small>{project.criteria.length} criteria</small>
              </button>
              <span className="prow end">
                <span className="chip depth-project">outside the app</span>
              </span>
            </div>
          ))}
        </div>
      )}

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