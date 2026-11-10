/**
 * Model-facing organization tools over `ctx.agentOrgs`: name one organization,
 * record a worker Session in it, and read back membership.
 *
 * Dispatch and messaging are not re-implemented here. A manager names the
 * group with these tools and then uses the Agent Teams tools to spawn workers
 * and deliver messages, so there is one mailbox in the composition.
 * @module @deepseek-ai/dsh-experimental-tool-agent-org
 */

import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { OrgId } from '@deepseek-ai/dsh-experimental-agent-org'
import type { Org, OrgMember } from '@deepseek-ai/dsh-experimental-agent-org'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { defineTool, jsonOutput } from '@deepseek-ai/dsh-tools'
import type { InferValue, ToolRunContext } from '@deepseek-ai/dsh-tools'

/** Cordis plugin name. */
export const name = 'tool-agent-org'
/** Services required by the organization tool plugin. */
export const inject = ['agents', 'agentOrgs', 'tools']

/** One organization without its roster; `org_members` reads the rows. */
const ORG_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    id: { type: 'string', required: true },
    name: { type: 'string', required: true },
    memberCount: { type: 'integer', required: true },
    createdAt: { type: 'string', required: true },
    updatedAt: { type: 'string', required: true },
  },
} as const

/** One membership row, matching the public `OrgMember`. */
const MEMBER_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    sessionId: { type: 'string', required: true },
    role: { type: 'string', required: true, enum: ['manager', 'worker'] },
    joinedAt: { type: 'string', required: true },
  },
} as const

const ORG_LIST_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    organizations: { type: 'array', required: true, items: ORG_SCHEMA },
  },
} as const

const MEMBER_LIST_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    members: { type: 'array', required: true, items: MEMBER_SCHEMA },
  },
} as const

/** Drop the roster from one organization projection. */
function summary(org: Org): InferValue<typeof ORG_SCHEMA> {
  return {
    id: String(org.id),
    name: org.name,
    memberCount: org.members.length,
    createdAt: org.createdAt,
    updatedAt: org.updatedAt,
  }
}

/** Project one stored membership row for the model. */
function member(row: OrgMember): InferValue<typeof MEMBER_SCHEMA> {
  return { sessionId: String(row.sessionId), role: row.role, joinedAt: row.joinedAt }
}

/**
 * The Session that issued one tool call.
 * @param exec - tool execution metadata supplied by the registry.
 * @param toolName - tool being executed, used in the failure message.
 * @returns the calling Agent's Session id.
 */
function callingSession(exec: ToolRunContext, toolName: string): SessionId {
  const agent = exec.agent
  if (agent === undefined) throw new Error(`${toolName} requires a calling Agent`)
  return agent.session.id
}

/**
 * Resolve one model-supplied Session id against the live Agents. An
 * organization row names a Session the registry does not own and never
 * reconciles, so the only moment a wrong id can be refused is while it is
 * being written.
 * @param ctx - Context carrying the live Agent registry.
 * @param sessionId - Session id named by the model.
 * @returns the same id once an Agent is running for it.
 */
function liveSession(ctx: Context, sessionId: string): SessionId {
  const found = ctx.agents.list().find((agent: Agent) => String(agent.session.id) === sessionId)
  if (found === undefined) {
    throw new Error(
      `no live Session '${sessionId}'. Use the id returned by spawn_teammate or list_agents, `
      + 'and add the worker while it is still running.',
    )
  }
  return found.session.id
}

/** Register the organization tool set in the composing plane. */
export function apply(ctx: Context): void {
  ctx.tools.register(defineTool({
    name: 'org_create',
    description: 'Create one named organization and record this Session in it as its manager. '
      + 'The organization owns its own id, so it outlives this Session.',
    parameters: {
      name: { type: 'string', required: true, description: 'Display name for the organization.' },
    },
    output: jsonOutput(ORG_SCHEMA),
    async execute(args, exec) {
      const manager = callingSession(exec, 'org_create')
      const org = await ctx.agentOrgs.create(args.name)
      return summary(await ctx.agentOrgs.join(org.id, manager, 'manager'))
    },
  }))

  ctx.tools.register(defineTool({
    name: 'org_add_worker',
    description: 'Record one running Session in an organization as a worker. A Session may be a '
      + 'worker in several organizations at once; a second row in the same organization is refused.',
    parameters: {
      org_id: { type: 'string', required: true, description: 'Organization id from org_create or org_list.' },
      session_id: {
        type: 'string',
        required: true,
        description: 'Session id of the worker, as returned by spawn_teammate or list_agents.',
      },
    },
    output: jsonOutput(ORG_SCHEMA),
    async execute(args) {
      const worker = liveSession(ctx, args.session_id)
      return summary(await ctx.agentOrgs.join(OrgId(args.org_id), worker, 'worker'))
    },
  }))

  ctx.tools.register(defineTool({
    name: 'org_list',
    description: 'List every organization this Session belongs to, newest first.',
    parameters: {},
    output: jsonOutput(ORG_LIST_SCHEMA),
    execute(_args, exec) {
      const session = callingSession(exec, 'org_list')
      return Promise.resolve({ organizations: ctx.agentOrgs.orgsOf(session).map(summary) })
    },
  }))

  ctx.tools.register(defineTool({
    name: 'org_members',
    description: 'Read one organization\'s roster in join order, with each member\'s role.',
    parameters: {
      org_id: { type: 'string', required: true, description: 'Organization id from org_create or org_list.' },
    },
    output: jsonOutput(MEMBER_LIST_SCHEMA),
    execute(args) {
      return Promise.resolve({ members: ctx.agentOrgs.membersOf(OrgId(args.org_id)).map(member) })
    },
  }))
}
