/**
 * Reading a login shell's environment.
 *
 * An app launched from Finder inherits a bare environment. The PATH widening in
 * `src/main/harness.ts` exists for that reason, and the rest of the environment is missing
 * for the same reason: `~/.zshrc` is read by an interactive shell and by nothing else, so a
 * harness configured to take its key from `$OPENROUTER_API_KEY` finds nothing and reports
 * itself unauthenticated, with the app none the wiser.
 *
 * That is how this was found: a credential check run from a non-interactive shell said a
 * provider was not ready while it was working perfectly well in the user's own terminal.
 *
 * The parse lives here, away from the spawning, because it is the part that can be wrong in
 * a way nobody notices: a shell prints its own greeting before the environment, and a value
 * may contain a newline or an `=`.
 */

/** The marker printed before the environment, so a shell's greeting is not mistaken for it. */
export const MARK = '\0__whetstone__\0'

/**
 * Read `env -0` output, taking only what follows the marker.
 *
 * Null-separated rather than line-separated, because a value may contain a newline and a
 * line-separated parse would turn the rest of it into variables that do not exist.
 */
export function readEnvironment(printed: string): Record<string, string> {
  const found: Record<string, string> = {}
  const at = printed.indexOf(MARK)
  if (at < 0) return found

  for (const entry of printed.slice(at + MARK.length).split('\0')) {
    const split = entry.indexOf('=')
    // A name is everything before the first `=`; a value may contain as many as it likes.
    if (split > 0) found[entry.slice(0, split)] = entry.slice(split + 1)
  }
  return found
}
