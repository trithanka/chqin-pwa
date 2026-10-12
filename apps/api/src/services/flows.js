import { desc, eq } from 'drizzle-orm'
import { db } from '../db/client.js'
import { flowDefinitions } from '../db/schema/index.js'
import { knownStepTypes } from './steps.js'

/**
 * A flow is an ordered list of steps: [{ type, when?, ...options }].
 *
 * `when` is a map of state keys to values; the step runs only if every pair
 * matches the session's state, and is skipped otherwise. That is the only
 * branching a flow has — the Nest's "meeting goes to staff approval, event goes
 * to registration" is two steps with different `when`s, which keeps a
 * session's position a single integer.
 */

/** Throws on a flow the runner could not walk. Run before one is published. */
export function validateFlow(steps, known = knownStepTypes) {
  if (!Array.isArray(steps) || steps.length === 0) throw new Error('a flow needs at least one step')
  steps.forEach((step, i) => {
    if (!known.has(step?.type)) throw new Error(`step ${i}: unknown type "${step?.type}"`)
    const { when } = step
    if (when !== undefined && (typeof when !== 'object' || when === null || Array.isArray(when))) {
      throw new Error(`step ${i}: "when" must be a plain object`)
    }
  })
  if (steps.at(-1).type !== 'admit') throw new Error('a flow must end with "admit"')
  if (steps.at(-1).when) throw new Error('"admit" cannot be conditional')
  return steps
}

// Published flows never change, so a row can be kept for the life of the process.
const cache = new Map()

export async function loadFlow(flowId) {
  const hit = cache.get(flowId)
  if (hit) return hit
  const [row] = await db
    .select({ id: flowDefinitions.id, key: flowDefinitions.key, steps: flowDefinitions.steps })
    .from(flowDefinitions)
    .where(eq(flowDefinitions.id, flowId))
    .limit(1)
  if (!row) return null
  const flow = { id: row.id, key: row.key, steps: validateFlow(row.steps) }
  cache.set(flowId, flow)
  return flow
}

/** The newest published version of a flow, e.g. 'hotel'. `exec` lets onboarding call it inside its transaction. */
export async function latestFlowId(key, exec = db) {
  const [row] = await exec
    .select({ id: flowDefinitions.id })
    .from(flowDefinitions)
    .where(eq(flowDefinitions.key, key))
    .orderBy(desc(flowDefinitions.version))
    .limit(1)
  if (!row) throw new Error(`no published flow "${key}"`)
  return row.id
}
