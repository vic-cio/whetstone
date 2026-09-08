import { useCallback, useEffect, useState } from 'react'

import { Course } from './Course'
import { NewCourse } from './NewCourse'
import { Review } from './Review'
import { Settings } from './Settings'
import { Tutor } from './Tutor'
import { Lesson } from './Lesson'
import { Test } from './Test'
import { Project } from './Project'
import { Building, describe, feedLine } from './Building'
import type { BuildState } from './Building'
import { newRunId } from '../shared/harness'
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
  /** The build screen. A build outlives it, so this is a view of one rather than the run. */
  | { at: 'building' }
  /** A Project: below the last Module, outside the reading order, and no tutor panel. */
  | { at: 'project'; slug: string; projectId: string }

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
   * The build, which belongs to the window rather than to the New Course screen.
   *
   * It takes minutes, so the reader has to be able to go and read something else while it
   * happens. Keeping it here is what lets them: leaving that screen leaves a page, and the
   * run carries on in the main process. Only Stop ends it.
   */
  const [build, setBuild] = useState<BuildState | undefined>(undefined)
  /**
   * Whether there is a newer build than this one.
   *
   * Checked once a launch, and it only ever tells: the version sits at the foot of the rail
   * and becomes a button when there is something newer. Updating from a terminal is not a
   * thing to ask of somebody who was given this app by a friend.
   */
  const [update, setUpdate] = useState<{ current: string; latest?: string; newer: boolean; url?: string }>({
    current: '',
    newer: false,
  })
  const [updating, setUpdating] = useState(false)
  /** A build that stopped and is still on disk, offered on the home screen until it is used. */
  const [stopped, setStopped] = useState<
    { at: string; started: string; canResume: boolean } | undefined
  >(undefined)

  /**
   * Which harness answers the questions the host cannot. One row per role, from Settings,
   * falling back to the registry for a row nobody has set (PLAN 3.12). Reading the registry
   * starts no process and costs nothing.
   */
  const [agent, setAgent] = useState({ harnessId: '', model: '' })
  const [grader, setGrader] = useState({ harnessId: '', model: '' })
  /** The Reviewer's row. It reads a folder rather than a file, so it is worth more. */
  const [reviewer, setReviewer] = useState({ harnessId: '', model: '' })
  /** The Constructor's row. A remediation run is a Constructor run, so it uses this. */
  const [builder, setBuilder] = useState({ harnessId: '', model: '' })
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
        setReviewer(roles.reviewer.harnessId === '' ? fallback : roles.reviewer)
        setBuilder(roles.constructor.harnessId === '' ? fallback : roles.constructor)
      },
    )
  }, [route.at])

  // A build reports on the same channel as everything else, so anything that is not this
  // build is read and dropped. The New Course screen and the Tutor do the same with theirs.
  useEffect(
    () =>
      window.whetstone.runs.watch((run, moment) => {
        setBuild((state) => {
          if (!state || run !== state.run) return state
          const line = feedLine(moment)
          return {
            ...state,
            log: [...state.log, describe(moment)],
            ...(line === undefined ? {} : { feed: [...state.feed, line] }),
            ...(moment.at === 'finished' ? { spent: state.spent + moment.usd } : {}),
          }
        })
      }),
    [],
  )

  useEffect(() => {
    void window.whetstone.update.check().then(setUpdate)
  }, [])

  // A build that stopped part way. Read from the folder rather than from memory, so it is
  // still there after the app has been closed for the hours a usage limit takes to reset.
  const lookForStopped = useCallback(() => {
    void window.whetstone.brief.resumable().then(setStopped)
  }, [])
  useEffect(lookForStopped, [lookForStopped])


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

  /**
   * Start a build, or carry one on.
   *
   * The same call either way: the main process holds the folder and the harness's session,
   * so a build that stopped on a usage limit continues where it was rather than beginning
   * again. It is here rather than in the New Course screen because it outlives that screen.
   */
  const startBuild = useCallback(
    (transcript: string, pick: { harnessId: string; model: string }, cap: number) => {
      const run = newRunId()
      setBuild({ run, feed: [], log: [], spent: 0, cap })
      setRoute({ at: 'building' })
      void window.whetstone.brief.build(run, pick.harnessId, pick.model, transcript).then((result) => {
        if (result.ok && result.slug !== undefined) {
          setBuild(undefined)
          setStopped(undefined)
          refreshLibrary()
          openCourse(result.slug)
          return
        }
        lookForStopped()
        setBuild((state) =>
          state === undefined
            ? undefined
            : {
                ...state,
                transcript,
                pick,
                cap,
                failed: {
                  message: result.message ?? 'The course was not built.',
                  errors: result.errors,
                  folder: result.folder,
                },
              },
        )
      })
    },
    [refreshLibrary, openCourse, lookForStopped],
  )

  const goHome = useCallback(() => {
    // Leaving the brief bins it. A Run costs minutes rather than hours, so a half-written
    // course kept for later is state to get wrong for very little (PLAN 3.19). A brief that
    // is building is not binned: the main process refuses, because the folder it would
    // delete is the one the run is writing into.
    void window.whetstone.brief.discard()
    setRoute({ at: 'home' })
    setCourse(undefined)
    setFailed([])
    refreshLibrary()
  }, [refreshLibrary])

  /**
   * Delete a Course.
   *
   * The warning says what actually goes, because two different things do: the folder, which
   * is recoverable from the Trash, and everything the app recorded about it, which is not.
   * Deleting the Course that is open also leaves the page it was being read on.
   */
  const remove = useCallback(
    (slug: string, title: string) => {
      const asked = window.confirm(
        `Delete "${title}"?\n\n` +
          'The course folder goes to the Trash, so it can be recovered from there. Your ' +
          'progress through it, your tutor conversations about it and any work you submitted ' +
          'to it are deleted with it, and those cannot.',
      )
      if (!asked) return
      void window.whetstone.courses.remove(slug).then((result) => {
        if (!result.ok && result.message !== undefined) window.alert(result.message)
        refreshLibrary()
        // Whatever was on screen is about a course that is not there any more.
        if (route.at !== 'home' && route.at !== 'settings' && route.at !== 'new') goHome()
      })
    },
    [refreshLibrary, goHome, route],
  )

  const page = route.at === 'page' ? findPage(course, route.pageId) : undefined
  const projectHere =
    route.at === 'project' ? course?.projects.find((entry) => entry.id === route.projectId) : undefined

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
          {route.at === 'home' || route.at === 'new' || route.at === 'settings' || route.at === 'building' ? (
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
                {/*
                  Which version this is, and the way to get the next one. It is a line of
                  text until there is something newer, and a button when there is.
                */}
                {update.newer && update.url !== undefined ? (
                  <button
                    type="button"
                    className="newer"
                    disabled={updating}
                    onClick={() => {
                      if (!window.confirm(`Update to ${update.latest}? Whetstone will restart.`)) return
                      setUpdating(true)
                      void window.whetstone.update.apply(update.url ?? '').then((done) => {
                        setUpdating(false)
                        if (!done.ok) window.alert(done.message ?? 'The update did not finish.')
                      })
                    }}
                  >
                    {updating ? 'Updating…' : `Update to ${update.latest}`}
                  </button>
                ) : (
                  update.current !== '' && <span className="version">Whetstone {update.current}</span>
                )}
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
            stopped={stopped}
            onResume={() => {
              if (!stopped) return
              void window.whetstone.brief.resume(stopped.at).then((held) => {
                if (!held.ok || held.transcript === undefined) {
                  window.alert('That build could not be picked up.')
                  lookForStopped()
                  return
                }
                startBuild(
                  held.transcript,
                  { harnessId: held.harnessId ?? '', model: held.model ?? '' },
                  update.current === '' ? 3 : 3,
                )
              })
            }}
            onForget={() => {
              if (!window.confirm('Throw away the course that was being built? What it wrote is deleted.')) return
              void window.whetstone.brief.drop().then(lookForStopped)
            }}
          />
        )}

        {route.at === 'settings' && <Settings onDone={goHome} />}

        {route.at === 'new' && (
          <NewCourse
            onLeave={goHome}
            onBuild={startBuild}
          />
        )}

        {route.at === 'building' && build && (
          <Building
            state={build}
            onStop={() => {
              void window.whetstone.brief.cancel()
              setBuild(undefined)
              setStopped(undefined)
              goHome()
            }}
            onClose={() => {
              // What it wrote stays where it is, and the home screen offers it back.
              setBuild(undefined)
              lookForStopped()
              goHome()
            }}
            onResume={() => {
              if (build.transcript === undefined || build.pick === undefined) return
              startBuild(build.transcript, build.pick, build.cap)
            }}
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
            onProject={(projectId) => setRoute({ at: 'project', slug: route.slug, projectId })}
            onRemove={() => remove(route.slug, course.title)}
            onModule={(module, kind, note) => {
              // Removing a Module takes its Attempts off the record first. An Attempt
              // against a question that no longer exists is a mark for something nobody
              // can look at, and the run that removes it is the one that might fail.
              setRevising(module.title)
              const before =
                kind === 'remove-module'
                  ? window.whetstone.defects.voidModule(route.slug, module.id)
                  : Promise.resolve([])
              void before
                .then(() =>
                  window.whetstone.course.revise(newRunId(), route.slug, builder.harnessId, builder.model, {
                    kind,
                    moduleId: module.id,
                    title: module.title,
                    note,
                  }),
                )
                .then((result) => {
                  setRevising('')
                  if (result.at === 'revised') openCourse(route.slug)
                  else window.alert(result.at === 'trouble' ? result.message : 'The course could not be changed.')
                })
            }}
            onAddRung={(depth) => {
              setRevising(`${depth} questions`)
              void window.whetstone.course
                .revise(newRunId(), route.slug, builder.harnessId, builder.model, { kind: 'add-rung', depth })
                .then((result) => {
                  setRevising('')
                  if (result.at === 'revised') openCourse(route.slug)
                  else window.alert(result.at === 'trouble' ? result.message : 'The course could not be changed.')
                })
            }}
            onRemediate={(objective) => {
              setRevising(objective.title)
              void window.whetstone.course
                .revise(newRunId(), route.slug, builder.harnessId, builder.model, {
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

        {/*
          A Project has no tutor panel, and it gets one by being outside `route.at ===
          'page'` rather than by a flag. A project id that no longer exists, because the
          Course was rebuilt under it, draws the empty line rather than nothing at all.
        */}
        {route.at === 'project' &&
          course &&
          (projectHere ? (
            <Project slug={route.slug} project={projectHere} reviewing={reviewer} />
          ) : (
            <p className="empty">That project is no longer in this course.</p>
          ))}

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
            building={builder}
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
        A build, from anywhere else in the app.
        
        It runs for minutes in the main process, so the reader is free to go and read
        something in the meantime. This is how they know it is still going and how they get
        back to it, and it is the only thing in the window that follows them around.
      */}
      {build && route.at !== 'building' && (
        <button type="button" className="ongoing" onClick={() => setRoute({ at: 'building' })}>
          <span className="odot" aria-hidden="true" />
          {build.failed ? 'A course was not built' : 'Building a course'}
          <span className="ogo">{build.failed ? 'see why' : 'watch it'}</span>
        </button>
      )}

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
  stopped,
  onResume,
  onForget,
}: {
  courses: CourseSummary[]
  broken: BrokenCourse[]
  loaded: boolean
  onOpen: (slug: string) => void
  onNew: () => void
  onRemove: (slug: string, title: string) => void
  /** A build that stopped part way and is still on disk, if there is one. */
  stopped: { at: string; started: string; canResume: boolean } | undefined
  onResume: () => void
  onForget: () => void
}): React.JSX.Element {
  /** The tag the library is filtered by, or nothing. One at a time, and never a search. */
  const [tag, setTag] = useState('')

  // Every tag in the library, most used first. The list is drawn from the Courses
  // themselves, so a tag disappears when the last Course carrying it does.
  const counts = new Map<string, number>()
  for (const entry of courses) for (const one of entry.tags) counts.set(one, (counts.get(one) ?? 0) + 1)
  const tags = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
  const shown = tag === '' ? courses : courses.filter((entry) => entry.tags.includes(tag))

  return (
    <>
      <div className="head">
        <h1 className="title">Courses</h1>
        <button type="button" className="btn" onClick={onNew}>
          New course
        </button>
      </div>

      {/*
        A build that stopped. The usual reason is a plan's usage limit, which resets hours
        later with the app long closed, so this is offered here rather than only on the
        screen it stopped on: the folder and the harness's session are both still there.
      */}
      {stopped && (
        <div className="offer">
          <b>A course was left part way through</b>
          <span>
            Building it stopped on {new Date(stopped.started).toLocaleString()}.{' '}
            {stopped.canResume
              ? 'Everything written so far is still here, and carrying on continues from that point rather than starting again.'
              : 'Everything written so far is still here. It was interrupted by a version of this app that kept no record of the conversation, so it cannot be carried on, but nothing has been deleted.'}
          </span>
          <div className="acts">
            <button type="button" className="quiet danger" onClick={onForget}>
              Throw it away
            </button>
            {stopped.canResume ? (
              <button type="button" className="btn" onClick={onResume}>
                Carry on building it
              </button>
            ) : (
              <button
                type="button"
                className="quiet"
                onClick={() => void window.whetstone.courses.reveal(stopped.at)}
              >
                Show me what it wrote
              </button>
            )}
          </div>
        </div>
      )}

      {tags.length > 0 && (
        <div className="tags">
          <button
            type="button"
            className={`tag${tag === '' ? ' on' : ''}`}
            onClick={() => setTag('')}
          >
            All
          </button>
          {tags.map(([one]) => (
            <button
              key={one}
              type="button"
              className={`tag${tag === one ? ' on' : ''}`}
              onClick={() => setTag(tag === one ? '' : one)}
            >
              {one}
            </button>
          ))}
        </div>
      )}

      {shown.map((entry) => (
        <div key={entry.slug} className="crow">
          <button type="button" className="cgo" onClick={() => onOpen(entry.slug)}>
            <span className="cname">{entry.title}</span>
            <span className="cmeta">
              {entry.subject} · {entry.moduleCount} {entry.moduleCount === 1 ? 'module' : 'modules'}
              {entry.small && ' · small'}
              {entry.tags.length > 0 && ` · ${entry.tags.join(', ')}`}
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

      {courses.length > 0 && shown.length === 0 && (
        <p className="empty">Nothing in the library is tagged “{tag}” any more.</p>
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
