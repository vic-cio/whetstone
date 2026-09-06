import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

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
export const TOOLKIT_VERSION = '1.0.0'

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
  const manifest = join(courseDir, 'course.json')
  if (!existsSync(manifest)) return { css, js }

  let listed: unknown
  try {
    listed = (JSON.parse(readFileSync(manifest, 'utf8')) as Record<string, unknown>)['library']
  } catch {
    return { css, js }
  }
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

/**
 * Build the document for one Mini-app. Throws only for a Course the parser already
 * accepted, so a failure here is a programming error rather than a broken Course.
 *
 * Order is the contract. The toolkit is first, then the Course's library in the order the
 * Course listed it, then the app. So a library file may use the toolkit, an app may use
 * both, and the toolkit can be read without knowing either.
 */
export function frameSource(courseDir: string, appId: string): string {
  const file = join(courseDir, 'apps', appId, 'index.html')
  if (!existsSync(file)) throw new Error(`mini-app "${appId}" has no index.html`)
  const toolkit = readToolkit(join(courseDir, 'toolkit'))
  if (!toolkit) throw new Error(`course at ${courseDir} has no pinned toolkit`)
  const library = courseLibrary(courseDir)

  const markup = readFileSync(file, 'utf8')
  if (EXTERNAL.test(markup)) throw new Error(`mini-app "${appId}" refers to something outside itself`)

  return [
    '<!doctype html>',
    '<html lang="en">',
    '<head>',
    '<meta charset="utf-8">',
    `<meta http-equiv="Content-Security-Policy" content="${POLICY}">`,
    `<style>\n${[toolkit.css, ...library.css].join('\n')}\n</style>`,
    '</head>',
    '<body>',
    `<script>\n${[toolkit.js, ...library.js].join('\n')}\n</script>`,
    markup,
    '</body>',
    '</html>',
  ].join('\n')
}
