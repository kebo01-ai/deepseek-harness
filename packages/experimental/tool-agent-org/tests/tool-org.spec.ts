import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import { mountAgentLoopTestDependencies } from '@deepseek-ai/dsh-agent-loop-testkit'
import { ToolCallId } from '@deepseek-ai/dsh-llm'
import { scopeOf } from '@deepseek-ai/dsh-scope'
import { SessionId } from '@deepseek-ai/dsh-session'
import Storage from '@deepseek-ai/dsh-storage'
import { DomainFacility } from '@deepseek-ai/dsh-storage-domain'
import OrgRegistry from '@deepseek-ai/dsh-experimental-agent-org'
import {
  MemoryMediaPool,
  MemoryStorageBackend,
} from '../../../storage/storage-domain/tests/helpers/memory-backend.ts'
import * as toolOrg from '../src/index.ts'

const SIGNAL = new AbortController().signal
const contexts = new Set<Context>()
let callNumber = 0

afterEach(async () => {
  for (const ctx of contexts) await ctx.fiber.dispose()
  contexts.clear()
})

/** Boot storage, the organization registry, and the tools over one medium. */
async function setup() {
  const ctx = new Context()
  contexts.add(ctx)
  await mountAgentLoopTestDependencies(ctx)
  await ctx.plugin(Storage)
  ctx.storage.backend.register('memory', new MemoryStorageBackend(new MemoryMediaPool()))
  const facility = new DomainFacility(ctx, { backend: 'memory', routes: {} })
  ctx.storage.mount('domain', facility)
  ctx.provide('storageDomain', facility)
  await ctx.plugin(OrgRegistry)
  await ctx.plugin(AgentLoop, { agents: [] })
  const fiber = await ctx.plugin(toolOrg)
  const manager = await ctx.agentLoop.create(SessionId('org-manager'))
  return { ctx, fiber, manager }
}

/** Execute one organization tool the way the registry does. */
function execute(ctx: Context, agent: Agent | undefined, name: string, args: unknown) {
  return ctx.tools.execute({
    callId: ToolCallId(`org-call-${++callNumber}`),
    name,
    arguments: args,
    signal: SIGNAL,
    ...agent === undefined ? {} : { agent },
  })
}

/** The model-visible text of one tool call, whether it succeeded or failed. */
async function rendered(
  ctx: Context,
  agent: Agent | undefined,
  name: string,
  args: unknown,
): Promise<{ isError: boolean; text: string }> {
  const result = await execute(ctx, agent, name, args)
  return {
    isError: result.isError,
    text: result.content.flatMap(block => block.type === 'text' ? [block.text] : []).join(''),
  }
}

/** The model-visible JSON one successful tool call rendered. */
async function value(
  ctx: Context,
  agent: Agent | undefined,
  name: string,
  args: unknown,
): Promise<Record<string, unknown>> {
  const result = await rendered(ctx, agent, name, args)
  expect(result.isError, result.text).toBe(false)
  return JSON.parse(result.text) as Record<string, unknown>
}

/** Tool names the model actually sees in one Agent's assembled request. */
async function orgToolNames(ctx: Context, agent: Agent): Promise<string[]> {
  const scope = scopeOf(agent.ctx)
  if (scope === undefined) throw new Error('expected an Agent scope')
  const assembled = await ctx.systemPrompt.assemble({ scope })
  return assembled.tools.map(schema => schema.name).filter(name => name.startsWith('org_')).sort()
}

/** The roster rows one `org_members` result rendered. */
function rows(value: Record<string, unknown>): { sessionId: string; role: string; joinedAt: string }[] {
  return value['members'] as { sessionId: string; role: string; joinedAt: string }[]
}

describe('organization tool surface', () => {
  it('shows the four organization tools to the calling Agent', async () => {
    const { ctx, manager } = await setup()
    expect(await orgToolNames(ctx, manager))
      .toEqual(['org_add_worker', 'org_create', 'org_list', 'org_members'])
  })

  it('removes its tools when the plugin is disposed', async () => {
    const { ctx, fiber, manager } = await setup()
    await fiber.dispose()
    expect(await orgToolNames(ctx, manager)).toEqual([])
  })
})

describe('naming one organization', () => {
  it('records the creating Session as the manager', async () => {
    const { ctx, manager } = await setup()
    const org = await value(ctx, manager, 'org_create', { name: '  研发一组  ' })
    expect(org).toMatchObject({ name: '研发一组', memberCount: 1 })
    const roster = rows(await value(ctx, manager, 'org_members', { org_id: org['id'] }))
    expect(roster).toHaveLength(1)
    expect(roster[0]).toMatchObject({ sessionId: 'org-manager', role: 'manager' })
    expect(roster[0]?.joinedAt).toMatch(/Z$/u)
  })

  it('refuses a name the registry rejects', async () => {
    const { ctx, manager } = await setup()
    const failure = await rendered(ctx, manager, 'org_create', { name: '   ' })
    expect(failure.isError).toBe(true)
    expect(failure.text).toContain('must not be empty')
  })

  it('refuses a call that carries no Agent', async () => {
    const { ctx } = await setup()
    const failure = await rendered(ctx, undefined, 'org_create', { name: '研发一组' })
    expect(failure.isError).toBe(true)
    expect(failure.text).toContain('org_create requires a calling Agent')
  })
})

describe('adding workers to one organization', () => {
  it('appends two running workers in join order', async () => {
    const { ctx, manager } = await setup()
    const first = await ctx.agentLoop.create(SessionId('org-worker-a'))
    const second = await ctx.agentLoop.create(SessionId('org-worker-b'))
    const org = await value(ctx, manager, 'org_create', { name: '研发一组' })

    await value(ctx, manager, 'org_add_worker', { org_id: org['id'], session_id: 'org-worker-a' })
    const added = await value(ctx, manager, 'org_add_worker', {
      org_id: org['id'],
      session_id: 'org-worker-b',
    })
    expect(added).toMatchObject({ id: org['id'], memberCount: 3 })

    expect(rows(await value(ctx, manager, 'org_members', { org_id: org['id'] }))).toMatchObject([
      { sessionId: 'org-manager', role: 'manager' },
      { sessionId: String(first.session.id), role: 'worker' },
      { sessionId: String(second.session.id), role: 'worker' },
    ])
  })

  it('refuses a Session id no live Agent answers to', async () => {
    const { ctx, manager } = await setup()
    const org = await value(ctx, manager, 'org_create', { name: '研发一组' })
    const failure = await rendered(ctx, manager, 'org_add_worker', {
      org_id: org['id'],
      session_id: 'org-worker-absent',
    })
    expect(failure.isError).toBe(true)
    expect(failure.text).toContain("no live Session 'org-worker-absent'")
    expect(rows(await value(ctx, manager, 'org_members', { org_id: org['id'] })))
      .toMatchObject([{ role: 'manager' }])
  })

  it('refuses a second row for one Session in one organization', async () => {
    const { ctx, manager } = await setup()
    await ctx.agentLoop.create(SessionId('org-worker-a'))
    const org = await value(ctx, manager, 'org_create', { name: '研发一组' })
    await value(ctx, manager, 'org_add_worker', { org_id: org['id'], session_id: 'org-worker-a' })
    const failure = await rendered(ctx, manager, 'org_add_worker', {
      org_id: org['id'],
      session_id: 'org-worker-a',
    })
    expect(failure.isError).toBe(true)
    expect(failure.text).toContain('already belongs to organization')
  })

  it('refuses an unknown organization id', async () => {
    const { ctx, manager } = await setup()
    await ctx.agentLoop.create(SessionId('org-worker-a'))
    const join = await rendered(ctx, manager, 'org_add_worker', {
      org_id: 'absent',
      session_id: 'org-worker-a',
    })
    const read = await rendered(ctx, manager, 'org_members', { org_id: 'absent' })
    expect([join.isError, read.isError]).toEqual([true, true])
    expect(join.text).toContain("unknown organization 'absent'")
    expect(read.text).toContain("unknown organization 'absent'")
  })
})

describe('reading the organizations one Session belongs to', () => {
  it('answers with every organization that Session belongs to', async () => {
    const { ctx, manager } = await setup()
    const shared = await ctx.agentLoop.create(SessionId('org-worker-shared'))
    const left = await value(ctx, manager, 'org_create', { name: '研发一组' })
    const right = await value(ctx, manager, 'org_create', { name: '研发二组' })
    await value(ctx, manager, 'org_add_worker', { org_id: left['id'], session_id: 'org-worker-shared' })
    await value(ctx, manager, 'org_add_worker', { org_id: right['id'], session_id: 'org-worker-shared' })

    const mine = await value(ctx, shared, 'org_list', {})
    expect(mine['organizations']).toMatchObject([{ id: right['id'] }, { id: left['id'] }])
  })

  it('answers with an empty list for a Session in no organization', async () => {
    const { ctx, manager } = await setup()
    const outsider = await ctx.agentLoop.create(SessionId('org-worker-outsider'))
    await value(ctx, manager, 'org_create', { name: '研发一组' })
    expect(await value(ctx, outsider, 'org_list', {})).toEqual({ organizations: [] })
  })
})
