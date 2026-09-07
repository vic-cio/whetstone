import { useCallback, useEffect, useRef, useState } from 'react'

import { newRunId } from '../shared/harness'
import type { Moment } from '../shared/harness'

/**
 * The Tutor panel.
 *
 * It is closed until the reader opens it, and opening it starts nothing. A conversation
 * begins cold when they send the first message and ends when they close it: there is no
 * resident process and no background listener (PLAN 3.5, test 15).
 *
 * One conversation per Page, kept in the database and never in the Course folder, so a
 * shared Course carries nobody's chat.
 */

interface Said {
  who: 'you' | 'tutor'
  text: string
}

export function Tutor({
  slug,
  pageId,
  agent,
  onHide,
}: {
  slug: string
  pageId: string
  agent: { harnessId: string; model: string }
  onHide: () => void
}): React.JSX.Element {
  const [said, setSaid] = useState<Said[]>([])
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [trouble, setTrouble] = useState('')
  const [attached, setAttached] = useState<string[]>([])
  const [chatId, setChatId] = useState('')

  const typing = useRef('')
  const [live, setLive] = useState('')

  // The run this panel started. Every run in the window reports on one channel, so without
  // this the Grader's words would land in the tutor's reply and a Grader failure would set
  // the tutor's error line.
  const mine = useRef('')

  // Reading a thread is a database read. It starts no process and costs nothing, which is
  // what test 15 is about: opening the panel is not asking a question.
  useEffect(() => {
    setSaid([])
    setLive('')
    setTrouble('')
    void window.whetstone.tutor.thread(slug, pageId).then((held) => {
      setSaid(held.thread?.messages ?? [])
      setChatId(held.thread?.id ?? '')
      setAttached(held.attached)
    })
  }, [slug, pageId])

  useEffect(
    () =>
      window.whetstone.runs.watch((run: string, moment: Moment) => {
        if (run !== mine.current) return
        if (moment.at === 'says') {
          typing.current += moment.text
          setLive(typing.current)
        }
        if (moment.at === 'failed') setTrouble(moment.message)
      }),
    [],
  )

  const ask = useCallback(async () => {
    const question = draft.trim()
    if (question === '' || busy) return
    setDraft('')
    setBusy(true)
    setTrouble('')
    typing.current = ''
    setLive('')
    setSaid((all) => [...all, { who: 'you', text: question }])

    mine.current = newRunId()
    const reply = await window.whetstone.tutor.ask(
      mine.current,
      slug,
      pageId,
      question,
      agent.harnessId,
      agent.model,
    )
    typing.current = ''
    setLive('')
    if (reply.text !== '') setSaid((all) => [...all, { who: 'tutor', text: reply.text }])
    // The first answer is what makes a conversation, and until this the panel learned the
    // id from the thread read alone, so Attach stayed disabled for the whole of a new one.
    if (reply.chatId !== undefined) setChatId(reply.chatId)
    // A Course that was changed and put back is worth saying out loud. It should never
    // happen, and the day it does the reader should not be the last to know (PLAN 3.14).
    if (reply.reverted !== undefined) setTrouble(reply.reverted)
    else if (!reply.ok) setTrouble(reply.message ?? 'The tutor could not answer.')
    setBusy(false)
  }, [draft, busy, slug, pageId, agent])

  return (
    <aside className="tutor">
      {/* A panel's control sits at the top of its own panel, where a person looks (3.17b). */}
      <button type="button" className="collapse" onClick={onHide}>
        ✕ hide tutor
      </button>

      <div className="tsaid">
        {said.length === 0 && !busy && (
          <p className="tempty">
            Ask about this page. The tutor has read it, and knows what you have been through.
          </p>
        )}
        {said.map((entry, index) => (
          <p key={index} className={entry.who === 'you' ? 'mine' : 'theirs'}>
            {entry.text}
          </p>
        ))}
        {live !== '' && <p className="theirs">{live}</p>}
        {busy && live === '' && <p className="theirs waiting">Reading</p>}
      </div>

      {trouble !== '' && <p className="trouble">{trouble}</p>}

      {attached.length > 0 && (
        <ul className="tray">
          {attached.map((name) => (
            <li key={name}>{name}</li>
          ))}
        </ul>
      )}

      <div className="tcompose">
        <textarea
          rows={3}
          value={draft}
          placeholder="Why was I wrong?"
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) void ask()
          }}
        />
        <div className="acts">
          <button
            type="button"
            className="quiet"
            disabled={chatId === ''}
            title={chatId === '' ? 'Ask something first' : 'Show the tutor a file or a photo'}
            onClick={() => void window.whetstone.tutor.attach(chatId).then(setAttached)}
          >
            Attach
          </button>
          <button type="button" className="btn" disabled={busy || draft.trim() === ''} onClick={() => void ask()}>
            Ask
          </button>
        </div>
      </div>
    </aside>
  )
}
