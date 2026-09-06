import { serviceReply } from '../shared/services'
import { loadCourse } from './courseStore'
import type { ServiceReply } from '../shared/services'

/**
 * Routing a Mini-app's request to a Service.
 *
 * The frame asks over the same bridge it already answers on. All this adds is the Course:
 * what a Mini-app may ask for is written in `course.json`, and the decision itself is in
 * `shared/services.ts` where it can be tested without starting anything (docs/adr/0018).
 */
export function askService(slug: string, service: string, request: unknown): ServiceReply {
  let declared
  try {
    declared = loadCourse(slug).services
  } catch {
    return { ok: false, error: 'that course is not open' }
  }
  return serviceReply(declared, service, request)
}
