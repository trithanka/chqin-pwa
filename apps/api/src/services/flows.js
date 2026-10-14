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
    // A value, or a list meaning "any of these". Anything else never matches
    // and silently skips the step, which is worse than refusing to publish.
    for (const [key, value] of Object.entries(when ?? {})) {
      const values = Array.isArray(value) ? value : [value]
      if (!values.length || !values.every((v) => ['string', 'number', 'boolean'].includes(typeof v))) {
        throw new Error(`step ${i}: "when.${key}" must be a value or a list of values`)
      }
    }
    if (step.type === 'collect_details') validateFields(step.fields, i)
  })
  if (steps.at(-1).type !== 'admit') throw new Error('a flow must end with "admit"')
  if (steps.at(-1).when) throw new Error('"admit" cannot be conditional')
  return steps
}

/** collect_details' form: keys a later `when` can read, and choices that have something to choose. */
function validateFields(fields, i) {
  if (!Array.isArray(fields) || !fields.length) throw new Error(`step ${i}: collect_details needs a "fields" list`)
  const keys = new Set()
  for (const field of fields) {
    if (typeof field?.key !== 'string' || !/^[a-zA-Z][\w]*$/.test(field.key)) {
      throw new Error(`step ${i}: every field needs a "key" (letters, digits, underscore)`)
    }
    if (keys.has(field.key)) throw new Error(`step ${i}: field "${field.key}" appears twice`)
    keys.add(field.key)
    const kind = field.kind ?? 'text'
    if (!['text', 'choice'].includes(kind)) throw new Error(`step ${i}: field "${field.key}" kind must be "text" or "choice"`)
    if (kind === 'choice') {
      const listed = Array.isArray(field.options) && field.options.length > 0
      if (!listed && typeof field.source !== 'string') {
        throw new Error(`step ${i}: choice "${field.key}" needs "options" or a "source"`)
      }
      if (listed && !field.options.every((o) => typeof o === 'string' || (typeof o?.value === 'string' && o.value))) {
        throw new Error(`step ${i}: choice "${field.key}" options must be strings or { value, label }`)
      }
    }
  }
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

/**
 * Which flow a new venue's first gate runs. Kinds not listed fall back to the
 * hotel flow, which is what every venue ran before there was a choice.
 */
const FLOW_BY_KIND = { office: 'visitor.host_approval' }
export const flowKeyFor = (kind) => FLOW_BY_KIND[kind] ?? 'hotel'
