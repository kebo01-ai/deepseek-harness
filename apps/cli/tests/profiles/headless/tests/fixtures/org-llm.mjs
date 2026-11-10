/** Deterministic keyless organization adapter for the headless composition snapshot. */

import { ToolCallId, LlmAdapter } from '@deepseek-ai/dsh-llm'

let nextCall = 0

function calls(messages) {
  return messages.flatMap(message => message.role === 'assistant'
    ? message.content.filter(block => block.type === 'tool-call').map(block => block.name)
    : [])
}

function latestAssistantCalls(messages) {
  const assistant = messages.findLast(message => message.role === 'assistant')
  return assistant?.content.filter(block => block.type === 'tool-call').map(block => block.name) ?? []
}

/**
 * Every tool result decoded in call order. The organization and Team tools both
 * render compact JSON, and an id read once has to stay readable later in the
 * run, so the whole history is decoded rather than only the newest result.
 */
function toolValues(messages) {
  return messages.flatMap(message => message.content.flatMap(block => block.type === 'tool-result'
    ? block.content.filter(item => item.type === 'text').flatMap((item) => {
      try {
        return [JSON.parse(item.text)]
      } catch {
        // A failure result is plain prose; the scripts below read ids only.
        return []
      }
    })
    : []))
}

function toolChunks(specs) {
  const chunks = []
  for (const [index, spec] of specs.entries()) {
    const id = ToolCallId(`org-fixture-${++nextCall}`)
    const args = JSON.stringify(spec.args)
    chunks.push(
      { type: 'block-start', index, blockType: 'tool-call' },
      { type: 'tool-call-delta', index, id, name: spec.name, argumentsDelta: args },
      { type: 'block-end', index, block: { type: 'tool-call', id, name: spec.name, arguments: args } },
    )
  }
  chunks.push(
    { type: 'usage', usage: { inputTokens: 10, outputTokens: 5 } },
    { type: 'finish', reason: { kind: 'tool-calls' } },
  )
  return chunks
}

function textChunks(text) {
  return [
    { type: 'block-start', index: 0, blockType: 'text' },
    { type: 'text-delta', index: 0, text },
    { type: 'block-end', index: 0, block: { type: 'text', text } },
    { type: 'usage', usage: { inputTokens: 10, outputTokens: 3 } },
    { type: 'finish', reason: { kind: 'stop' } },
  ]
}

/** `org_create` is the only result that carries an organization id plus a roster size. */
function orgId(values) {
  return values.find(value => typeof value?.id === 'string' && typeof value?.memberCount === 'number')?.id
}

/** Worker Session ids in spawn order, taken from each `spawn_teammate` result. */
function spawnedSessions(values) {
  return values.flatMap(value => typeof value?.member?.id === 'string' ? [value.member.id] : [])
}

/** Inactive teammates in the newest `list_agents` roster. */
function inactiveCount(values) {
  const roster = values.at(-1)
  if (!Array.isArray(roster)) return 0
  return roster.filter(row => row?.role === 'teammate' && row?.status === 'inactive').length
}

const ORG_NAME = '研发一组'
const WORKERS = ['worker-a', 'worker-b']

/**
 * Manager script: name the organization, spawn each worker and record it,
 * tell both workers they are in, read the roster back, then wait them out.
 */
function manager(messages) {
  const names = calls(messages)
  const values = toolValues(messages)
  const org = orgId(values)
  if (org === undefined) return toolChunks([{ name: 'org_create', args: { name: ORG_NAME } }])

  const sessions = spawnedSessions(values)
  const joined = names.filter(name => name === 'org_add_worker').length
  if (sessions.length > joined) {
    return toolChunks([{ name: 'org_add_worker', args: { org_id: org, session_id: sessions[joined] } }])
  }
  if (sessions.length < WORKERS.length) {
    const worker = WORKERS[sessions.length]
    return toolChunks([{
      name: 'spawn_teammate',
      args: {
        name: worker,
        description: `Own the ${worker} share of the deterministic task.`,
        prompt: `ORG_WORKER_MARK ${worker}: wait for the manager's note, read your organizations, then finish.`,
        context: 'fresh',
      },
    }])
  }

  const sent = names.filter(name => name === 'send_message').length
  if (sent < WORKERS.length) {
    return toolChunks([{ name: 'send_message', args: { target: WORKERS[sent], message: 'ORG_JOINED' } }])
  }
  if (!names.includes('org_members')) return toolChunks([{ name: 'org_members', args: { org_id: org } }])
  // Alternate waiting with re-listing: polling the roster back to back would
  // burn the step budget before either worker reaches its closing text.
  if (latestAssistantCalls(messages).includes('list_agents')) {
    if (inactiveCount(values) >= WORKERS.length) {
      return textChunks('ORG_OK: both workers recorded and finished.')
    }
    return toolChunks([{ name: 'wait_agent', args: { timeout_ms: 10000 } }])
  }
  return toolChunks([{ name: 'list_agents', args: {} }])
}

/** Worker script: idle until the manager's note lands, then read membership back. */
function worker(messages) {
  const names = calls(messages)
  const noted = messages.some(message => message.role === 'user'
    && message.content.some(block => block.type === 'text' && block.text.includes('ORG_JOINED')))
  // Finite waiting: a missing note has to surface as a failed assertion on the
  // worker's own `org_list`, not as a run that never ends.
  const waits = names.filter(name => name === 'wait_agent').length
  if (!noted && waits < 8) return toolChunks([{ name: 'wait_agent', args: { timeout_ms: 10000 } }])
  if (!names.includes('org_list')) return toolChunks([{ name: 'org_list', args: {} }])
  return textChunks('ORG_WORKER_OK: membership read back.')
}

class OrgFixtureAdapter extends LlmAdapter {
  async * stream(options) {
    const tools = options.tools.map(tool => tool.name)
    for (const required of ['org_create', 'org_add_worker', 'org_list', 'org_members', 'spawn_teammate']) {
      if (!tools.includes(required)) throw new Error(`organization profile is missing ${required}`)
    }
    const initial = options.messages.findLast(
      message => message.role === 'user' && message.source.kind === 'user',
    )
    const identity = initial?.content[0]?.text?.trimEnd() ?? ''
    const chunks = WORKERS.some(name => identity === `<system-reminder>\nYou are teammate "${name}".\n</system-reminder>`)
      ? worker(options.messages)
      : manager(options.messages)
    for (const chunk of chunks) {
      options.signal?.throwIfAborted()
      yield chunk
    }
  }
}

/** Cordis plugin name. */
export const name = 'org-fixture-llm'
/** LLM registry dependency. */
export const inject = ['llm']

/** Register the keyless adapter on the shipped default provider route. */
export function apply(ctx) {
  ctx.llm.registerAdapter(['deepseek-official'], new OrgFixtureAdapter())
}
