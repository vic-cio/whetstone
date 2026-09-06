import { useCallback, useEffect, useState } from 'react'

import { Course } from './Course'
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
  | { at: 'course'; slug: string }
  | { at: 'page'; slug: string; pageId: string }

export function App(): React.JSX.Element {
  const [courses, setCourses] = useState<CourseSummary[]>([])
  const [broken, setBroken] = useState<BrokenCourse[]>([])
  const [loaded, setLoaded] = useState(false)
  const [route, setRoute] = useState<Route>({ at: 'home' })
  const [course, setCourse] = useState<CourseView | undefined>(undefined)
  const [failed, setFailed] = useState<CourseError[]>([])
  const [railOpen, setRailOpen] = useState(true)

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
    setRoute({ at: 'home' })
    setCourse(undefined)
    setFailed([])
    refreshLibrary()
  }, [refreshLibrary])

  const page = route.at === 'page' ? findPage(course, route.pageId) : undefined

  // What to read after this one. A Course is a list of Pages in the order the Constructor
  // put them in, so the next Page is simply the next one along.
  const order = course ? course.modules.flatMap((module) => module.pages) : []
  const here = route.at === 'page' ? order.findIndex((entry) => entry.id === route.pageId) : -1
  const next = here >= 0 ? order[here + 1] : undefined

  return (
    <div className={`app${railOpen ? '' : ' narrow'}`}>
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
          {route.at === 'home' ? (
            <>
              <div className="brand">Whetstone</div>
              {courses.map((entry) => (
                <button key={entry.slug} type="button" onClick={() => openCourse(entry.slug)}>
                  {entry.title}
                </button>
              ))}
              <div className="foot">
                <button type="button" className="hi">
                  + New course
                </button>
                <button type="button">Settings</button>
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
          <span>{route.at === 'home' ? 'Courses' : 'Contents'}</span>
        </button>
      )}

      <main className="reader">
        {route.at === 'home' && (
          <Home courses={courses} broken={broken} loaded={loaded} onOpen={openCourse} />
        )}

        {failed.length > 0 && <Broken slug={route.at === 'home' ? '' : route.slug} errors={failed} />}

        {route.at === 'course' && course && (
          <Course
            course={course}
            onOpen={(pageId) => openCourse(route.slug, pageId)}
            onTick={(entry) => {
              void window.whetstone.progress
                .setTick(route.slug, entry.id, entry.type, !entry.ticked)
                .then(setCourse)
            }}
          />
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
    </div>
  )
}

function Home({
  courses,
  broken,
  loaded,
  onOpen,
}: {
  courses: CourseSummary[]
  broken: BrokenCourse[]
  loaded: boolean
  onOpen: (slug: string) => void
}): React.JSX.Element {
  return (
    <>
      <div className="head">
        <h1 className="title">Courses</h1>
        <button type="button" className="btn">
          New course
        </button>
      </div>

      {courses.map((entry) => (
        <button key={entry.slug} type="button" className="crow" onClick={() => onOpen(entry.slug)}>
          <span>
            <span className="cname">{entry.title}</span>
            <span className="cmeta">
              {entry.subject} · {entry.moduleCount} {entry.moduleCount === 1 ? 'module' : 'modules'}
            </span>
          </span>
          <span className="cnt">
            {entry.pagesDone} of {entry.pageCount} pages
          </span>
        </button>
      ))}

      {loaded && courses.length === 0 && (
        <p className="empty">
          No courses yet. Describe something you want to learn and one gets built for you.
        </p>
      )}

      {broken.map((entry) => (
        <Broken key={entry.slug} slug={entry.slug} folder={entry.folder} errors={entry.errors} />
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
