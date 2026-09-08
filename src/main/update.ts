import { app } from 'electron'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

/**
 * Updating the app, from inside the app.
 *
 * The usual mechanism is `electron-updater`, and it cannot be used here: macOS applies an
 * update through Squirrel, which requires a valid signature, and this build is unsigned
 * because signing for other people's machines needs a paid Apple Developer membership
 * (`AGENTS.md`, Packaging). So this is the install script's own logic, moved inside: read
 * the latest release, compare it with the running version, fetch the zip, swap the bundle,
 * relaunch.
 *
 * Two rules, because this is the only thing in the app that touches the network without
 * being asked:
 *
 *  - **It only ever tells.** The check reports; nothing downloads and nothing is replaced
 *    without a press. What it discloses is an IP address and that somebody opened the app.
 *  - **It fails quietly.** No network is the normal state on a train, and an app that
 *    cannot reach GitHub is not a broken app, so a failed check is a silent one.
 */

const REPO = 'vic-cio/whetstone'
const ASSET = 'Whetstone-mac-arm64.zip'

export interface Update {
  current: string
  /** Absent when the check could not be made, which is not an error worth showing. */
  latest?: string
  newer: boolean
  url?: string
}

/** `v0.2.0` and `0.2.0` are the same release. Compared piece by piece, not as text. */
export function newerThan(latest: string, current: string): boolean {
  const parts = (version: string): number[] =>
    version.replace(/^v/, '').split('.').map((piece) => Number.parseInt(piece, 10) || 0)
  const [left, right] = [parts(latest), parts(current)]
  for (let at = 0; at < Math.max(left.length, right.length); at += 1) {
    const one = left[at] ?? 0
    const two = right[at] ?? 0
    if (one !== two) return one > two
  }
  return false
}

export async function check(): Promise<Update> {
  const current = app.getVersion()
  try {
    const answer = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
      headers: { accept: 'application/vnd.github+json', 'user-agent': `whetstone/${current}` },
      signal: AbortSignal.timeout(8000),
    })
    if (!answer.ok) return { current, newer: false }

    const release = (await answer.json()) as {
      tag_name?: string
      assets?: { name?: string; browser_download_url?: string }[]
    }
    const latest = String(release.tag_name ?? '').replace(/^v/, '')
    const asset = (release.assets ?? []).find((entry) => entry.name === ASSET)
    if (latest === '' || asset?.browser_download_url === undefined) return { current, latest, newer: false }

    return { current, latest, newer: newerThan(latest, current), url: asset.browser_download_url }
  } catch {
    // Offline, rate limited, or GitHub is having a day. None of those is worth a dialog.
    return { current, newer: false }
  }
}

/** The bundle this process is running from, whatever it was installed as. */
function bundle(): string {
  // .../Whetstone.app/Contents/MacOS/Whetstone
  return dirname(dirname(dirname(process.execPath)))
}

export interface Applied {
  ok: boolean
  message?: string
}

/**
 * Fetch the release and put it in place of the running one.
 *
 * The old bundle is moved aside rather than deleted first, so a copy that fails halfway
 * leaves the working app where it was rather than nothing at all. macOS is content to have
 * a running application replaced underneath it: this process keeps the files it already
 * opened, and the relaunch picks up what is now on disk.
 */
export async function apply(url: string): Promise<Applied> {
  const target = bundle()
  if (!target.endsWith('.app')) {
    return { ok: false, message: 'This is running from a development build rather than an app.' }
  }

  const work = mkdtempSync(join(tmpdir(), 'whetstone-update-'))
  const zip = join(work, 'whetstone.zip')
  try {
    const answer = await fetch(url, { headers: { 'user-agent': `whetstone/${app.getVersion()}` } })
    if (!answer.ok) return { ok: false, message: 'The download did not start.' }
    writeFileSync(zip, Buffer.from(await answer.arrayBuffer()))

    // `ditto` rather than `unzip`, because a .app carries symlinks and resource forks that
    // a plain unzip flattens, and a flattened bundle will not launch.
    execFileSync('/usr/bin/ditto', ['-x', '-k', zip, join(work, 'unpacked')])
    const fresh = join(work, 'unpacked', 'Whetstone.app')
    if (!existsSync(fresh)) return { ok: false, message: 'That download held no Whetstone.' }

    const aside = `${target}.replacing`
    rmSync(aside, { recursive: true, force: true })
    execFileSync('/bin/mv', [target, aside])
    try {
      execFileSync('/usr/bin/ditto', [fresh, target])
    } catch (cause) {
      // Put the working app back before saying anything went wrong.
      execFileSync('/bin/mv', [aside, target])
      throw cause
    }
    rmSync(aside, { recursive: true, force: true })
    // A copy that arrived by `fetch` carries no quarantine, but a belt and braces removal
    // costs nothing and covers a bundle that was quarantined before this ran.
    try {
      execFileSync('/usr/bin/xattr', ['-dr', 'com.apple.quarantine', target])
    } catch {
      // Nothing to clear. Not a failure.
    }

    app.relaunch()
    app.exit(0)
    return { ok: true }
  } catch (cause) {
    return { ok: false, message: `The update did not finish: ${(cause as Error).message}` }
  } finally {
    rmSync(work, { recursive: true, force: true })
  }
}
