import { useEffect, useState } from 'react'

import { Prose, Run } from './Prose'
import { newRunId } from '../shared/harness'
import { parseInline } from '../shared/markdown'
import type { Project as ProjectView } from '../shared/format'
import type { Submission } from '../main/progress'

/**
 * A Project.
 *
 * Open-ended work covering a theme or the whole Course. You do it outside the app with
 * ordinary tools, then come back and submit a folder and a list of links.
 *
 * There is no tutor panel here, and that is the point: a project is a real-world setting,
 * and the app's job is to hold the brief, the criteria and the response.
 *
 * What comes back is one written response, in the register of a senior colleague reading
 * the work. No pass, no fail, no number, and no thread. To argue with it, take the
 * criteria, the work and the response to an ordinary chat outside the app (PLAN 3.15).
 */
export function Project({
  slug,
  project,
  reviewing,
}: {
  slug: string
  project: ProjectView
  /** Which harness reads a project. Its own row in Settings, because it costs more. */
  reviewing: { harnessId: string; model: string }
}): React.JSX.Element {
  const [folder, setFolder] = useState<string | undefined>(undefined)
  const [links, setLinks] = useState('')
  const [busy, setBusy] = useState(false)
  const [trouble, setTrouble] = useState('')
  const [past, setPast] = useState<Submission[]>([])

  useEffect(() => {
    setFolder(undefined)
    setLinks('')
    setTrouble('')
    void window.whetstone.projects.list(slug, project.id).then(setPast)
  }, [slug, project.id])

  const named = (path: string): string => path.split('/').filter(Boolean).pop() ?? path
  const takesFolder = project.accepts.includes('folder')
  const takesLinks = project.accepts.includes('links')
  const given = links
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '')
  const ready = (takesFolder && folder !== undefined) || (takesLinks && given.length > 0)

  const submit = (): void => {
    setBusy(true)
    setTrouble('')
    void window.whetstone.projects
      .submit(newRunId(), slug, project.id, folder, given, reviewing.harnessId, reviewing.model)
      .then((result) => {
        setBusy(false)
        if (result.at === 'trouble') setTrouble(result.message)
        else {
          setPast(result.submissions)
          setFolder(undefined)
        }
      })
  }

  return (
    <>
      <div className="head">
        <div>
          <h1 className="title">{project.title}</h1>
          <p className="sub">Project / done outside the app / {project.criteria.length} criteria</p>
        </div>
      </div>

      <Prose markdown={project.brief} />

      {/* The criteria exist before the work starts, which is what makes it finishable. */}
      <div className="mod">
        <div className="mh">What it is read for</div>
        <ul className="rubric">
          {project.criteria.map((criterion) => (
            <li key={criterion.id}><Run inline={parseInline(criterion.criterion)} /></li>
          ))}
        </ul>
      </div>

      <div className="handin">
        {takesFolder && folder !== undefined && (
          <ul className="tray">
            <li>{named(folder)}</li>
          </ul>
        )}
        {takesLinks && (
          <textarea
            rows={3}
            value={links}
            disabled={busy}
            placeholder="Links, one per line"
            onChange={(event) => setLinks(event.target.value)}
          />
        )}
        <div className="acts">
          {busy && <span className="waiting">Being read</span>}
          {takesFolder && (
            <button
              type="button"
              className="quiet"
              disabled={busy}
              onClick={() => {
                void window.whetstone.projects.pick().then((picked) => {
                  if (picked !== undefined) setFolder(picked)
                })
              }}
            >
              {folder === undefined ? 'Choose the folder' : 'Choose another folder'}
            </button>
          )}
          <button type="button" className="btn" disabled={busy || !ready} onClick={submit}>
            Submit it
          </button>
        </div>
      </div>

      {trouble !== '' && (
        <div className="vd" style={{ ['--vdc' as string]: 'var(--muted)' }}>
          <b>Not read</b>
          <span>{trouble}</span>
        </div>
      )}

      {/*
        Every response is kept, newest first. A resubmission is read by a run that has never
        seen the last one, so these are separate readings rather than a conversation.
      */}
      {past.map((entry) => (
        <div key={entry.id} className="panel">
          <p className="sub">{new Date(entry.submittedAt).toLocaleString()}</p>
          <Prose markdown={entry.responseText} />
          {entry.links.length > 0 && (
            <ul className="tray">
              {entry.links.map((link) => (
                <li key={link}>{link}</li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </>
  )
}
