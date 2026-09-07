import { app } from 'electron'
import { execFileSync, spawn } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { delimiter, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { MARK, readEnvironment } from '../shared/environment'
import { claudeAdapter } from '../shared/claude'
import { codexAdapter } from '../shared/codex'
import { piAdapter } from '../shared/pi'
import { readRegistry } from '../shared/harness'
import type { Adapter, Harness, Moment, SpawnRequest } from '../shared/harness'

/**
 * Running a Harness.
 *
 * One mechanism for every role. What differs between the Constructor, the Tutor and the
 * Grader is the profile handed in, never the code path (PLAN 3.5).
 *
 * The caller receives `Moment`s and a promise. It never receives the process, the stream,
 * the stderr, or the exit code, because it has no honest use for any of them: a failure is
 * an app failure and says one plain sentence (PLAN 3.6, rule 3).
 */

const ADAPTERS: Record<string, Adapter> = {
  claude: claudeAdapter,
  codex: codexAdapter,
  pi: piAdapter,
}

/** The adapter for a harness, for the few things a caller needs to know about its CLI. */
export const adapterFor = (harness: Harness): Adapter | undefined => ADAPTERS[harness.adapter]

/** Where the files the app hands a harness live: the registry, the roles, the bundles. */
export function agentDir(): string {
  const packaged = join(process.resourcesPath ?? '', 'agent')
  if (existsSync(packaged)) return packaged
  const here = fileURLToPath(new URL('.', import.meta.url))
  return join(here, '..', '..', 'agent')
}

/**
 * The registry, from the app first and then from the user's own file.
 *
 * A user entry with the id of a shipped one replaces it, which is how a harness installed
 * somewhere unusual gets a full path without editing the app.
 */
export function registry(): { harnesses: Harness[]; errors: string[] } {
  const errors: string[] = []
  const harnesses: Harness[] = []

  const read = (file: string): void => {
    if (!existsSync(file)) return
    const result = readRegistry(readFileSync(file, 'utf8'))
    if (!result.ok) {
      errors.push(result.message)
      return
    }
    for (const entry of result.harnesses) {
      const at = harnesses.findIndex((known) => known.id === entry.id)
      if (at >= 0) harnesses[at] = entry
      else harnesses.push(entry)
    }
  }

  read(join(agentDir(), 'harnesses.json'))
  read(join(app.getPath('userData'), 'harnesses.json'))
  if (harnesses.length === 0) errors.push('no harness is configured')
  return { harnesses, errors }
}

/**
 * The PATH a harness is looked up on.
 *
 * An app launched from Finder inherits a bare PATH, so a CLI installed by Homebrew or npm
 * is simply not there. The usual install locations are added rather than a login shell
 * being run, which would execute the user's profile for a lookup.
 */
function widePath(): string {
  const home = homedir()
  const usual = [
    '/opt/homebrew/bin',
    '/usr/local/bin',
    '/usr/bin',
    '/bin',
    join(home, '.local', 'bin'),
    join(home, '.bun', 'bin'),
    join(home, '.claude', 'local'),
    join(home, '.npm-global', 'bin'),
  ]
  const already = (process.env['PATH'] ?? '').split(delimiter).filter(Boolean)
  return [...already, ...usual.filter((dir) => !already.includes(dir))].join(delimiter)
}

/**
 * The environment a harness would have had in the user's own terminal.
 *
 * The PATH widening below exists because an app launched from Finder inherits a bare
 * environment. The rest of that environment is missing for the same reason and matters just
 * as much: `~/.zshrc` is read by an interactive shell and by nothing else, so a harness
 * configured to take its key from `$OPENROUTER_API_KEY` finds nothing, says it is not
 * authenticated, and the app has no idea why.
 *
 * That is exactly how this was found. A check run from a non-interactive shell reported no
 * credential for a provider that was working perfectly well in the user's terminal.
 *
 * So the login shell is asked once, and what it exports is merged under anything the app
 * set itself. It reflects the user's machine, which PLAN 3.13 already says is the default:
 * Whetstone launches a CLI the user installed and logged into themselves.
 */
let fromLogin: Record<string, string> | undefined
function loginEnvironment(): Record<string, string> {
  if (fromLogin) return fromLogin
  const shell = process.env['SHELL']
  if (!shell) {
    fromLogin = {}
    return fromLogin
  }

  try {
    // A login, interactive shell, because that is the one that reads the file the variable
    // is usually in.
    const printed = execFileSync(shell, ['-ilc', `printf '${MARK.replace(/\0/g, '\\0')}'; env -0`], {
      encoding: 'utf8',
      timeout: 5000,
      stdio: ['ignore', 'pipe', 'ignore'],
    })
    fromLogin = readEnvironment(printed)
  } catch {
    // A shell that will not start, or takes too long, is not a reason to refuse to run a
    // harness. It only means a harness needing a key from that file will say so itself.
    fromLogin = {}
  }
  return fromLogin
}

/** Is this harness's command actually on the machine? Settings greys out one that is not. */
export function installed(harness: Harness): boolean {
  if (harness.command.includes('/')) return existsSync(harness.command)
  return widePath()
    .split(delimiter)
    .some((dir) => existsSync(join(dir, harness.command)))
}

export interface Outcome {
  ok: boolean
  usd: number
  /** The harness's own session id, so the next message in a Brief continues this one. */
  session: string
  /** One plain sentence, when it went wrong. Never a code and never a stack. */
  message?: string
}

export interface Running {
  cancel(): void
  done: Promise<Outcome>
}

/**
 * Start a harness and report what it does.
 *
 * `onMoment` is called for every `Moment` in order. The promise settles once the process
 * has exited, whatever happened, so a caller never has to watch for both.
 */
export function start(request: SpawnRequest, onMoment: (moment: Moment) => void): Running {
  const adapter = ADAPTERS[request.harness.adapter]
  if (!adapter) return refuse(`the app has no adapter for "${request.harness.adapter}"`, onMoment)
  if (!installed(request.harness)) {
    return refuse(`${request.harness.label} is not installed on this machine`, onMoment)
  }

  // One reader for this run, because reading the stream needs memory across lines.
  const read = adapter.reader()

  const child = spawn(request.harness.command, adapter.argv(request), {
    cwd: request.profile.cwd,
    // The user's own environment first, then this process's, so anything Electron set
    // deliberately wins. Nothing here is ever logged.
    env: { ...loginEnvironment(), ...process.env, PATH: widePath() },
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  let usd = 0
  let session = ''
  let failure: string | undefined
  let cancelled = false
  let overspent = false
  let rest = ''

  const take = (moment: Moment): void => {
    if (moment.at === 'started') session = moment.session
    if (moment.at === 'finished') usd = moment.usd
    if (moment.at === 'failed') failure = moment.message
    onMoment(moment)
  }

  /**
   * Stop a run that is over its cap, when the CLI will not stop itself.
   *
   * `claude` keeps the cap with `--max-budget-usd` and this never fires. `pi` has no such
   * flag, so the app is the only thing standing between a loop and the user's credit. A cap
   * nobody keeps is not a cap.
   */
  const watchSpend = (moment: Moment): void => {
    if (request.harness.capsSpend || overspent) return
    const so_far = moment.at === 'finished' ? moment.usd : 0
    if (so_far > 0 && so_far > request.profile.budgetUsd) {
      overspent = true
      child.kill('SIGTERM')
    }
  }

  child.stdout.setEncoding('utf8')
  child.stdout.on('data', (chunk: string) => {
    // The stream is newline-delimited JSON, and a chunk is not a line. A partial line at
    // the end of one chunk is the start of the next.
    const parts = (rest + chunk).split('\n')
    rest = parts.pop() ?? ''
    for (const line of parts) {
      const moment = read(line)
      if (moment) {
        take(moment)
        watchSpend(moment)
      }
    }
  })

  // stderr is the harness talking to a terminal that is not there. It is kept only so a
  // failure with nothing else to say has something true to say.
  let noise = ''
  child.stderr.setEncoding('utf8')
  child.stderr.on('data', (chunk: string) => {
    noise = (noise + chunk).slice(-2000)
  })

  const done = new Promise<Outcome>((settle) => {
    const finish = (ok: boolean, message?: string): void => {
      settle(message === undefined ? { ok, usd, session } : { ok, usd, session, message })
    }

    child.on('error', (cause) => {
      const message = `${request.harness.label} could not be started: ${cause.message}`
      onMoment({ at: 'failed', message })
      finish(false, message)
    })

    /*
     * `exit`, not `close`.
     *
     * `close` waits for every stdio stream to end as well as for the process, and a harness
     * that leaves a background helper holding the pipe never closes. Measured: a Brief that
     * finished in eighteen seconds by hand never returned inside the app, and the run row
     * sat at "running" for as long as it was given.
     *
     * The last of the output is already here by the time a process exits, and anything
     * still buffered is drained below before the promise settles.
     */
    child.on('exit', (code) => {
      if (rest.trim() !== '') {
        const moment = read(rest)
        if (moment) take(moment)
      }
      // Nothing more will be read, so let go of the streams rather than leaving the app
      // holding a pipe that a helper the harness left behind is still attached to.
      child.stdout.destroy()
      child.stderr.destroy()
      if (cancelled) {
        finish(false, 'The run was stopped.')
        return
      }
      if (overspent) {
        const message = 'The run reached its spend cap before it finished.'
        onMoment({ at: 'failed', message })
        finish(false, message)
        return
      }
      if (failure !== undefined) {
        finish(false, failure)
        return
      }
      if (code === 0) {
        finish(true)
        return
      }
      // An exit code means nothing to a student, so it becomes a sentence. The harness's
      // own noise is kept out of the interface and goes to the technical log instead.
      const message = `${request.harness.label} stopped before it finished.`
      if (noise !== '') console.error(`[${request.harness.id}] ${noise}`)
      onMoment({ at: 'failed', message })
      finish(false, message)
    })
  })

  return {
    cancel() {
      cancelled = true
      child.kill('SIGTERM')
      // A harness that will not go quietly still has to go: a cancelled Run bins its
      // staging folder, and that cannot wait on a process that is ignoring us.
      setTimeout(() => child.kill('SIGKILL'), 2000).unref?.()
    },
    done,
  }
}

/** A run that never started. It still reports the way a run reports, so callers have one path. */
function refuse(message: string, onMoment: (moment: Moment) => void): Running {
  const sentence = `${message[0]?.toUpperCase() ?? ''}${message.slice(1)}.`
  onMoment({ at: 'failed', message: sentence })
  return { cancel() {}, done: Promise.resolve({ ok: false, usd: 0, session: '', message: sentence }) }
}

/** The role instruction file the app ships, passed with `--append-system-prompt-file`. */
export const roleFile = (role: string): string => join(agentDir(), 'roles', `${role}.md`)
