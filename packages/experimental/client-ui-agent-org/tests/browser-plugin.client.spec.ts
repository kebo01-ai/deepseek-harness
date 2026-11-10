import { Context, Service } from '@deepseek-ai/cordis'
import { describe, expect, it, vi } from 'vitest'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { SlotRegistry } from '@deepseek-ai/dsh-client-ui-renderer/client'
import type { OrgId, OrgListView } from '@deepseek-ai/dsh-experimental-agent-org/client'
import type {} from '@deepseek-ai/dsh-experimental-agent-org/remote'
import { RemoteError } from '@deepseek-ai/dsh-client-test-runtime'
import type { TypertRemoteContribution } from '@deepseek-ai/dsh-typert-protocol'
import { OrgAction, type OrgActionInjected } from '../src/client/OrgAction.tsx'
import { inject, mountAgentOrgUi } from '../src/client/mount.ts'
import { apply as nodeApply } from '../src/index.ts'

const MANAGER = 'org-manager' as SessionId
const WORKER = 'org-worker' as SessionId
const LISTED = 'org-listed' as SessionId
const REMOTE: TypertRemoteContribution = {
  package: '@deepseek-ai/dsh-experimental-agent-org',
  descriptors: [],
}

const VIEW: OrgListView = {
  orgs: [{
    id: 'org-1' as OrgId,
    name: '研发一组',
    createdAt: '2026-11-09T00:00:00.000Z',
    updatedAt: '2026-11-09T00:00:00.000Z',
    members: [
      { sessionId: MANAGER, role: 'manager', joinedAt: '2026-11-09T00:00:00.000Z' },
      { sessionId: WORKER, role: 'worker', joinedAt: '2026-11-09T00:00:01.000Z' },
    ],
  }],
}

/**
 * Narrow one slot entry's recorded inject face to the operations the action needs.
 * The registry stores the producer as returning an index signature, so the two
 * operations are read back by name and checked before use.
 * @param produce - the entry's recorded inject producer.
 * @returns the header action's operations.
 */
function injectedActions(
  produce: ((...args: never[]) => Record<string, unknown>) | undefined,
): OrgActionInjected {
  if (produce === undefined) throw new Error('header entry carries no inject face')
  const { load, openMember } = produce()
  if (typeof load !== 'function' || typeof openMember !== 'function') {
    throw new Error('header entry inject face is incomplete')
  }
  return { load, openMember } as OrgActionInjected
}

async function bench(options: {
  /** Member Sessions that already have a Host Session-list row. */
  listed?: readonly SessionId[]
  /** Reference sources holding the viewed conversation; `mainView` by default. */
  retainedBy?: Readonly<Partial<Record<'mainView' | 'sidebar', number>>>
  registrationFailure?: boolean
  remoteFailure?: boolean
} = {}) {
  const ctx = new Context()
  const calls: { method: string; args: unknown[] }[] = []
  class RemoteService extends Service {
    readonly disposeMount = vi.fn(() => Promise.resolve())
    readonly mount = vi.fn((_contribution: unknown) => Promise.resolve(this.disposeMount))

    constructor(serviceCtx: Context) {
      super(serviceCtx, 'remote')
    }

    $mount(contribution: unknown): Promise<() => Promise<void>> {
      return this.mount(contribution)
    }
  }
  const remote = new RemoteService(ctx)
  ctx.provide('remote.agentOrgs', {
    list: (...args: unknown[]) => {
      calls.push({ method: 'agentOrgs/list', args })
      return Promise.resolve(options.remoteFailure === true
        ? { ok: false as const, error: new RemoteError('gateway/internal', 'offline', {}) }
        : { ok: true as const, value: VIEW })
    },
  })
  const navigation: unknown[] = []
  const byId = Object.fromEntries(
    (options.listed ?? []).map(id => [id, { id, running: false }]),
  )
  const retainedBy = options.retainedBy ?? { mainView: 1 }
  ctx.provide('sessions', {
    list: { getSnapshot: () => ({ byId }) },
    retainInfo: () => ({
      getSnapshot: () => ({
        referenceCount: Object.values(retainedBy).reduce((sum, count) => sum + (count ?? 0), 0),
        retainedBy,
      }),
    }),
  })
  ctx.provide('uiWorkspace', {
    openSession: (target: unknown) => { navigation.push(['openSession', target]) },
  })
  ctx.provide('conversation', {})
  ctx.provide('locale', new LocaleRuntime(ctx))
  await ctx.plugin(SlotRegistry).await()
  const collapseHeader = ctx.slots.register({
    name: 'root',
    children: { 'conversation.session.header.actions': { kind: 'list', scope: 'session' } },
  } as never, () => null)
  if (options.registrationFailure === true) {
    vi.spyOn(ctx.slots, 'inject').mockImplementationOnce(() => { throw new Error('slot registration failed') })
  }
  const fiber = options.registrationFailure === true
    ? ctx.plugin({ apply() {} })
    : ctx.plugin({ inject: [...inject], apply: clientCtx => mountAgentOrgUi(clientCtx, REMOTE) })
  const activation: Promise<unknown> = options.registrationFailure === true
    ? mountAgentOrgUi(ctx, REMOTE).catch((error: unknown) => error)
    : fiber.await()
  await (options.registrationFailure === true ? fiber.await() : activation)
  const entry = () => ctx.slots.entries('conversation.session.header.actions')
    .find(candidate => candidate.component === OrgAction)
  return {
    ctx,
    fiber,
    activation,
    calls,
    navigation,
    remote,
    entry,
    collapseHeader,
    actions: () => injectedActions(entry()!.inject),
  }
}

describe('ui-agent-org browser plugin', () => {
  it('registers one disposable header action backed by the global registry read', async () => {
    const b = await bench()
    expect(inject).toEqual(['sessions', 'uiWorkspace', 'remote', 'slots', 'locale'])
    expect(b.entry()).toMatchObject({
      options: { id: 'agent-org', order: 21 },
      locale: 'agent-org',
    })
    expect(b.remote.mount).toHaveBeenCalledOnce()
    expect(b.remote.mount).toHaveBeenCalledWith(REMOTE)

    const actions = b.actions()
    await expect(actions.load()).resolves.toEqual({ ok: true, value: VIEW })
    expect(b.calls).toEqual([{ method: 'agentOrgs/list', args: [] }])

    await b.fiber.dispose()
    expect(b.entry()).toBeUndefined()
    expect(b.remote.disposeMount).toHaveBeenCalledOnce()
  })

  it('unmounts the Remote contribution when later Client registration fails', async () => {
    const b = await bench({ registrationFailure: true })
    await expect(b.activation).resolves.toMatchObject({ message: 'slot registration failed' })
    expect(b.remote.mount).toHaveBeenCalledOnce()
    expect(b.remote.disposeMount).toHaveBeenCalledOnce()
  })

  it('returns the Remote carrier failure unchanged', async () => {
    const b = await bench({ remoteFailure: true })
    await expect(b.actions().load()).resolves.toMatchObject({
      ok: false,
      error: { code: 'gateway/internal', message: 'offline' },
    })
  })

  it('opens a member the Session list already carries a row for', async () => {
    const b = await bench({ listed: [LISTED] })
    b.actions().openMember({ viewingSessionId: MANAGER, memberSessionId: LISTED })
    // Navigation resolves a known id's direct-parent address itself, so the
    // bare Session id is the whole target.
    expect(b.navigation).toEqual([['openSession', LISTED]])
  })

  it('leaves a member with no Session-list row unreachable', async () => {
    const b = await bench()
    b.actions().openMember({ viewingSessionId: MANAGER, memberSessionId: WORKER })
    expect(b.navigation).toEqual([])
  })

  it('abandons a click whose own conversation no longer holds the main view', async () => {
    const b = await bench({ listed: [LISTED], retainedBy: { sidebar: 1 } })
    b.actions().openMember({ viewingSessionId: MANAGER, memberSessionId: LISTED })
    expect(b.navigation).toEqual([])
  })

  it('re-registers after the conversation header slot is collapsed and declared again', async () => {
    const b = await bench()
    expect(b.entry()).toBeDefined()
    b.collapseHeader()
    expect(b.entry()).toBeUndefined()
    b.ctx.slots.register({
      name: 'root',
      children: { 'conversation.session.header.actions': { kind: 'list', scope: 'session' } },
    } as never, () => null)
    await Promise.resolve()
    expect(b.entry()).toBeDefined()
  })

  it('keeps the node half inert', () => {
    expect(() => { nodeApply() }).not.toThrow()
  })
})
