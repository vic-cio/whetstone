import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'

/**
 * The shared codeblock runtime cache (docs/adr/0025).
 *
 * A language runtime the Constructor fetches for `Kit.codeblock`/`Kit.editor` (Pyodide for
 * `python`, for instance) is tens of megabytes, so unlike the toolkit (docs/adr/0014) and a
 * Course's own library (docs/adr/0019) it is not copied into every Course that uses it. One
 * copy lives here, outside any Course folder, keyed by language and version. A Course only
 * ever carries a pointer to one: `{ lang, version }` in its manifest's `runtimes`.
 *
 * There is no live counter. A counter can drift the moment a Course folder is deleted by
 * something other than the app (dragged to the Trash directly, `rm -rf` by hand), so
 * nothing is decremented on delete. `gcRuntimeCache` instead reads, at the moment it runs,
 * which runtimes the Courses that currently exist still point to, and removes the rest.
 * That is what "reference-counted" means here: the count is derived, not stored.
 */

export interface RuntimeRef {
  lang: string
  version: string
}

export function runtimeKey(ref: RuntimeRef): string {
  return `${ref.lang}@${ref.version}`
}

export function runtimeDir(cacheRoot: string, ref: RuntimeRef): string {
  return join(cacheRoot, runtimeKey(ref))
}

export function hasRuntime(cacheRoot: string, ref: RuntimeRef): boolean {
  return existsSync(runtimeDir(cacheRoot, ref))
}

/** Every runtime key a Course under `coursesRoot` still points to. */
function stillWanted(coursesRoot: string): Set<string> {
  const wanted = new Set<string>()
  if (!existsSync(coursesRoot)) return wanted

  for (const entry of readdirSync(coursesRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const manifestPath = join(coursesRoot, entry.name, 'course.json')
    if (!existsSync(manifestPath)) continue

    let manifest: { runtimes?: unknown }
    try {
      manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as { runtimes?: unknown }
    } catch {
      continue
    }
    if (!Array.isArray(manifest.runtimes)) continue

    for (const ref of manifest.runtimes) {
      const lang = (ref as Partial<RuntimeRef> | undefined)?.lang
      const version = (ref as Partial<RuntimeRef> | undefined)?.version
      if (typeof lang === 'string' && typeof version === 'string') {
        wanted.add(runtimeKey({ lang, version }))
      }
    }
  }
  return wanted
}

/**
 * Remove every cached runtime no Course under `coursesRoot` points to any more. Safe to
 * call after any Course is deleted, or on a schedule; it is idempotent either way.
 * Returns the keys removed.
 */
export function gcRuntimeCache(cacheRoot: string, coursesRoot: string): string[] {
  if (!existsSync(cacheRoot)) return []
  const wanted = stillWanted(coursesRoot)
  const removed: string[] = []

  for (const entry of readdirSync(cacheRoot, { withFileTypes: true })) {
    if (!entry.isDirectory() || wanted.has(entry.name)) continue
    rmSync(join(cacheRoot, entry.name), { recursive: true, force: true })
    removed.push(entry.name)
  }
  return removed
}

export function ensureCacheRoot(cacheRoot: string): void {
  mkdirSync(cacheRoot, { recursive: true })
}
