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
  /**
   * The sitting this Attempt was made in. Nullable, so every row written before a Test
   * became a sitting stays valid, and a retake writes fresh Attempts under a new id with
   * both sittings left in the record.
   */
  sittingId?: string
}

/**
 * One answer, held.
 *
 * A Test is a sitting: the reader answers a question and presses Check, the run happens
 * then, and the result is held until every question in the Test has been checked
 * (docs/adr/0022). The row is written as the reader goes, so a half-answered Test survives
 * a closed window, and it is left in place after the reveal so feedback is drawn from it.
 */
export interface HeldAnswer {
  taskId: string
  given: unknown
  checked: boolean
  /** What the check came back with. Never read before the reveal. */
  result?: unknown
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

/**
 * A defect report, as it stands now.
 *
 * `open` is filed and not yet looked at. `agreed` and `disputed` are what the Constructor
 * made of it. `upheld` is a report that stands, with the Attempts against that Task voided,
 * and `dropped` is one the reader let go after reading the evaluation. Only `upheld`
 * changes anything, and what it changes is never a score (PLAN 3.15).
 */
export type DefectStatus = 'open' | 'agreed' | 'disputed' | 'upheld' | 'dropped'

export interface DefectReport {
  id: string
  taskId: string
  ground: Ground
  note: string
  status: DefectStatus
  /** What the Constructor said, once it has been asked. */
  evaluation?: string
  /** True when the reader upheld a report the Constructor disagreed with. */
  overridden: boolean
}

/** One go at a Project, and the one written response it got. There is no mark in here. */
export interface Submission {
  id: string
  submittedAt: string
  links: string[]
  responseText: string
}

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
  /**
   * The sitting the reader is in, which is simply the most recent one. There is no open or
   * closed flag: a revealed sitting is one whose every Task is checked, and that is derived
   * from the rows rather than stored beside them.
   */
  currentSitting(courseSlug: string, testId: string): string | undefined
  held(courseSlug: string, testId: string, sittingId: string): HeldAnswer[]
  /** Write an answer down, checked or not. Called as the reader goes. */
  hold(row: {
    courseSlug: string
    testId: string
    taskId: string
    sittingId: string
    given: unknown
    checked: boolean
    result?: unknown
  }): void
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
  /**
   * What has been spent, by kind. The one number the app keeps about itself rather than
   * about the reader, which is why it is allowed to be a number (PLAN 3.4).
   */
  spending(): { kind: string; runs: number; usd: number }[]
  /** The conversation about one Page, if there has been one. */
  thread(courseSlug: string, pageId: string): Thread | undefined
  saveThread(courseSlug: string, pageId: string, thread: Thread): void
  /**
   * A submitted Project and the response it got. Every response is kept, because it is text
   * and it is cheap. The folder is not kept: storing past work is the reader's own business
   * (PLAN 3.15, phase 6).
   */
  recordSubmission(row: { courseSlug: string; projectId: string; links: string[]; responseText: string }): string
  submissionsFor(courseSlug: string, projectId: string): Submission[]

  /** File a defect report. It records a claim; it never changes an outcome. */
  fileDefect(report: { courseSlug: string; taskId: string; ground: Ground; note: string }): string
  defectsFor(courseSlug: string): DefectReport[]
  defect(id: string): DefectReport | undefined
  /**
   * What the Constructor made of the report: whether it agrees, and what it says. It never
   * settles anything by itself. A report the Constructor disagrees with waits for the
   * person, who has the authority to override it (PLAN 3.15).
   */
  evaluateDefect(id: string, evaluation: { agrees: boolean; text: string }): void
  /**
   * The report stands. This is the only call that touches the record, and what it does is
   * void the Attempts against a broken question. It never rescores.
   */
  upholdDefect(id: string, overridden: boolean): void
  /** The reader read the evaluation and let the report go. Nothing is touched. */
  dropDefect(id: string): void
  /** Which harness and model each role uses. Never a secret: those live in the Keychain. */
  setting(key: string): string | undefined
  setSetting(key: string, value: string): void
  /** Everything the database holds about one Course. Deleting a Course deletes this. */
  forget(courseSlug: string): void
  close(): void
}

interface DefectRow {
  id: string
  taskId: string
  ground: Ground
  note: string
  status: DefectStatus
  evaluation: string | null
  overridden: number
}

const asReport = (row: DefectRow): DefectReport => ({
  id: row.id,
  taskId: row.taskId,
  ground: row.ground,
  note: row.note,
  status: row.status,
  ...(row.evaluation === null ? {} : { evaluation: row.evaluation }),
  overridden: row.overridden === 1,
})

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
    CREATE TABLE IF NOT EXISTS held_answers (
      courseSlug TEXT NOT NULL,
      testId     TEXT NOT NULL,
      taskId     TEXT NOT NULL,
      sittingId  TEXT NOT NULL,
      givenJson  TEXT NOT NULL,
      checked    INTEGER NOT NULL,
      resultJson TEXT,
      at         TEXT NOT NULL,
      PRIMARY KEY (courseSlug, testId, taskId, sittingId)
    );
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
    CREATE TABLE IF NOT EXISTS project_submissions (
      id           TEXT PRIMARY KEY,
      courseSlug   TEXT NOT NULL,
      projectId    TEXT NOT NULL,
      submittedAt  TEXT NOT NULL,
      links        TEXT NOT NULL,
      responseText TEXT NOT NULL
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

  // A database written before a Test became a sitting has no `sittingId`. Adding the column
  // keeps those Attempts, which is the point of the column being nullable at all.
  const columns = db.prepare('PRAGMA table_info(attempts)').all() as { name: string }[]
  if (!columns.some((column) => column.name === 'sittingId')) {
    db.exec('ALTER TABLE attempts ADD COLUMN sittingId TEXT')
  }

  // A defect report now carries what the Constructor made of it, and whether the reader
  // overrode that. Older rows have neither and are still open reports.
  const defectColumns = db.prepare('PRAGMA table_info(defect_reports)').all() as { name: string }[]
  if (!defectColumns.some((column) => column.name === 'evaluation')) {
    db.exec('ALTER TABLE defect_reports ADD COLUMN evaluation TEXT')
    db.exec('ALTER TABLE defect_reports ADD COLUMN overridden INTEGER NOT NULL DEFAULT 0')
  }

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
    INSERT INTO attempts
      (id, courseSlug, taskId, objectiveId, depth, "check", outcome, verdictJson, sittingId, submittedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)
  // `rowid` breaks the tie. A retake writes its first row in the same millisecond as the
  // sitting it follows, and on the timestamp alone the reader is handed back the sitting
  // they just finished.
  const latestSitting = db.prepare(
    'SELECT sittingId FROM held_answers WHERE courseSlug = ? AND testId = ? ORDER BY at DESC, rowid DESC LIMIT 1',
  )
  const selectHeld = db.prepare(
    'SELECT taskId, givenJson, checked, resultJson FROM held_answers WHERE courseSlug = ? AND testId = ? AND sittingId = ?',
  )
  const upsertHeld = db.prepare(`
    INSERT INTO held_answers (courseSlug, testId, taskId, sittingId, givenJson, checked, resultJson, at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (courseSlug, testId, taskId, sittingId)
    DO UPDATE SET givenJson = excluded.givenJson, checked = excluded.checked,
                  resultJson = excluded.resultJson, at = excluded.at
  `)
  const dropHeld = db.prepare('DELETE FROM held_answers WHERE courseSlug = ?')
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
  const spend = db.prepare(
    'SELECT kind, COUNT(*) AS runs, COALESCE(SUM(usd), 0) AS usd FROM runs GROUP BY kind ORDER BY usd DESC',
  )
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
  const DEFECT_FIELDS = 'id, taskId, ground, note, status, evaluation, overridden'
  const selectDefects = db.prepare(`SELECT ${DEFECT_FIELDS} FROM defect_reports WHERE courseSlug = ?`)
  const selectDefect = db.prepare(`SELECT ${DEFECT_FIELDS} FROM defect_reports WHERE id = ?`)
  const writeEvaluation = db.prepare('UPDATE defect_reports SET status = ?, evaluation = ? WHERE id = ?')
  const upholdIt = db.prepare("UPDATE defect_reports SET status = 'upheld', overridden = ? WHERE id = ?")
  const dropIt = db.prepare("UPDATE defect_reports SET status = 'dropped' WHERE id = ?")
  const insertSubmission = db.prepare(`
    INSERT INTO project_submissions (id, courseSlug, projectId, submittedAt, links, responseText)
    VALUES (?, ?, ?, ?, ?, ?)
  `)
  const selectSubmissions = db.prepare(`
    SELECT id, submittedAt, links, responseText FROM project_submissions
    WHERE courseSlug = ? AND projectId = ? ORDER BY submittedAt DESC
  `)
  const dropSubmissions = db.prepare('DELETE FROM project_submissions WHERE courseSlug = ?')
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
        attempt.sittingId ?? null,
        new Date().toISOString(),
      )
      return id
    },
    currentSitting(courseSlug, testId) {
      return (latestSitting.get(courseSlug, testId) as { sittingId: string } | undefined)?.sittingId
    },
    held(courseSlug, testId, sittingId) {
      const rows = selectHeld.all(courseSlug, testId, sittingId) as {
        taskId: string
        givenJson: string
        checked: number
        resultJson: string | null
      }[]
      return rows.map((row) => ({
        taskId: row.taskId,
        given: JSON.parse(row.givenJson) as unknown,
        checked: row.checked === 1,
        ...(row.resultJson === null ? {} : { result: JSON.parse(row.resultJson) as unknown }),
      }))
    },
    hold(row) {
      upsertHeld.run(
        row.courseSlug,
        row.testId,
        row.taskId,
        row.sittingId,
        JSON.stringify(row.given ?? null),
        row.checked ? 1 : 0,
        row.result === undefined ? null : JSON.stringify(row.result),
        new Date().toISOString(),
      )
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
    spending() {
      return spend.all() as { kind: string; runs: number; usd: number }[]
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
    recordSubmission(row) {
      const id = randomUUID()
      insertSubmission.run(
        id,
        row.courseSlug,
        row.projectId,
        new Date().toISOString(),
        JSON.stringify(row.links),
        row.responseText,
      )
      return id
    },
    submissionsFor(courseSlug, projectId) {
      const rows = selectSubmissions.all(courseSlug, projectId) as {
        id: string
        submittedAt: string
        links: string
        responseText: string
      }[]
      return rows.map((row) => ({
        id: row.id,
        submittedAt: row.submittedAt,
        links: JSON.parse(row.links) as string[],
        responseText: row.responseText,
      }))
    },
    fileDefect(report) {
      const id = randomUUID()
      insertDefect.run(id, report.courseSlug, report.taskId, report.ground, report.note, new Date().toISOString())
      return id
    },
    defectsFor(courseSlug) {
      return (selectDefects.all(courseSlug) as unknown as DefectRow[]).map(asReport)
    },
    defect(id) {
      const row = selectDefect.get(id) as unknown as DefectRow | undefined
      return row === undefined ? undefined : asReport(row)
    },
    evaluateDefect(id, evaluation) {
      writeEvaluation.run(evaluation.agrees ? 'agreed' : 'disputed', evaluation.text, id)
    },
    upholdDefect(id, overridden) {
      const row = selectDefect.get(id) as unknown as DefectRow | undefined
      if (!row) return
      upholdIt.run(overridden ? 1 : 0, id)
      // Upholding a report voids the Attempts against that Task, because the question was
      // broken. Voiding rewrites an outcome; it never adds a row saying it was voided.
      const course = (db.prepare('SELECT courseSlug FROM defect_reports WHERE id = ?').get(id) as
        | { courseSlug: string }
        | undefined)?.courseSlug
      if (course !== undefined) voidThem.run(course, row.taskId)
    },
    dropDefect(id) {
      dropIt.run(id)
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
      dropHeld.run(courseSlug)
      dropSubmissions.run(courseSlug)
      dropThreads.run(courseSlug)
      dropDefects.run(courseSlug)
    },
    close() {
      db.close()
    },
  }
}
