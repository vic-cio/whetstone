import { DatabaseSync } from 'node:sqlite'
import { randomUUID } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

import type { Seen } from '../shared/again'
import type { Check, Depth, PageType } from '../shared/format'

/**
 * The Progress DB.
 *
 * Progress is one bit per Page. There is no score here, no percentage, and no ability
 * estimate, because a running judgement of how well the user holds something is the
 * tutor-and-pupil dynamic the app is built to avoid (PLAN 3.4).
 *
 * Attempts are still written in full, with their Objective, Depth and Check, because that
 * record costs nothing now and cannot be reconstructed later. Nothing in the interface
 * reads it yet.
 *
 * This uses Node's own `node:sqlite`, which Electron ships. `better-sqlite3` would be a
 * native module needing a rebuild against every Electron version, for the same SQL.
 */

/** A Page's tick. A row exists only once something has been said about that Page. */
export interface Tick {
  ticked: boolean
  /** True when the user set it by hand, rather than the app earning it. */
  byUser: boolean
}

export interface AttemptRecord {
  courseSlug: string
  taskId: string
  objectiveId: string
  depth: Depth
  check: Check
  outcome: 'pass' | 'fail' | 'voided'
  /** The Grader's whole answer, when there was one. Kept so a Verdict can be shown again. */
  verdictJson?: string
}

/**
 * One Tutor conversation, kept here and never in the Course folder.
 *
 * A conversation is about a Course but is not part of it, so it must not travel with a
 * shared Course. `session` is the harness's own, so the next message continues the same
 * conversation rather than starting another (PLAN 3.4).
 */
export interface Thread {
  id: string
  messages: { who: 'you' | 'tutor'; text: string }[]
  session?: string
}

/**
 * A claim that a Task itself is broken, on exactly three grounds. It is not a dispute about
 * a Verdict, and upholding one never rescores anything (PLAN 3.15).
 */
export const GROUNDS = ['inaccurate', 'impossible', 'broke'] as const
export type Ground = (typeof GROUNDS)[number]

/** One execution of a Harness. Every Run is recorded, spend included (PLAN 3.4). */
export interface RunRecord {
  kind: string
  courseSlug?: string
  harness: string
  model: string
}

export interface Progress {
  ticks(courseSlug: string): Record<string, Tick>
  pagesDone(courseSlug: string): number
  /** The user's own tick or untick. Always wins, and is never overwritten by the app. */
  setTickByUser(courseSlug: string, pageId: string, pageType: PageType, ticked: boolean): void
  /**
   * A tick the app earned: the user reached the end of a Lesson, or attempted every Task
   * in a Test. It never overwrites a row, so a Page the user unticked on purpose stays
   * unticked even if they read it again.
   */
  earnTick(courseSlug: string, pageId: string, pageType: PageType): void
  recordAttempt(attempt: AttemptRecord): string
  attemptedTaskIds(courseSlug: string): Set<string>
  /** Every Attempt against this Course, for the missed list and a review draw. */
  attemptsFor(courseSlug: string): Seen[]
  /**
   * Void every Attempt against one Task. This is what upholding a defect report does: it
   * takes the Attempts off the record because the question was broken. It never rescores.
   */
  voidAttempts(courseSlug: string, taskId: string): void
  /** Open a Run's row. It is written before the spawn, so a crash still leaves a trace. */
  startRun(run: RunRecord): string
  endRun(id: string, usd: number, status: 'ok' | 'failed' | 'cancelled'): void
  /** What the last Run against this Course used, which is what a new one pre-fills from. */
  lastRun(courseSlug: string): { harness: string; model: string } | undefined
  /** The conversation about one Page, if there has been one. */
  thread(courseSlug: string, pageId: string): Thread | undefined
  saveThread(courseSlug: string, pageId: string, thread: Thread): void
  /** File a defect report. It records a claim; it never changes an outcome. */
  fileDefect(report: { courseSlug: string; taskId: string; ground: Ground; note: string }): string
  defectsFor(courseSlug: string): { taskId: string; ground: Ground; status: string }[]
  /** Which harness and model each role uses. Never a secret: those live in the Keychain. */
  setting(key: string): string | undefined
  setSetting(key: string, value: string): void
  /** Everything the database holds about one Course. Deleting a Course deletes this. */
  forget(courseSlug: string): void
  close(): void
}

export function openProgress(file: string): Progress {
  if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true })
  const db = new DatabaseSync(file)
  db.exec('PRAGMA journal_mode = WAL')
  db.exec(`
    CREATE TABLE IF NOT EXISTS page_ticks (
      courseSlug TEXT NOT NULL,
      pageId     TEXT NOT NULL,
      pageType   TEXT NOT NULL,
      ticked     INTEGER NOT NULL,
      byUser     INTEGER NOT NULL,
      tickedAt   TEXT NOT NULL,
      PRIMARY KEY (courseSlug, pageId)
    );
    CREATE TABLE IF NOT EXISTS attempts (
      id          TEXT PRIMARY KEY,
      courseSlug  TEXT NOT NULL,
      taskId      TEXT NOT NULL,
      objectiveId TEXT NOT NULL,
      depth       TEXT NOT NULL,
      "check"     TEXT NOT NULL,
      outcome     TEXT NOT NULL,
      score       REAL,
      verdictJson TEXT,
      submittedAt TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS attempts_by_course ON attempts (courseSlug, taskId);
    CREATE TABLE IF NOT EXISTS tutor_threads (
      id          TEXT PRIMARY KEY,
      courseSlug  TEXT NOT NULL,
      pageId      TEXT NOT NULL,
      messagesJson TEXT NOT NULL,
      session     TEXT,
      updatedAt   TEXT NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS thread_per_page ON tutor_threads (courseSlug, pageId);
    CREATE TABLE IF NOT EXISTS defect_reports (
      id         TEXT PRIMARY KEY,
      courseSlug TEXT NOT NULL,
      taskId     TEXT NOT NULL,
      attemptId  TEXT,
      ground     TEXT NOT NULL,
      note       TEXT NOT NULL,
      status     TEXT NOT NULL,
      filedAt    TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS settings (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS runs (
      id         TEXT PRIMARY KEY,
      kind       TEXT NOT NULL,
      courseSlug TEXT,
      harness    TEXT NOT NULL,
      model      TEXT NOT NULL,
      usd        REAL NOT NULL,
      status     TEXT NOT NULL,
      startedAt  TEXT NOT NULL,
      endedAt    TEXT
    );
  `)

  const selectTicks = db.prepare('SELECT pageId, ticked, byUser FROM page_ticks WHERE courseSlug = ?')
  const countDone = db.prepare('SELECT COUNT(*) AS n FROM page_ticks WHERE courseSlug = ? AND ticked = 1')
  const upsert = db.prepare(`
    INSERT INTO page_ticks (courseSlug, pageId, pageType, ticked, byUser, tickedAt)
    VALUES (?, ?, ?, ?, 1, ?)
    ON CONFLICT (courseSlug, pageId)
    DO UPDATE SET ticked = excluded.ticked, byUser = 1, tickedAt = excluded.tickedAt
  `)
  const earn = db.prepare(`
    INSERT INTO page_ticks (courseSlug, pageId, pageType, ticked, byUser, tickedAt)
    VALUES (?, ?, ?, 1, 0, ?)
    ON CONFLICT (courseSlug, pageId) DO NOTHING
  `)
  const insertAttempt = db.prepare(`
    INSERT INTO attempts (id, courseSlug, taskId, objectiveId, depth, "check", outcome, verdictJson, submittedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)
  const selectAttempted = db.prepare('SELECT DISTINCT taskId FROM attempts WHERE courseSlug = ?')
  const selectSeen = db.prepare(
    'SELECT taskId, outcome, submittedAt AS at FROM attempts WHERE courseSlug = ? ORDER BY submittedAt',
  )
  const voidThem = db.prepare("UPDATE attempts SET outcome = 'voided' WHERE courseSlug = ? AND taskId = ?")
  const openRun = db.prepare(`
    INSERT INTO runs (id, kind, courseSlug, harness, model, usd, status, startedAt)
    VALUES (?, ?, ?, ?, ?, 0, 'running', ?)
  `)
  const closeRun = db.prepare('UPDATE runs SET usd = ?, status = ?, endedAt = ? WHERE id = ?')
  const latestRun = db.prepare(
    "SELECT harness, model FROM runs WHERE courseSlug = ? AND status = 'ok' ORDER BY startedAt DESC LIMIT 1",
  )
  const dropTicks = db.prepare('DELETE FROM page_ticks WHERE courseSlug = ?')
  const dropAttempts = db.prepare('DELETE FROM attempts WHERE courseSlug = ?')
  const dropThreads = db.prepare('DELETE FROM tutor_threads WHERE courseSlug = ?')
  const dropDefects = db.prepare('DELETE FROM defect_reports WHERE courseSlug = ?')
  const selectThread = db.prepare(
    'SELECT id, messagesJson, session FROM tutor_threads WHERE courseSlug = ? AND pageId = ?',
  )
  const upsertThread = db.prepare(`
    INSERT INTO tutor_threads (id, courseSlug, pageId, messagesJson, session, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT (courseSlug, pageId)
    DO UPDATE SET messagesJson = excluded.messagesJson, session = excluded.session, updatedAt = excluded.updatedAt
  `)
  const insertDefect = db.prepare(`
    INSERT INTO defect_reports (id, courseSlug, taskId, ground, note, status, filedAt)
    VALUES (?, ?, ?, ?, ?, 'open', ?)
  `)
  const selectDefects = db.prepare('SELECT taskId, ground, status FROM defect_reports WHERE courseSlug = ?')
  const readSetting = db.prepare('SELECT value FROM settings WHERE key = ?')
  const writeSetting = db.prepare(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value',
  )

  return {
    ticks(courseSlug) {
      const out: Record<string, Tick> = {}
      for (const row of selectTicks.all(courseSlug) as { pageId: string; ticked: number; byUser: number }[]) {
        out[row.pageId] = { ticked: row.ticked === 1, byUser: row.byUser === 1 }
      }
      return out
    },
    pagesDone(courseSlug) {
      const row = countDone.get(courseSlug) as { n: number } | undefined
      return row?.n ?? 0
    },
    setTickByUser(courseSlug, pageId, pageType, ticked) {
      upsert.run(courseSlug, pageId, pageType, ticked ? 1 : 0, new Date().toISOString())
    },
    earnTick(courseSlug, pageId, pageType) {
      earn.run(courseSlug, pageId, pageType, new Date().toISOString())
    },
    recordAttempt(attempt) {
      const id = randomUUID()
      insertAttempt.run(
        id,
        attempt.courseSlug,
        attempt.taskId,
        attempt.objectiveId,
        attempt.depth,
        attempt.check,
        attempt.outcome,
        attempt.verdictJson ?? null,
        new Date().toISOString(),
      )
      return id
    },
    attemptedTaskIds(courseSlug) {
      const rows = selectAttempted.all(courseSlug) as { taskId: string }[]
      return new Set(rows.map((row) => row.taskId))
    },
    attemptsFor(courseSlug) {
      return selectSeen.all(courseSlug) as unknown as Seen[]
    },
    voidAttempts(courseSlug, taskId) {
      voidThem.run(courseSlug, taskId)
    },
    startRun(run) {
      const id = randomUUID()
      openRun.run(id, run.kind, run.courseSlug ?? null, run.harness, run.model, new Date().toISOString())
      return id
    },
    endRun(id, usd, status) {
      closeRun.run(usd, status, new Date().toISOString(), id)
    },
    lastRun(courseSlug) {
      return latestRun.get(courseSlug) as { harness: string; model: string } | undefined
    },
    thread(courseSlug, pageId) {
      const row = selectThread.get(courseSlug, pageId) as
        | { id: string; messagesJson: string; session: string | null }
        | undefined
      if (!row) return undefined
      return {
        id: row.id,
        messages: JSON.parse(row.messagesJson) as Thread['messages'],
        ...(row.session === null ? {} : { session: row.session }),
      }
    },
    saveThread(courseSlug, pageId, thread) {
      upsertThread.run(
        thread.id,
        courseSlug,
        pageId,
        JSON.stringify(thread.messages),
        thread.session ?? null,
        new Date().toISOString(),
      )
    },
    fileDefect(report) {
      const id = randomUUID()
      insertDefect.run(id, report.courseSlug, report.taskId, report.ground, report.note, new Date().toISOString())
      return id
    },
    defectsFor(courseSlug) {
      return selectDefects.all(courseSlug) as { taskId: string; ground: Ground; status: string }[]
    },
    setting(key) {
      return (readSetting.get(key) as { value: string } | undefined)?.value
    },
    setSetting(key, value) {
      writeSetting.run(key, value)
    },
    forget(courseSlug) {
      // A Run is the spend ledger and outlives the Course it built, so it stays.
      dropTicks.run(courseSlug)
      dropAttempts.run(courseSlug)
      dropThreads.run(courseSlug)
      dropDefects.run(courseSlug)
    },
    close() {
      db.close()
    },
  }
}
