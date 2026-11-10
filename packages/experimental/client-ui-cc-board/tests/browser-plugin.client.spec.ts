/** Page registration, the operations it is handed, and disposal of both. */

import { Context, Service } from '@deepseek-ai/cordis'
import { describe, expect, it, vi } from 'vitest'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { SlotRegistry } from '@deepseek-ai/dsh-client-ui-renderer/client'
import { RemoteError } from '@deepseek-ai/dsh-client-test-runtime'
import type { TypertRemoteContribution } from '@deepseek-ai/dsh-typert-protocol'
import type {
  CcPaneView, CcRosterView, CcSendResult, CcSessionName, CcSessionTarget,
} from '@deepseek-ai/dsh-experimental-cc-sessions/client'
import { CcBoardPanel } from '../src/client/CcBoardPanel.tsx'
import { CcPanelIcon } from '../src/client/CcPanelIcon.tsx'
import type { CcBoardInjected } from '../src/client/face.ts'
import { inject, mountCcBoardUi } from '../src/client/mount.ts'
import { apply as nodeApply } from '../src/index.ts'

const REMOTE: TypertRemoteContribution = {
  package: '@deepseek-ai/dsh-experimental-cc-sessions',
  descriptors: [],
}

const PANEL = 'cc-sessions'
const target: CcSessionTarget = { nodeIp: '10.12.202.11', name: 'cc-kebo' as CcSessionName }

const cadence = { rosterIntervalMs: 10000, paneIntervalMs: 3000, paneLines: 16 }

/**
 * Narrow one slot entry's recorded inject face to the operations the page needs.
 * The registry stores the producer as returning an index signature, so the
 * three operations are read back by name and checked before use.
 * @param produce - the entry's recorded inject producer.
 * @returns the page's operations.
 */
function injectedOperations(
  produce: ((...args: never[]) => Record<string, unknown>) | undefined,
): CcBoardInjected {
  if (produce === undefined) throw new Error('page entry carries no inject face')
  const { loadRoster, loadPane, send } = produce()
  if (typeof loadRoster !== 'function' || typeof loadPane !== 'function' || typeof send !== 'function') {
    throw new Error('page entry inject face is incomplete')
  }
  return { loadRoster, loadPane, send } as CcBoardInjected
}

/** A board answer carrying one session. */
function rosterView(over: Partial<CcRosterView> = {}): CcRosterView {
  return {
    ok: true,
    error: '',
    stale: false,
    scan: 'registry',
    sessions: [{
      ...target,
      state: 'busy',
      summary: '> ',
      cwd: '/data/dsh',
      role: '',
      where: '',
      writable: true,
      writeBlock: '',
      isSelf: false,
    }],
    nodes: ['10.12.202.11'],
    unreachableNodes: [],
    cadence,
    boardUrl: 'http://127.0.0.1:8197',
    ...over,
  }
}

/** The failed carrier answer the Gateway returns when the host is unreachable. */
const carrierFailure = {
  ok: false as const,
  error: new RemoteError('gateway/internal', 'host offline', {}),
}

/** Boot the browser plugin over a scripted `ctx.remote.ccSessions`. */
async function bench(options: {
  roster?: () => Promise<unknown>
  pane?: () => Promise<unknown>
  send?: () => Promise<unknown>
  registrationFailure?: boolean
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
  const record = (method: string, answer: () => Promise<unknown>) => (...args: unknown[]) => {
    calls.push({ method, args })
    return answer()
  }
  ctx.provide('remote.ccSessions', {
    roster: record('roster', options.roster ?? (() => Promise.resolve({ ok: true, value: rosterView() }))),
    pane: record('pane', options.pane
      ?? (() => Promise.resolve({ ok: true, value: { ok: true, error: '', target, text: 'screen' } satisfies CcPaneView }))),
    send: record('send', options.send
      ?? (() => Promise.resolve({ ok: true, value: { ok: true, error: '', refused: '', screen: '' } satisfies CcSendResult }))),
  })
  ctx.provide('locale', new LocaleRuntime(ctx))
  await ctx.plugin(SlotRegistry).await()
  const declared = ctx.slots.register({
    name: 'root',
    children: {
      'sidebar.panellist': { kind: 'list', scope: 'root' },
      main: { kind: 'keyed', scope: 'root' },
    },
  } as never, () => null)
  if (options.registrationFailure === true) {
    vi.spyOn(ctx.slots, 'inject').mockImplementationOnce(() => { throw new Error('slot registration failed') })
  }
  const fiber = options.registrationFailure === true
    ? ctx.plugin({ apply() {} })
    : ctx.plugin({ inject: [...inject], apply: clientCtx => mountCcBoardUi(clientCtx, REMOTE) })
  const activation: Promise<unknown> = options.registrationFailure === true
    ? mountCcBoardUi(ctx, REMOTE).catch((error: unknown) => error)
    : fiber.await()
  await (options.registrationFailure === true ? fiber.await() : activation)
  const navRow = () => ctx.slots.entries('sidebar.panellist').find(entry => entry.component === CcPanelIcon)
  const page = () => ctx.slots.entries('main').find(entry => entry.component === CcBoardPanel)
  return {
    ctx,
    fiber,
    activation,
    calls,
    remote,
    declared,
    navRow,
    page,
    operations: () => injectedOperations(page()!.inject),
  }
}

describe('ui-cc-board browser plugin', () => {
  it('seats the nav row and the page under one id, then releases both', async () => {
    const b = await bench()
    expect(inject).toEqual(['remote', 'slots', 'locale'])
    // The sidebar opens the main panel whose key matches the clicked row's id,
    // so these two strings being equal is what makes the entry navigable.
    expect(b.navRow()).toMatchObject({ options: { id: PANEL, order: 20 } })
    expect(b.page()).toMatchObject({ options: { key: PANEL }, locale: 'cc-board' })
    expect(b.remote.mount).toHaveBeenCalledOnce()
    expect(b.remote.mount).toHaveBeenCalledWith(REMOTE)

    await b.fiber.dispose()
    expect(b.navRow()).toBeUndefined()
    expect(b.page()).toBeUndefined()
    expect(b.remote.disposeMount).toHaveBeenCalledOnce()
  })

  it('labels the nav row from the dictionary it registered', async () => {
    const b = await bench()
    const label = b.navRow()!.options.label
    // A key that resolved to itself would read as `cc-board.panel` in the
    // sidebar, which is how an unregistered namespace shows up on screen.
    expect(typeof label === 'function' ? label() : label).toBe('Session board')
  })

  it('unmounts the Remote contribution when later page registration fails', async () => {
    const b = await bench({ registrationFailure: true })
    await expect(b.activation).resolves.toMatchObject({ message: 'slot registration failed' })
    expect(b.remote.mount).toHaveBeenCalledOnce()
    expect(b.remote.disposeMount).toHaveBeenCalledOnce()
  })

  it('re-registers after the seats are collapsed and declared again', async () => {
    const b = await bench()
    b.declared()
    expect(b.navRow()).toBeUndefined()
    expect(b.page()).toBeUndefined()
    b.ctx.slots.register({
      name: 'root',
      children: {
        'sidebar.panellist': { kind: 'list', scope: 'root' },
        main: { kind: 'keyed', scope: 'root' },
      },
    } as never, () => null)
    await Promise.resolve()
    expect(b.navRow()).toBeDefined()
    expect(b.page()).toBeDefined()
  })

  it('keeps the node half inert', () => {
    expect(() => { nodeApply() }).not.toThrow()
  })
})

describe('operations the page is handed', () => {
  it('hands over the board list the host read', async () => {
    const b = await bench()
    await expect(b.operations().loadRoster()).resolves.toEqual({ view: rosterView(), failure: '' })
    expect(b.calls).toEqual([{ method: 'roster', args: [] }])
  })

  it("keeps the host's stated reason beside the list it managed to read", async () => {
    const unreadable = rosterView({ ok: false, error: 'ray head unreachable' })
    const b = await bench({ roster: () => Promise.resolve({ ok: true, value: unreadable }) })
    await expect(b.operations().loadRoster()).resolves.toEqual({
      view: unreadable,
      failure: 'ray head unreachable',
    })
  })

  it('states a transport failure with its code and message, and no board token', async () => {
    const b = await bench({ roster: () => Promise.resolve(carrierFailure) })
    await expect(b.operations().loadRoster()).resolves.toEqual({
      view: undefined,
      failure: 'gateway/internal: host offline',
    })
  })

  it('passes the screen read through and addresses the session it was given', async () => {
    const b = await bench()
    await expect(b.operations().loadPane(target)).resolves.toEqual({ text: 'screen', failure: '' })
    expect(b.calls).toEqual([{ method: 'pane', args: [target] }])
  })

  it.each([
    ['the carrier failed', () => Promise.resolve(carrierFailure), 'gateway/internal: host offline'],
    ['the board could not capture it', () => Promise.resolve({
      ok: true,
      value: { ok: false, error: 'no such session', target, text: '' } satisfies CcPaneView,
    }), 'no such session'],
  ])('states why there is no screen when %s', async (_label, pane, failure) => {
    const b = await bench({ pane })
    await expect(b.operations().loadPane(target)).resolves.toEqual({ text: '', failure })
  })

  it('reports a captured blank screen as a screen, not as a failed read', async () => {
    const b = await bench({
      pane: () => Promise.resolve({
        ok: true,
        value: { ok: true, error: '', target, text: '' } satisfies CcPaneView,
      }),
    })
    await expect(b.operations().loadPane(target)).resolves.toEqual({ text: '', failure: '' })
  })

  it('submits the typed line, which is what a reader expects of Enter', async () => {
    const b = await bench()
    await expect(b.operations().send(target, '继续')).resolves.toEqual({ kind: 'sent', reason: '' })
    expect(b.calls).toEqual([{ method: 'send', args: [target, '继续', true] }])
  })

  it("separates the board's refusal from a failed write", async () => {
    const refused = await bench({
      send: () => Promise.resolve({
        ok: true,
        value: { ok: false, error: 'session is protected', refused: 'session is protected', screen: '' },
      }),
    })
    await expect(refused.operations().send(target, 'ls')).resolves.toEqual({
      kind: 'refused',
      reason: 'session is protected',
    })
    const failed = await bench({
      send: () => Promise.resolve({
        ok: true,
        value: { ok: false, error: 'rate limited', refused: '', screen: '' },
      }),
    })
    await expect(failed.operations().send(target, 'ls')).resolves.toEqual({
      kind: 'failed',
      reason: 'rate limited',
    })
  })

  it('states a write the carrier never delivered', async () => {
    const b = await bench({ send: () => Promise.resolve(carrierFailure) })
    await expect(b.operations().send(target, 'ls')).resolves.toEqual({
      kind: 'failed',
      reason: 'gateway/internal: host offline',
    })
  })
})
