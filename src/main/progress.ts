import { DatabaseSync } from 'node:sqlite'
import { randomUUID } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

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
    INSERT INTO attempts (id, courseSlug, taskId, objectiveId, depth, "check", outcome, submittedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `)
  const selectAttempted = db.prepare('SELECT DISTINCT taskId FROM attempts WHERE courseSlug = ?')

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
        new Date().toISOString(),
      )
      return id
    },
    attemptedTaskIds(courseSlug) {
      const rows = selectAttempted.all(courseSlug) as { taskId: string }[]
      return new Set(rows.map((row) => row.taskId))
    },
    close() {
      db.close()
    },
  }
}
