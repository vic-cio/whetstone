import { useEffect, useState } from 'react'

import type { BrokenCourse, CourseSummary } from '../main/courseStore'

/**
 * Home is the course library and nothing else. There is no dashboard, no counters panel,
 * and no score: the only progress figure anywhere is pages done out of pages total.
 */
export function App(): React.JSX.Element {
  const [courses, setCourses] = useState<CourseSummary[]>([])
  const [broken, setBroken] = useState<BrokenCourse[]>([])
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    void window.whetstone.courses.list().then((result) => {
      setCourses(result.courses)
      setBroken(result.broken)
      setLoaded(true)
    })
  }, [])

  return (
    <div className="app">
      <nav className="rail">
        <div className="brand">Whetstone</div>
        {courses.map((course) => (
          <button key={course.slug} type="button">
            {course.title}
          </button>
        ))}
        <div className="foot">
          <button type="button" className="hi">
            + New course
          </button>
          <button type="button">Settings</button>
        </div>
      </nav>

      <main className="reader">
        <div className="head">
          <h1 className="title">Courses</h1>
          <button type="button" className="btn">
            New course
          </button>
        </div>

        {courses.map((course) => (
          <button key={course.slug} type="button" className="crow">
            <span>
              <span className="cname">{course.title}</span>
              <span className="cmeta">
                {course.subject} · {course.moduleCount} modules
              </span>
            </span>
            <span className="cnt">
              {course.pagesDone} of {course.pageCount} pages
            </span>
          </button>
        ))}

        {loaded && courses.length === 0 && (
          <p className="empty">
            No courses yet. Describe something you want to learn and one gets built for you.
          </p>
        )}

        {broken.map((course) => (
          <div key={course.slug} className="broken">
            <h2>{course.slug} could not be read</h2>
            <ul>
              {course.errors.slice(0, 6).map((error, index) => (
                <li key={index}>
                  {error.file}
                  {error.field ? ` · ${error.field}` : ''} — {error.message}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </main>
    </div>
  )
}
