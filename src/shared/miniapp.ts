import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { readRuntimeAssets } from './runtimeCache'
import { runtimeBootstrapScript } from './runtimeBootstrap'
import type { RuntimeRef } from './runtimeCache'

/**
 * Composing the sealed frame a Mini-app runs in.
 *
 * A Mini-app is code an agent wrote against material it fetched from the open web, so it
 * is treated as untrusted however trusted the model was (docs/adr/0005). It gets one
 * document with everything inline, `sandbox="allow-scripts"` and nothing else, an opaque
 * origin, and a policy that denies every external resource and every connection. The only
 * way out is `postMessage`, and `Kit.bridge` is the only thing in the frame that calls it.
 *
 * The toolkit comes from the Course folder, never from the app (docs/adr/0014). A Course
 * built a year ago keeps behaving the way it was built, and installing a newer Whetstone
 * changes nothing about it.
 */

/** The toolkit this build ships. It is written into a Course at build time, and nowhere else. */
export const TOOLKIT_VERSION = '1.3.0'

const MARKER = /whetstone-toolkit\s+(\d+\.\d+\.\d+)/

/**
 * `default-src 'none'` is the whole point: no network, no fonts, no images from anywhere,
 * no frames, no form posts.
 *
 * Two allowances are deliberate. `script-src 'unsafe-inline'` is what runs the Mini-app at
 * all, because nothing can be fetched. `'unsafe-eval'` is what lets `Kit.editor` run the
 * learner's own code, which is the point of an `assertions-pass` Task; inside a frame with
 * no network, no storage and no reach into the host it grants nothing the inline script did
 * not already have (docs/adr/0016).
 */
export const POLICY = [
  "default-src 'none'",
  "script-src 'unsafe-inline' 'unsafe-eval'",
  "style-src 'unsafe-inline'",
  'img-src data:',
  'media-src data:',
  "connect-src 'none'",
  "font-src 'none'",
  "frame-src 'none'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ')

export interface Toolkit {
  version: string
  css: string
  js: string
}

/**
 * Read a toolkit from a folder. The version comes from the file rather than from anything
 * that names it, so a copy that drifted from what `course.json` records can be caught.
 */
export function readToolkit(dir: string): Toolkit | undefined {
  const js = join(dir, 'kit.js')
  const css = join(dir, 'kit.css')
  if (!existsSync(js) || !existsSync(css)) return undefined
  const source = readFileSync(js, 'utf8')
  return {
    version: MARKER.exec(source)?.[1] ?? '',
    css: readFileSync(css, 'utf8'),
    js: source,
  }
}

/** Anything that would reach outside the frame. The policy blocks these; this names them. */
export const EXTERNAL = /\b(?:src|href)\s*=\s*["']?(?:https?:|\/\/|file:|blob:)/i

/**
 * The Course's own library: the files `course.json` lists under `library`, read from
 * `lib/` in the order the Course gave (docs/adr/0019).
 *
 * This is how a Course carries a feature the toolkit does not have. The toolkit is the
 * same in every Course and holds the plumbing. A library is one Course's own code, it goes
 * into every Mini-app in that Course, and the app knows nothing about what is in it.
 *
 * A name the parser already refused cannot reach here, so a missing file is skipped rather
 * than thrown: a Mini-app drawing without its library is a visible failure in the frame,
 * and a Course that will not open at all is not.
 */
function courseLibrary(courseDir: string): { css: string[]; js: string[] } {
  const css: string[] = []
  const js: string[] = []
  const listed = manifestField(courseDir, 'library')
  if (!Array.isArray(listed)) return { css, js }

  for (const name of listed) {
    if (typeof name !== 'string' || name.includes('/') || name.includes('\\') || name.startsWith('.')) {
      continue
    }
    const file = join(courseDir, 'lib', name)
    if (!existsSync(file)) continue
    if (name.endsWith('.css')) css.push(readFileSync(file, 'utf8'))
    else if (name.endsWith('.js')) js.push(readFileSync(file, 'utf8'))
  }
  return { css, js }
}

/** One field out of `course.json`, or `undefined` for a Course whose manifest cannot be read. */
function manifestField(courseDir: string, field: string): unknown {
  const manifest = join(courseDir, 'course.json')
  if (!existsSync(manifest)) return undefined
  try {
    return (JSON.parse(readFileSync(manifest, 'utf8')) as Record<string, unknown>)[field]
  } catch {
    return undefined
  }
}

/**
 * The runtime pointers a Course's manifest names (docs/adr/0026), read back out of the
 * shared cache for inlining. A pointer the cache has nothing for (never fetched, or a cache
 * wiped since) is silently skipped rather than thrown: `fetchRuntime` already refused to
 * finish the build without it, so reaching this with an empty cache means the cache itself
 * was cleared after the fact — the Mini-app should still render, just without that language.
 */
function courseRuntimes(courseDir: string, cacheRoot: string): { lang: string; assets: { name: string; bytes: Buffer }[] }[] {
  const listed = manifestField(courseDir, 'runtimes')
  if (!Array.isArray(listed)) return []

  const runtimes: { lang: string; assets: { name: string; bytes: Buffer }[] }[] = []
  for (const entry of listed) {
    const ref = entry as Partial<RuntimeRef> | undefined
    if (typeof ref?.lang !== 'string' || typeof ref.version !== 'string') continue
    const assets = readRuntimeAssets(cacheRoot, { lang: ref.lang, version: ref.version })
    if (assets.length > 0) runtimes.push({ lang: ref.lang, assets })
  }
  return runtimes
}

/**
 * Assemble the sealed document itself: the policy, the toolkit, the Course's library, and
 * finally the body markup the caller supplied. Both a hand-written Mini-app and a
 * generated Lesson codeblock go through this one place, so neither can drift from the
 * other's policy or inlining order.
 *
 * Order is the contract. Any runtime the Course needs is wired first (so it can start
 * loading before anything else runs), then the toolkit, then the Course's library in the
 * order the Course listed it, then the body. So a library file may use the toolkit, the
 * body may use both, and the toolkit can be read without knowing either.
 */
function assembleFrame(
  toolkit: Toolkit,
  library: { css: string[]; js: string[] },
  body: string,
  runtimeScript: string,
): string {
  return [
    '<!doctype html>',
    '<html lang="en">',
    '<head>',
    '<meta charset="utf-8">',
    `<meta http-equiv="Content-Security-Policy" content="${POLICY}">`,
    `<style>\n${[toolkit.css, ...library.css].join('\n')}\n</style>`,
    '</head>',
    '<body>',
    ...(runtimeScript ? [runtimeScript] : []),
    `<script>\n${[toolkit.js, ...library.js].join('\n')}\n</script>`,
    body,
    '</body>',
    '</html>',
  ].join('\n')
}

/** Read a Course's pinned toolkit, library, and inlined runtimes, or throw for a Course the parser accepted. */
function frameParts(
  courseDir: string,
  cacheRoot: string,
): { toolkit: Toolkit; library: { css: string[]; js: string[] }; runtimeScript: string } {
  const toolkit = readToolkit(join(courseDir, 'toolkit'))
  if (!toolkit) throw new Error(`course at ${courseDir} has no pinned toolkit`)
  return {
    toolkit,
    library: courseLibrary(courseDir),
    runtimeScript: runtimeBootstrapScript(courseRuntimes(courseDir, cacheRoot)),
  }
}

/**
 * Build the document for one Mini-app. Throws only for a Course the parser already
 * accepted, so a failure here is a programming error rather than a broken Course.
 *
 * `cacheRoot` is the shared runtime cache (`runtimeCacheRoot()`, `src/main/courseStore.ts`):
 * every runtime the Course's manifest names is inlined here, since a hand-written Mini-app's
 * own script is not something this can inspect for which language it actually calls
 * `Kit.run` with.
 */
export function frameSource(courseDir: string, appId: string, cacheRoot: string): string {
  const file = join(courseDir, 'apps', appId, 'index.html')
  if (!existsSync(file)) throw new Error(`mini-app "${appId}" has no index.html`)
  const markup = readFileSync(file, 'utf8')
  if (EXTERNAL.test(markup)) throw new Error(`mini-app "${appId}" refers to something outside itself`)

  const { toolkit, library, runtimeScript } = frameParts(courseDir, cacheRoot)
  return assembleFrame(toolkit, library, markup, runtimeScript)
}

/**
 * Build the document for one Lesson codeblock: a `Kit.codeblock` wired up with the
 * declared language and starting code, nothing else. Unlike a Mini-app there is no
 * `apps/<id>/index.html` to read — the config comes straight from the parsed Lesson block
 * (docs/adr/0026), so the only way this throws is a Course the parser already accepted.
 *
 * Only the block's own `lang` is inlined here, unlike a Mini-app: the config names exactly
 * which language `Kit.codeblock` will call, so a Course using `python` in one Lesson and
 * nothing but `js` in every Mini-app never pays for a runtime nothing here needs.
 */
export function codeblockFrameSource(
  courseDir: string,
  block: { lang: string; start: string; label?: string },
  cacheRoot: string,
): string {
  const { toolkit, library } = frameParts(courseDir, cacheRoot)
  const runtimeScript =
    block.lang === 'js' ? '' : runtimeBootstrapScript(courseRuntimes(courseDir, cacheRoot).filter((r) => r.lang === block.lang))
  // `<` is escaped so starting code containing a literal "</script>" (plausible in an
  // example about HTML or JS itself) cannot close this tag early.
  const config = JSON.stringify({ mount: '#app', lang: block.lang, start: block.start, label: block.label }).replace(
    /</g,
    '\\u003c',
  )
  const body = [
    '<div id="app"></div>',
    '<script>',
    `Kit.codeblock(${config});`,
    'Kit.bridge.ready();',
    '</script>',
  ].join('\n')
  return assembleFrame(toolkit, library, body, runtimeScript)
}
