/**
 * Services: what the host will answer for a Mini-app.
 *
 * A Mini-app is one file, sealed, with no network and no second script (docs/adr/0005).
 * That is right for a widget and wrong for a body of rules: every chess Course would carry
 * its own move generator, and each one would be wrong in its own way. A Service moves that
 * work to the host, where it is written once and tested once (docs/adr/0018).
 *
 * Three rules hold:
 *
 *  - A Course declares the Services it uses, the way it declares its toolkit version. The
 *    host answers nothing a Course did not declare.
 *  - A Course names a capability and a version, never a path. Nothing in a Course folder
 *    can point at the rest of the machine.
 *  - A Service is offline, pure and shared. It reads a request and returns a value.
 *
 * This file is the catalogue, and it is in `shared` so the parser can refuse an unknown
 * Service without starting anything.
 */

import { askChess } from './chess'

export interface ServiceInfo {
  version: string
  summary: string
}

export const SERVICES: Record<string, ServiceInfo> = {
  chess: {
    version: '1.0.0',
    summary: 'Chess rules: legal moves, castling, en passant, promotion, check, mate, and an opponent.',
  },
}

/** What a Course writes in `course.json`. */
export interface ServiceUse {
  id: string
  version: string
}

const major = (version: string): string => version.split('.')[0] ?? ''

/**
 * Why this build cannot answer for that Service, or undefined when it can.
 *
 * The major number is the promise. A Course pinned to chess 1 keeps working while chess 1
 * gains operations, and stops loudly if chess 2 ever changes what the old ones return.
 */
export function serviceProblem(use: ServiceUse): string | undefined {
  const known = SERVICES[use.id]
  if (!known) {
    const names = Object.keys(SERVICES).join(', ')
    return `names a service this build does not have: "${use.id}". It has: ${names}`
  }
  if (major(known.version) !== major(use.version)) {
    return `wants ${use.id} ${use.version} but this build has ${known.version}`
  }
  return undefined
}

// ---------------------------------------------------------------- answering

export type ServiceReply = { ok: true; value: unknown } | { ok: false; error: string }

const HANDLERS: Record<string, (request: unknown) => unknown> = {
  chess: askChess,
}

/**
 * Answer one request from a Mini-app, or say why not.
 *
 * Two checks stand between a Mini-app and a Service: the Course must declare it, and this
 * build must have it. Nothing here trusts the request, which is data a sealed frame wrote.
 * A Service that throws is a Mini-app asking for something impossible, so the reason goes
 * back as words rather than as a stack.
 */
export function serviceReply(declared: ServiceUse[], service: string, request: unknown): ServiceReply {
  const handler = HANDLERS[service]
  if (!handler || !SERVICES[service]) return { ok: false, error: `there is no service named "${service}"` }
  if (!declared.some((use) => use.id === service)) {
    return { ok: false, error: `this course does not declare the "${service}" service` }
  }
  try {
    return { ok: true, value: handler(request) }
  } catch (cause) {
    return { ok: false, error: (cause as Error).message }
  }
}
