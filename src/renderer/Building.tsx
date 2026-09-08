import type { Moment } from '../shared/harness'
import type { CourseError } from '../shared/format'

/**
 * A build, while it happens.
 *
 * The run itself lives in the main process and takes minutes, so this screen is a view of
 * it rather than the thing keeping it alive. The reader can leave, read something else, and
 * come back, and the build carries on either way: what they leave is a page, not a process.
 *
 * Only Stop ends it. Navigating away used to, by deleting the staging folder the run was
 * writing into, which is the worst way to lose twenty minutes of work.
 */

export interface BuildState {
  /** The run this screen is watching, so somebody else's moments do not land here. */
  run: string
  feed: string[]
  log: string[]
  spent: number
  cap: number
  /** Set when the build is over and did not produce a Course. */
  failed?: { message: string; errors: CourseError[]; folder: string }
}

export function Building({
  state,
  onStop,
  onClose,
}: {
  state: BuildState
  /** Ends the run and bins its folder. The only thing that does. */
  onStop: () => void
  /** Leaves the failure screen. The build is over, so this only closes a page. */
  onClose: () => void
}): React.JSX.Element {
  if (state.failed) {
    return (
      <>
        <div className="head">
          <h1 className="title">The course was not built</h1>
          <button type="button" className="quiet" onClick={onClose}>
            Close
          </button>
        </div>
        <p className="empty">{state.failed.message}</p>
        {state.failed.errors.length > 0 && (
          <ul className="feed">
            {state.failed.errors.slice(0, 8).map((error, index) => (
              <li key={index}>
                {error.file}
                {error.field === undefined ? '' : ` · ${error.field}`}: {error.message}
              </li>
            ))}
          </ul>
        )}
        {state.failed.folder !== '' && (
          <div className="acts">
            <button
              type="button"
              className="quiet"
              onClick={() => void window.whetstone.courses.reveal(state.failed?.folder ?? '')}
            >
              Show me what it wrote
            </button>
          </div>
        )}
      </>
    )
  }

  return (
    <>
      <div className="head">
        <h1 className="title">Building</h1>
        <button type="button" className="quiet" onClick={onStop}>
          Stop
        </button>
      </div>
      <p className="empty">
        This takes a few minutes. You can read something else while it runs and come back:
        the bar at the top of the window brings you here. Nothing is added to your library
        until the course is finished and the app has read it.
      </p>
      <ul className="feed">
        {state.feed.map((line, index) => (
          <li key={index}>{line}</li>
        ))}
        {state.feed.length === 0 && <li className="waiting">Starting</li>}
      </ul>
      <p className="spend">
        ${state.spent.toFixed(2)} of ${state.cap.toFixed(2)}
      </p>
      <details className="log">
        <summary>Technical log</summary>
        <pre>{state.log.join('\n')}</pre>
      </details>
    </>
  )
}

/** The feed: what the run is doing, in the app's own words. Never a tool name (PLAN 3.6). */
export function feedLine(moment: Moment): string | undefined {
  if (moment.at === 'doing') return moment.what
  if (moment.at === 'wrote') return `Wrote ${moment.file}`
  return undefined
}

/** The technical log: the Moments themselves, and still never the raw stream. */
export function describe(moment: Moment): string {
  switch (moment.at) {
    case 'started':
      return `started ${moment.model}`
    case 'says':
      return `says ${moment.text.length} characters`
    case 'doing':
      return `doing ${moment.what}`
    case 'wrote':
      return `wrote ${moment.file}`
    case 'finished':
      return `finished $${moment.usd.toFixed(4)}${moment.denied.length > 0 ? ` (${moment.denied.join(', ')})` : ''}`
    case 'failed':
      return `failed ${moment.message}`
  }
}
