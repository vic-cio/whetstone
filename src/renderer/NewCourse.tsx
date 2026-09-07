import { useCallback, useEffect, useRef, useState } from 'react'

import { newRunId } from '../shared/harness'
import type { Moment } from '../shared/harness'
import type { CourseError } from '../shared/format'

/**
 * New course.
 *
 * A conversation, not a form (PLAN 3.19). The user says what they want, the Constructor
 * answers and asks back, and each exchange is one spawn that answers and writes nothing.
 * Pressing Build the course is the only thing here that writes anything, and it writes into
 * staging rather than into the library.
 *
 * The outline is a message in the same conversation. It is the cheapest place to be wrong:
 * arguing with a list of Objectives costs a moment, and arguing with a built Course costs a
 * build.
 */

interface Said {
  who: 'you' | 'them'
  text: string
}

interface Harnesses {
  id: string
  label: string
  models: string[]
  installed: boolean
}

/** What a build costs at most. The CLI keeps this cap; the app only shows it. */
const CAP = 3

export function NewCourse({
  onOpen,
  onLeave,
}: {
  onOpen: (slug: string) => void
  onLeave: () => void
}): React.JSX.Element {
  const [said, setSaid] = useState<Said[]>([])
  const [draft, setDraft] = useState('')
  const [tray, setTray] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [trouble, setTrouble] = useState('')

  const [harnesses, setHarnesses] = useState<Harnesses[]>([])
  const [pick, setPick] = useState<{ harnessId: string; model: string }>({ harnessId: '', model: '' })
  const [changing, setChanging] = useState(false)

  const [building, setBuilding] = useState(false)
  const [feed, setFeed] = useState<string[]>([])
  const [log, setLog] = useState<string[]>([])
  const [spent, setSpent] = useState(0)
  const [failed, setFailed] = useState<{ message: string; errors: CourseError[]; folder: string } | undefined>()

  // The answer as it is typed. It is a ref as well as state because a delta arrives many
  // times a second and every one of them would otherwise be a render of the whole page.
  const typing = useRef('')
  const [live, setLive] = useState('')

  // The run this page started. Every run in the window reports on one channel, so anything
  // else going on at the same time, a Grader or the Tutor, is read and dropped here.
  const mine = useRef('')

  useEffect(() => {
    void window.whetstone.brief.start()
    /*
     * The Constructor's row from Settings, not the first harness that happens to be
     * installed. This is the role whose model matters most, and the setting could not reach
     * it: a build always ran on whatever came first in the registry. The row is still a
     * starting point rather than a lock, because the picker below is right here.
     */
    void Promise.all([window.whetstone.brief.harnesses(), window.whetstone.settings.roles()]).then(
      ([found, roles]) => {
        setHarnesses(found.harnesses)
        const named = found.harnesses.find((entry) => entry.id === roles.constructor.harnessId)
        const first = found.harnesses.find((entry) => entry.installed) ?? found.harnesses[0]
        if (named) setPick({ harnessId: named.id, model: roles.constructor.model || (named.models[0] ?? '') })
        else if (first) setPick({ harnessId: first.id, model: first.models[0] ?? '' })
        if (found.errors.length > 0) setTrouble(found.errors[0] as string)
      },
    )
    return window.whetstone.runs.watch((run, moment) => {
      if (run !== mine.current) return
      setLog((lines) => [...lines, describe(moment)])
      if (moment.at === 'says') {
        typing.current += moment.text
        setLive(typing.current)
      }
      if (moment.at === 'doing') setFeed((lines) => [...lines, moment.what])
      if (moment.at === 'wrote') setFeed((lines) => [...lines, `Wrote ${moment.file}`])
      if (moment.at === 'finished') setSpent((usd) => usd + moment.usd)
      if (moment.at === 'failed') setTrouble(moment.message)
    })
  }, [])

  const chosen = harnesses.find((entry) => entry.id === pick.harnessId)

  /** One exchange: the message goes up, the answer comes back as it is typed. */
  const exchange = useCallback(
    async (asked: string | undefined, ask: () => Promise<{ ok: boolean; text: string; message?: string }>) => {
      setBusy(true)
      setTrouble('')
      typing.current = ''
      setLive('')
      if (asked !== undefined) setSaid((all) => [...all, { who: 'you', text: asked }])

      const answer = await ask()
      setLive('')
      typing.current = ''
      if (answer.text !== '') setSaid((all) => [...all, { who: 'them', text: answer.text }])
      if (!answer.ok) setTrouble(answer.message ?? 'That did not work.')
      setBusy(false)
    },
    [],
  )

  const send = (): void => {
    const text = draft.trim()
    if (text === '' || busy) return
    setDraft('')
    mine.current = newRunId()
    void exchange(text, () => window.whetstone.brief.say(mine.current, text, pick.harnessId, pick.model))
  }

  const outline = (): void => {
    if (busy) return
    mine.current = newRunId()
    void exchange(undefined, () => window.whetstone.brief.outline(mine.current, pick.harnessId, pick.model))
  }

  const build = async (): Promise<void> => {
    if (busy) return
    setBuilding(true)
    setFeed([])
    setTrouble('')
    const transcript = said.map((entry) => `${entry.who === 'you' ? 'User' : 'You'}: ${entry.text}`).join('\n\n')
    mine.current = newRunId()
    const result = await window.whetstone.brief.build(mine.current, pick.harnessId, pick.model, transcript)
    if (result.ok && result.slug !== undefined) {
      onOpen(result.slug)
      return
    }
    setBuilding(false)
    setFailed({
      message: result.message ?? 'The course was not built.',
      errors: result.errors,
      folder: result.folder,
    })
  }

  const stop = (): void => {
    void window.whetstone.brief.cancel()
    setBuilding(false)
    onLeave()
  }

  if (building) {
    return (
      <>
        <div className="head">
          <h1 className="title">Building</h1>
          <button type="button" className="quiet" onClick={stop}>
            Stop
          </button>
        </div>
        <p className="empty">
          This takes a few minutes. Nothing is added to your library until the course is finished and
          the app has read it.
        </p>
        <ul className="feed">
          {feed.map((line, index) => (
            <li key={index}>{line}</li>
          ))}
          {feed.length === 0 && <li className="waiting">Starting</li>}
        </ul>
        <p className="spend">
          ${spent.toFixed(2)} of ${CAP.toFixed(2)}
        </p>
        <Log lines={log} />
      </>
    )
  }

  if (failed) {
    return (
      <>
        <div className="head">
          <h1 className="title">The course was not built</h1>
          <button type="button" className="quiet" onClick={onLeave}>
            Close
          </button>
        </div>
        <p className="empty">{failed.message}</p>
        {failed.errors.length > 0 && (
          <div className="broken">
            <h2>What the app could not read</h2>
            <ul>
              {failed.errors.slice(0, 8).map((error, index) => (
                <li key={index}>
                  {error.file}
                  {error.field !== undefined ? ` · ${error.field}` : ''} — {error.message}
                </li>
              ))}
            </ul>
          </div>
        )}
        <p className="onward">
          <button type="button" className="quiet" onClick={() => void window.whetstone.courses.reveal(failed.folder)}>
            Show me the folder
          </button>
        </p>
        <Log lines={log} />
      </>
    )
  }

  return (
    <>
      <div className="head">
        <h1 className="title">New course</h1>
        <button type="button" className="quiet" onClick={onLeave}>
          Cancel
        </button>
      </div>

      {said.length === 0 && (
        <p className="empty">
          Say what you want to learn, and what you can already do. Attach anything worth building
          around: a paper, a syllabus, a photo of your notes.
        </p>
      )}

      <div className="talk">
        {said.map((entry, index) => (
          <p key={index} className={entry.who === 'you' ? 'mine' : 'theirs'}>
            {entry.text}
          </p>
        ))}
        {live !== '' && <p className="theirs">{live}</p>}
        {busy && live === '' && <p className="theirs waiting">Thinking</p>}
      </div>

      {trouble !== '' && <p className="trouble">{trouble}</p>}

      {tray.length > 0 && (
        <ul className="tray">
          {tray.map((name) => (
            <li key={name}>{name}</li>
          ))}
        </ul>
      )}

      <div className="composer">
        <textarea
          value={draft}
          rows={3}
          placeholder="What do you want to be able to do?"
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) send()
          }}
        />
        <div className="acts">
          <button type="button" onClick={() => void window.whetstone.brief.attach().then(setTray)}>
            Attach
          </button>
          <button type="button" className="btn" disabled={busy || draft.trim() === ''} onClick={send}>
            Send
          </button>
        </div>
      </div>

      <div className="onward">
        <p className="using">
          {chosen?.label ?? 'No harness'} · {pick.model} · up to ${CAP.toFixed(2)}{' '}
          <button type="button" className="link" onClick={() => setChanging(!changing)}>
            {changing ? 'done' : 'change'}
          </button>
        </p>
        {changing && (
          <p className="using">
            <select
              value={pick.harnessId}
              onChange={(event) => {
                const next = harnesses.find((entry) => entry.id === event.target.value)
                // The model list belongs to the harness, so switching resets it rather than
                // leaving a pair that cannot run.
                if (next) setPick({ harnessId: next.id, model: next.models[0] ?? '' })
              }}
            >
              {harnesses.map((entry) => (
                <option key={entry.id} value={entry.id} disabled={!entry.installed}>
                  {entry.label}
                  {entry.installed ? '' : ' (not installed)'}
                </option>
              ))}
            </select>
            <select value={pick.model} onChange={(event) => setPick({ ...pick, model: event.target.value })}>
              {(chosen?.models ?? []).map((model) => (
                <option key={model} value={model}>
                  {model}
                </option>
              ))}
            </select>
          </p>
        )}
        <div className="acts">
          <button type="button" disabled={busy || said.length === 0} onClick={outline}>
            Propose an outline
          </button>
          <button type="button" className="btn" disabled={busy || said.length === 0} onClick={() => void build()}>
            Build the course
          </button>
        </div>
      </div>
    </>
  )
}

/**
 * The technical log, closed by default and never opened by the app.
 *
 * It holds what the app understood, not the harness's own stream. The stream never crosses
 * the bridge, and adding a second channel to carry it would be a hole in the one thing the
 * first channel is for.
 */
function Log({ lines }: { lines: string[] }): React.JSX.Element {
  return (
    <details className="log">
      <summary>Technical log</summary>
      <pre>{lines.join('\n')}</pre>
    </details>
  )
}

function describe(moment: Moment): string {
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
