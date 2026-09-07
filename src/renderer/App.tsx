import { useCallback, useEffect, useState } from 'react'

import { Course } from './Course'
import { NewCourse } from './NewCourse'
import { Review } from './Review'
import { Settings } from './Settings'
import { Tutor } from './Tutor'
import { Lesson } from './Lesson'
import { Test } from './Test'
import type { BrokenCourse, CourseSummary } from '../main/courseStore'
import type { CourseView, PageView } from '../main/study'
import type { CourseError } from '../shared/format'

/**
 * The reader.
 *
 * The rail holds one level at a time and there is no breadcrumb: Home lists Courses, a
 * Course lists its Pages, and a Page keeps that same list beside it. Home is a library
 * and nothing else. There is no dashboard, no counters panel, and no score.
 */

type Route =
  | { at: 'home' }
  | { at: 'new' }
  | { at: 'course'; slug: string }
  | { at: 'review'; slug: string }
  | { at: 'settings' }
  | { at: 'page'; slug: string; pageId: string }

export function App(): React.JSX.Element {
  const [courses, setCourses] = useState<CourseSummary[]>([])
  const [broken, setBroken] = useState<BrokenCourse[]>([])
  const [loaded, setLoaded] = useState(false)
  const [route, setRoute] = useState<Route>({ at: 'home' })
  const [course, setCourse] = useState<CourseView | undefined>(undefined)
  const [failed, setFailed] = useState<CourseError[]>([])
  const [railOpen, setRailOpen] = useState(true)
  const [tutorOpen, setTutorOpen] = useState(false)
  /** A revision run in flight. It costs money, so the page says so while it runs. */
  const [revising, setRevising] = useState('')

  /**
   * Which harness answers the questions the host cannot. One choice for the Tutor and the
   * Grader, taken from the registry, until Settings gives each role a row of its own
   * (PLAN 3.12). Reading the registry starts no process and costs nothing.
   */
  const [agent, setAgent] = useState({ harnessId: '', model: '' })
  const [grader, setGrader] = useState({ harnessId: '', model: '' })
  useEffect(() => {
    void Promise.all([window.whetstone.brief.harnesses(), window.whetstone.settings.roles()]).then(
      ([found, roles]) => {
        const first = found.harnesses.find((entry) => entry.installed) ?? found.harnesses[0]
        // A row that was never set falls back to the first installed harness and a mid-tier
        // model, which is what a turn of explaining is worth (PLAN 3.12).
        const fallback = {
          harnessId: first?.id ?? '',
          model: first?.models.find((name) => name.includes('sonnet')) ?? first?.models[0] ?? '',
        }
        setAgent(roles.tutor.harnessId === '' ? fallback : roles.tutor)
        setGrader(roles.grader.harnessId === '' ? fallback : roles.grader)
      },
    )
  }, [route.at])

  const refreshLibrary = useCallback(() => {
    void window.whetstone.courses.list().then((result) => {
      setCourses(result.courses)
      setBroken(result.broken)
      setLoaded(true)
    })
  }, [])

  useEffect(refreshLibrary, [refreshLibrary])

  const openCourse = useCallback((slug: string, pageId?: string) => {
    void window.whetstone.courses.open(slug).then((result) => {
      if (result.ok) {
        setCourse(result.course)
        setFailed([])
        setRoute(pageId === undefined ? { at: 'course', slug } : { at: 'page', slug, pageId })
      } else {
        setFailed(result.errors)
        setRoute({ at: 'course', slug })
      }
    })
  }, [])

  const goHome = useCallback(() => {
    // Leaving the brief bins it. A Run costs minutes rather than hours, so a half-written
    // course kept for later is state to get wrong for very little (PLAN 3.19).
    void window.whetstone.brief.discard()
    setRoute({ at: 'home' })
    setCourse(undefined)
    setFailed([])
    refreshLibrary()
  }, [refreshLibrary])

  const remove = useCallback(
    (slug: string, title: string) => {
      if (!window.confirm(`Delete "${title}"? The folder goes to the Trash.`)) return
      void window.whetstone.courses.remove(slug).then((result) => {
        if (!result.ok && result.message !== undefined) window.alert(result.message)
        refreshLibrary()
      })
    },
    [refreshLibrary],
  )

  const page = route.at === 'page' ? findPage(course, route.pageId) : undefined

  // What to read after this one. A Course is a list of Pages in the order the Constructor
  // put them in, so the next Page is simply the next one along.
  const order = course ? course.modules.flatMap((module) => module.pages) : []
  const here = route.at === 'page' ? order.findIndex((entry) => entry.id === route.pageId) : -1
  const next = here >= 0 ? order[here + 1] : undefined
  const previous = here > 0 ? order[here - 1] : undefined

  /**
   * Keyboard navigation in the reader.
   *
   * The Course is a list of Pages in the Constructor's order, so the keys are that order:
   * left and right along it, and escape back to the contents. Nothing here is a shortcut
   * for an action that spends money or records an Attempt, because a key pressed by
   * accident should never do either.
   */
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (route.at !== 'page') return
      const typing = event.target as HTMLElement | null
      const tag = typing?.tagName ?? ''
      // Somebody answering a question is using the same keys for something else.
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || typing?.isContentEditable) return
      if (event.metaKey || event.ctrlKey || event.altKey) return

      if (event.key === 'ArrowRight' && next) openCourse(route.slug, next.id)
      else if (event.key === 'ArrowLeft' && previous) openCourse(route.slug, previous.id)
      else if (event.key === 'Escape') openCourse(route.slug)
      else return
      event.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [route, next, previous, openCourse])

  return (
    <div className={`app${railOpen ? '' : ' narrow'}${tutorOpen ? ' asking' : ''}`}>
      {/*
        The window has no title bar of its own, so the page has to say which part of it is
        one. Without this strip there is nowhere to take hold of the window and it cannot
        be moved. Everything inside it is padding, so nothing is covered.
      */}
      <div className="drag" />

      {railOpen ? (
        <nav className="rail">
          <button type="button" className="collapse" onClick={() => setRailOpen(false)}>
            ☰ hide
          </button>
          {route.at === 'home' || route.at === 'new' || route.at === 'settings' ? (
            <>
              <div className="brand">Whetstone</div>
              {courses.map((entry) => (
                <button key={entry.slug} type="button" onClick={() => openCourse(entry.slug)}>
                  {entry.title}
                </button>
              ))}
              <div className="foot">
                <button type="button" className="hi" onClick={() => setRoute({ at: 'new' })}>
                  + New course
                </button>
                <button type="button" onClick={() => setRoute({ at: 'settings' })}>
                  Settings
                </button>
              </div>
            </>
          ) : (
            <>
              <button type="button" className="back" onClick={goHome}>
                ← All courses
              </button>
              {(course?.modules ?? []).map((module, index) => (
                <div key={module.id}>
                  <div className="rlabel">
                    {String(index + 1).padStart(2, '0')} {module.title}
                  </div>
                  {module.pages.map((entry) => (
                    <button
                      key={entry.id}
                      type="button"
                      className={route.at === 'page' && route.pageId === entry.id ? 'on' : ''}
                      onClick={() => openCourse(route.slug, entry.id)}
                    >
                      {entry.title}
                      {entry.type === 'test' && <span className="tt">test</span>}
                    </button>
                  ))}
                </div>
              ))}
              <div className="foot">
                <button type="button" onClick={() => openCourse(route.slug)}>
                  Course contents
                </button>
              </div>
            </>
          )}
        </nav>
      ) : (
        <button type="button" className="stub" onClick={() => setRailOpen(true)}>
          <b>☰</b>
          <span>{route.at === 'course' || route.at === 'page' || route.at === 'review' ? 'Contents' : 'Courses'}</span>
        </button>
      )}

      <main className="reader">
        {route.at === 'home' && (
          <Home
            courses={courses}
            broken={broken}
            loaded={loaded}
            onOpen={openCourse}
            onNew={() => setRoute({ at: 'new' })}
            onRemove={remove}
          />
        )}

        {route.at === 'settings' && <Settings onDone={goHome} />}

        {route.at === 'new' && (
          <NewCourse
            onOpen={(slug) => {
              refreshLibrary()
              openCourse(slug)
            }}
            onLeave={goHome}
          />
        )}

        {failed.length > 0 && (
          <Broken slug={route.at === 'course' || route.at === 'page' ? route.slug : ''} errors={failed} />
        )}

        {route.at === 'course' && course && (
          <Course
            course={course}
            onOpen={(pageId) => openCourse(route.slug, pageId)}
            onTick={(entry) => {
              void window.whetstone.progress
                .setTick(route.slug, entry.id, entry.type, !entry.ticked)
                .then(setCourse)
            }}
            onReview={() => setRoute({ at: 'review', slug: route.slug })}
            onRemediate={(objective) => {
              setRevising(objective.title)
              void window.whetstone.course
                .revise(route.slug, agent.harnessId, agent.model, {
                  kind: 'remediate',
                  objective: objective.id,
                  title: objective.title,
                })
                .then((result) => {
                  setRevising('')
                  if (result.at === 'revised') openCourse(route.slug)
                  else window.alert(result.at === 'trouble' ? result.message : 'The course could not be changed.')
                })
            }}
          />
        )}

        {route.at === 'review' && (
          <Review
            slug={route.slug}
            onDone={() => openCourse(route.slug)}
            onAnswered={() => {
              void window.whetstone.courses.open(route.slug).then((result) => {
                if (result.ok) setCourse(result.course)
              })
            }}
          />
        )}

        {revising !== '' && (
          <p className="empty">Writing another run at “{revising}”. This takes a few minutes.</p>
        )}

        {route.at === 'page' && course && page?.type === 'lesson' && course.lessons[page.id] && (
          <Lesson
            slug={route.slug}
            lesson={course.lessons[page.id]!}
            resources={course.resources}
            moduleTitle={moduleTitleOf(course, page.id)}
            onReachedEnd={() => {
              void window.whetstone.progress.reachedEnd(route.slug, page.id).then((result) => {
                if (result.ok) setCourse(result.course)
              })
            }}
          />
        )}

        {route.at === 'page' && course && page?.type === 'test' && course.tests[page.id] && (
          <Test
            slug={route.slug}
            test={course.tests[page.id]!}
            moduleTitle={moduleTitleOf(course, page.id)}
            onAnswered={() => {
              void window.whetstone.courses.open(route.slug).then((result) => {
                if (result.ok) setCourse(result.course)
              })
            }}
            grading={grader}
          />
        )}

        {route.at === 'page' && course && page && (
          <div className="onward">
            {next ? (
              <button type="button" className="next" onClick={() => openCourse(route.slug, next.id)}>
                <span>
                  <span className="nlabel">Next up</span>
                  <span className="ntitle">{next.title}</span>
                </span>
                <span className="nmark">→</span>
              </button>
            ) : (
              // The last Page of the Course. Going nowhere from here is worse than going
              // back to the contents, which is the only other place there is to go.
              <button type="button" className="next" onClick={() => openCourse(route.slug)}>
                <span>
                  <span className="nlabel">That is the last page</span>
                  <span className="ntitle">Course contents</span>
                </span>
                <span className="nmark">→</span>
              </button>
            )}
          </div>
        )}
      </main>

      {/*
        The Tutor. It exists only on a Page, because a conversation is about a Page, and it
        is closed until the reader opens it. Opening it starts nothing (test 15).
      */}
      {route.at === 'page' &&
        (tutorOpen ? (
          <Tutor slug={route.slug} pageId={route.pageId} agent={agent} onHide={() => setTutorOpen(false)} />
        ) : (
          <button type="button" className="stub tstub" onClick={() => setTutorOpen(true)}>
            <b>?</b>
            <span>Tutor</span>
          </button>
        ))}
    </div>
  )
}

function Home({
  courses,
  broken,
  loaded,
  onOpen,
  onNew,
  onRemove,
}: {
  courses: CourseSummary[]
  broken: BrokenCourse[]
  loaded: boolean
  onOpen: (slug: string) => void
  onNew: () => void
  onRemove: (slug: string, title: string) => void
}): React.JSX.Element {
  return (
    <>
      <div className="head">
        <h1 className="title">Courses</h1>
        <button type="button" className="btn" onClick={onNew}>
          New course
        </button>
      </div>

      {courses.map((entry) => (
        <div key={entry.slug} className="crow">
          <button type="button" className="cgo" onClick={() => onOpen(entry.slug)}>
            <span className="cname">{entry.title}</span>
            <span className="cmeta">
              {entry.subject} · {entry.moduleCount} {entry.moduleCount === 1 ? 'module' : 'modules'}
            </span>
          </button>
          <span className="cnt">
            {entry.pagesDone} of {entry.pageCount} pages
          </span>
          <span className="crowdo">
            <button type="button" className="cbin" onClick={() => void window.whetstone.courses.export(entry.slug)}>
              Export
            </button>
            <button type="button" className="cbin" onClick={() => onRemove(entry.slug, entry.title)}>
              Delete
            </button>
          </span>
        </div>
      ))}

      {loaded && courses.length === 0 && (
        <p className="empty">
          No courses yet. Describe something you want to learn and one gets built for you.
        </p>
      )}

      {broken.map((entry) => (
        <div key={entry.slug}>
          <Broken slug={entry.slug} folder={entry.folder} errors={entry.errors} />
          <button type="button" className="cbin" onClick={() => onRemove(entry.slug, entry.slug)}>
            Delete
          </button>
        </div>
      ))}
    </>
  )
}

function Broken({
  slug,
  folder,
  errors,
}: {
  slug: string
  folder?: string
  errors: CourseError[]
}): React.JSX.Element {
  return (
    <div className="broken">
      <h2>{slug === '' ? 'This course' : slug} could not be read</h2>
      {folder !== undefined && <p className="bpath">{folder}</p>}
      <ul>
        {errors.slice(0, 6).map((error, index) => (
          <li key={index}>
            {error.file}
            {error.field !== undefined ? ` · ${error.field}` : ''} — {error.message}
          </li>
        ))}
      </ul>
    </div>
  )
}

const findPage = (course: CourseView | undefined, pageId: string): PageView | undefined =>
  course?.modules.flatMap((module) => module.pages).find((page) => page.id === pageId)

function moduleTitleOf(course: CourseView, pageId: string): string {
  const index = course.modules.findIndex((module) => module.pages.some((page) => page.id === pageId))
  const module = course.modules[index]
  return module ? `${String(index + 1).padStart(2, '0')} ${module.title}` : ''
}
