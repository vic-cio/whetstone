import { describe, expect, it } from 'vitest'

import { MARK, readEnvironment } from '../src/shared/environment'

/**
 * The environment a harness would have had in the user's own terminal.
 *
 * This was found rather than designed. A credential check run from a non-interactive shell
 * reported that a provider had no key, while the same provider was working in the user's
 * terminal, because `~/.zshrc` is read by an interactive shell and by nothing else.
 */

describe('reading a login shell’s environment', () => {
  it('takes nothing before the marker, so a shell’s greeting is not a variable', () => {
    const printed = `Welcome back!\nlast login: today\nPATH=/nope${MARK}HOME=/Users/x\0PATH=/usr/bin\0`
    expect(readEnvironment(printed)).toEqual({ HOME: '/Users/x', PATH: '/usr/bin' })
  })

  it('keeps a value that contains an equals sign', () => {
    const printed = `${MARK}TOKEN=abc=def=ghi\0`
    expect(readEnvironment(printed)).toEqual({ TOKEN: 'abc=def=ghi' })
  })

  it('keeps a value that contains a newline, which is why this is null-separated', () => {
    // A line-separated parse would turn the second half into a variable that does not exist.
    const printed = `${MARK}SCRIPT=line one\nline two\0HOME=/Users/x\0`
    expect(readEnvironment(printed)).toEqual({ SCRIPT: 'line one\nline two', HOME: '/Users/x' })
  })

  it('ignores an entry with no name', () => {
    expect(readEnvironment(`${MARK}=orphan\0GOOD=yes\0`)).toEqual({ GOOD: 'yes' })
  })

  it('returns nothing at all when the marker never arrived', () => {
    // A shell that failed is not a reason to guess at an environment.
    expect(readEnvironment('command not found: pi')).toEqual({})
    expect(readEnvironment('')).toEqual({})
  })
})
