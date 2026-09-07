import { useEffect, useState } from 'react'

/**
 * Settings: one row per role.
 *
 * The Constructor, the Tutor and the Grader are three profiles over one spawn layer, and
 * this is the only place that difference is visible to anybody (PLAN 3.12). The model list
 * comes from the harness, so switching harness resets the model rather than leaving a pair
 * that cannot run.
 *
 * A harness that is not installed is still listed, greyed, naming itself. Hiding it leaves
 * the reader guessing why the thing they read about is not there.
 */

type Role = 'constructor' | 'tutor' | 'grader'

const ROLES: { id: Role; title: string; what: string }[] = [
  { id: 'constructor', title: 'Building a course', what: 'Runs for minutes and writes the whole course. Worth the strongest model.' },
  { id: 'tutor', title: 'The tutor', what: 'One turn per question, inside the course. A mid-tier model is enough.' },
  { id: 'grader', title: 'Marking an answer', what: 'Short and frequent, except a rubric, which is somebody’s work.' },
]

interface Entry {
  id: string
  label: string
  models: string[]
  installed: boolean
}

export function Settings({ onDone }: { onDone: () => void }): React.JSX.Element {
  const [harnesses, setHarnesses] = useState<Entry[]>([])
  const [chosen, setChosen] = useState<Record<Role, { harnessId: string; model: string }>>({
    constructor: { harnessId: '', model: '' },
    tutor: { harnessId: '', model: '' },
    grader: { harnessId: '', model: '' },
  })
  const [trouble, setTrouble] = useState('')

  useEffect(() => {
    void window.whetstone.brief.harnesses().then((found) => {
      setHarnesses(found.harnesses)
      if (found.errors.length > 0) setTrouble(found.errors[0] as string)
    })
    void window.whetstone.settings.roles().then(setChosen)
  }, [])

  const set = (role: Role, harnessId: string, model: string): void => {
    setChosen((all) => ({ ...all, [role]: { harnessId, model } }))
    void window.whetstone.settings.setRole(role, harnessId, model)
  }

  return (
    <>
      <div className="head">
        <h1 className="title">Settings</h1>
        <button type="button" className="quiet" onClick={onDone}>
          Done
        </button>
      </div>

      {trouble !== '' && <p className="trouble">{trouble}</p>}

      {ROLES.map((role) => {
        const pick = chosen[role.id]
        const harness = harnesses.find((entry) => entry.id === pick.harnessId) ?? harnesses[0]
        return (
          <div key={role.id} className="srow">
            <div>
              <b>{role.title}</b>
              <span>{role.what}</span>
            </div>
            <select
              value={harness?.id ?? ''}
              onChange={(event) => {
                const next = harnesses.find((entry) => entry.id === event.target.value)
                // The model list belongs to the harness, so this resets it rather than
                // leaving a pair that cannot run.
                if (next) set(role.id, next.id, next.models[0] ?? '')
              }}
            >
              {harnesses.map((entry) => (
                <option key={entry.id} value={entry.id} disabled={!entry.installed}>
                  {entry.label}
                  {entry.installed ? '' : ' (not installed)'}
                </option>
              ))}
            </select>
            <select
              value={pick.model}
              onChange={(event) => set(role.id, harness?.id ?? '', event.target.value)}
            >
              {(harness?.models ?? []).map((model) => (
                <option key={model} value={model}>
                  {model}
                </option>
              ))}
            </select>
          </div>
        )
      })}

      <p className="empty">
        Whetstone spawns a command line tool you installed and logged into yourself, so it
        stores no key of its own. A harness listed as not installed is one this machine does
        not have on its path.
      </p>
    </>
  )
}
