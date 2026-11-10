// @vitest-environment jsdom
/** The board page a reader sees: one card per session, and typing into one. */

import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, waitFor } from '@testing-library/react'
import type { Plugin } from '@deepseek-ai/cordis'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { SlotTestRuntime, usePinnedBrowserLanguages } from '@deepseek-ai/dsh-client-test-runtime'
import type { PropsRenderSlots } from '@deepseek-ai/dsh-client-ui-slots'
import type { TypertRemoteContribution } from '@deepseek-ai/dsh-typert-protocol'
import type {
  CcRosterView, CcSessionName, CcSessionRow, CcSessionTarget,
} from '@deepseek-ai/dsh-experimental-cc-sessions/client'
import { inject, mountCcBoardUi } from '../src/client/mount.ts'

usePinnedBrowserLanguages('en-US')

const REMOTE: TypertRemoteContribution = {
  package: '@deepseek-ai/dsh-experimental-cc-sessions',
  descriptors: [],
}

/** Poll fast enough that a tick lands inside one `waitFor`. */
const cadence = { rosterIntervalMs: 20, paneIntervalMs: 20, paneLines: 16 }

const CHILDREN = {
  'sidebar.panellist': { kind: 'list', scope: 'root' },
  main: { kind: 'keyed', scope: 'root' },
} as const

/** Test-owned frame role: declares the resident panel area and opens the board. */
function AppRoot({ renderSlot }: PropsRenderSlots<'main' | 'sidebar.panellist'>) {
  return (
    <>
      <div data-nav="resting">
        {renderSlot('sidebar.panellist', { size: 16, active: false }, { only: 'cc-sessions' })}
      </div>
      <div data-nav="open">
        {renderSlot('sidebar.panellist', { size: 16, active: true }, { only: 'cc-sessions' })}
      </div>
      {renderSlot('main', {}, { entryKey: 'cc-sessions' })}
    </>
  )
}

/** A promise the case releases, for reads that must still be in flight. */
function gate<T>(): { promise: Promise<T>; release: (value: T) => void } {
  let release = (_value: T): void => {}
  const promise = new Promise<T>((resolve) => { release = resolve })
  return { promise, release }
}


/** One board row, writable and busy unless the case says otherwise. */
function row(name: string, over: Partial<CcSessionRow> = {}): CcSessionRow {
  return {
    nodeIp: '10.12.202.11',
    name: name as CcSessionName,
    state: 'busy',
    summary: `${name} summary`,
    cwd: '/data/dsh',
    role: '',
    where: '',
    writable: true,
    writeBlock: '',
    isSelf: false,
    ...over,
  }
}

/** Wait out a stretch of wall clock without the fake-timer indirection. */
async function quiet(): Promise<void> {
  await act(async () => { await new Promise((resolve) => { setTimeout(resolve, 120) }) })
}

/** One list answer carrying exactly these rows. */
function listing(sessions: readonly CcSessionRow[], over: Partial<CcRosterView> = {}): CcRosterView {
  return {
    ok: true,
    error: '',
    stale: false,
    scan: 'cluster',
    sessions,
    nodes: ['10.12.202.11'],
    unreachableNodes: [],
    cadence,
    boardUrl: 'http://127.0.0.1:8197',
    ...over,
  }
}

/** Boot the real plugin into a real slot renderer over a scripted board. */
async function bench(options: {
  sessions?: readonly CcSessionRow[]
  roster?: Partial<CcRosterView>
  rosterAnswer?: () => Promise<unknown>
  pane?: (target: CcSessionTarget) => Promise<unknown>
  send?: () => Promise<unknown>
} = {}) {
  const runtime = await SlotTestRuntime.create()
  const locale = new LocaleRuntime(runtime.ctx)
  runtime.ctx.provide('locale', locale)
  runtime.slots.installLocale(locale)
  const answer: CcRosterView = {
    ...listing(options.sessions ?? [row('cc-kebo')]),
    ...options.roster,
  }
  const reads = { roster: 0, pane: 0 }
  const sent: unknown[][] = []
  const board = {
    roster: () => {
      reads.roster += 1
      return options.rosterAnswer?.() ?? Promise.resolve({ ok: true, value: answer })
    },
    pane: (target: CcSessionTarget) => {
      reads.pane += 1
      return options.pane?.(target) ?? Promise.resolve({
        ok: true,
        value: { ok: true, error: '', target, text: `${String(target.name)} screen` },
      })
    },
    send: (...args: unknown[]) => {
      sent.push(args)
      return options.send?.() ?? Promise.resolve({
        ok: true,
        value: { ok: true, error: '', refused: '', screen: '' },
      })
    },
  }
  // The page mounts a generated Remote namespace; the double cannot do that,
  // so the mount is scripted and the namespace face provided directly.
  runtime.remote.$mount = vi.fn(() => Promise.resolve(() => Promise.resolve()))
  runtime.remote.provideNamespaces({ ccSessions: board })
  await runtime.root.declare(CHILDREN, AppRoot)
  const feature: Plugin.Object = {
    inject: [...inject],
    apply: async (clientCtx: never) => { await mountCcBoardUi(clientCtx, REMOTE) },
  }
  await runtime.mount(feature)
  const view = runtime.renderRoot()
  const card = (name: string): HTMLElement => {
    const found = view.container.querySelector<HTMLElement>(`[data-cc-card="10.12.202.11/${name}"]`)
    if (found === null) throw new Error(`no card for ${name}`)
    return found
  }
  const composer = (name: string): HTMLTextAreaElement => {
    const found = card(name).querySelector<HTMLTextAreaElement>('textarea')
    if (found === null) throw new Error(`no composer for ${name}`)
    return found
  }
  return { runtime, view, reads, sent, card, composer }
}
let live: SlotTestRuntime | undefined

afterEach(async () => {
  const held = live
  live = undefined
  await held?.dispose()
})

/** Boot a bench the teardown will dispose. */
async function page(options: Parameters<typeof bench>[0] = {}) {
  const b = await bench(options)
  live = b.runtime
  return b
}

describe('the board page', () => {
  it('states where it read and seats one card per session', async () => {
    const b = await page({
      sessions: [row('cc-kebo'), row('cc-ralph', { nodeIp: '10.12.202.11', state: 'idle', role: 'lead' })],
    })
    await waitFor(() => { expect(b.card('cc-kebo')).toBeTruthy() })
    expect(b.view.getByText('http://127.0.0.1:8197')).toBeTruthy()
    expect(b.view.getByText('2 sessions')).toBeTruthy()
    expect(b.view.getByText('1 nodes')).toBeTruthy()
    expect(b.card('cc-ralph').textContent).toContain('lead')
    expect(b.card('cc-kebo').textContent).toContain('/data/dsh')
    // The board's own activity word reaches the reader unchanged beside the dot.
    expect(b.card('cc-kebo').textContent).toContain('busy')
    expect(b.card('cc-ralph').textContent).toContain('idle')
  })

  it('says no screen has been read yet, then shows the one that lands', async () => {
    const held = gate<unknown>()
    const b = await page({ pane: () => held.promise })
    await waitFor(() => { expect(b.card('cc-kebo').querySelector('pre')!.textContent).toBe('No screen read yet') })
    held.release({
      ok: true,
      value: { ok: true, error: '', target: { nodeIp: '10.12.202.11', name: 'cc-kebo' }, text: 'live screen' },
    })
    await waitFor(() => { expect(b.card('cc-kebo').querySelector('pre')!.textContent).toBe('live screen') })
  })

  it.each([
    ['the board refused the read', () => Promise.resolve({
      ok: true, value: { ok: false, error: 'session is gone', text: '' },
    }), 'This screen could not be read: session is gone'],
    ['the read never reached the host', () => Promise.resolve({
      ok: false, error: { code: 'gateway/internal', message: 'host offline' },
    }), 'This screen could not be read: gateway/internal: host offline'],
  ])('states why a screen is missing when %s', async (_label, pane, stated) => {
    const b = await page({ pane })
    await waitFor(() => { expect(b.card('cc-kebo').querySelector('pre')!.textContent).toBe(stated) })
  })

  it('keeps the screen it last read beside the reason it stopped moving', async () => {
    let reads = 0
    const b = await page({
      pane: (target) => {
        reads += 1
        return reads === 1
          ? Promise.resolve({ ok: true, value: { ok: true, error: '', target, text: 'last good screen' } })
          : Promise.resolve({ ok: true, value: { ok: false, error: 'ray head unreachable', target, text: '' } })
      },
    })
    await waitFor(() => { expect(b.card('cc-kebo').querySelector('pre')!.textContent).toBe('last good screen') })
    await waitFor(() => {
      expect(b.card('cc-kebo').textContent).toContain('This screen could not be read: ray head unreachable')
    })
    expect(b.card('cc-kebo').querySelector('pre')!.textContent).toBe('last good screen')
  })

  it('says the screen is empty rather than leaving a blank box', async () => {
    const b = await page({
      sessions: [row('cc-kebo', { summary: '' })],
      pane: target => Promise.resolve({ ok: true, value: { ok: true, error: '', target, text: '' } }),
    })
    await waitFor(() => {
      expect(b.card('cc-kebo').querySelector('pre')!.textContent).toBe('This screen is empty')
    })
  })

  it('forgets the screen of a session the board stopped reporting', async () => {
    let listed = [row('cc-kebo'), row('cc-ralph')]
    const captured = new Set<string>()
    const b = await page({
      rosterAnswer: () => Promise.resolve({ ok: true, value: listing(listed) }),
      // Each session's screen is captured once; later reads fail, so a card
      // showing text is showing text this page still remembers.
      pane: (target) => {
        const key = String(target.name)
        if (captured.has(key)) {
          return Promise.resolve({ ok: true, value: { ok: false, error: 'ray head unreachable', target, text: '' } })
        }
        captured.add(key)
        return Promise.resolve({ ok: true, value: { ok: true, error: '', target, text: `${key} screen` } })
      },
    })
    await waitFor(() => { expect(b.card('cc-ralph').querySelector('pre')!.textContent).toBe('cc-ralph screen') })
    listed = [row('cc-kebo')]
    await waitFor(() => { expect(b.view.container.querySelector('[data-cc-card="10.12.202.11/cc-ralph"]')).toBeNull() })
    listed = [row('cc-kebo'), row('cc-ralph')]
    await waitFor(() => { expect(b.card('cc-ralph')).toBeTruthy() })
    await waitFor(() => {
      expect(b.card('cc-ralph').querySelector('pre')!.textContent)
        .toBe('This screen could not be read: ray head unreachable')
    })
  })

  it('addresses the screen read at every session it is showing', async () => {
    const b = await page({ sessions: [row('cc-kebo'), row('cc-ralph')] })
    await waitFor(() => { expect(b.reads.pane).toBeGreaterThanOrEqual(2) })
  })
})

describe('typing into one session', () => {
  it('submits the line and clears the box, which is what Enter promises', async () => {
    const b = await page()
    await waitFor(() => { expect(b.card('cc-kebo')).toBeTruthy() })
    const box = b.composer('cc-kebo')
    fireEvent.change(box, { target: { value: '继续' } })
    fireEvent.keyDown(box, { key: 'Enter' })
    await waitFor(() => { expect(b.sent).toHaveLength(1) })
    expect(b.sent[0]).toEqual([
      { nodeIp: '10.12.202.11', name: 'cc-kebo', state: 'busy', summary: 'cc-kebo summary',
        cwd: '/data/dsh', role: '', where: '', writable: true, writeBlock: '', isSelf: false },
      '继续',
      true,
    ])
    await waitFor(() => { expect(b.composer('cc-kebo').value).toBe('') })
    // The reader is told the board took it; the next keystroke replaces that
    // with the sending hint, so one card never claims two things at once.
    expect(b.card('cc-kebo').textContent).toContain('Delivered')
    fireEvent.change(b.composer('cc-kebo'), { target: { value: 'l' } })
    expect(b.card('cc-kebo').textContent).not.toContain('Delivered')
  })

  it('names the session each box types into, so two boxes are never the same box', async () => {
    const b = await page({ sessions: [row('cc-kebo'), row('cc-ralph')] })
    await waitFor(() => { expect(b.card('cc-ralph')).toBeTruthy() })
    expect(b.composer('cc-kebo').getAttribute('aria-label')).toBe('Type into cc-kebo')
    expect(b.composer('cc-ralph').getAttribute('aria-label')).toBe('Type into cc-ralph')
  })

  it('states a delivery that threw on the card it was typed into', async () => {
    const b = await page({ send: () => Promise.reject(new Error('socket closed')) })
    await waitFor(() => { expect(b.card('cc-kebo')).toBeTruthy() })
    fireEvent.change(b.composer('cc-kebo'), { target: { value: 'ls' } })
    fireEvent.keyDown(b.composer('cc-kebo'), { key: 'Enter' })
    await waitFor(() => { expect(b.card('cc-kebo').textContent).toContain('Failed: socket closed') })
    // The box is usable again: a thrown delivery must not shut the card.
    expect(b.card('cc-kebo').querySelector('button')!.disabled).toBe(false)
    expect(b.composer('cc-kebo').value).toBe('ls')
  })

  it.each([
    ['Shift+Enter opens a line', { key: 'Enter', shiftKey: true }],
    ['an IME composition commit is not a submit', { key: 'Enter', isComposing: true }],
  ])('holds the line when %s', async (_label, event) => {
    const b = await page()
    await waitFor(() => { expect(b.card('cc-kebo')).toBeTruthy() })
    const box = b.composer('cc-kebo')
    fireEvent.change(box, { target: { value: 'ls' } })
    fireEvent.keyDown(box, event)
    await quiet()
    expect(b.sent).toEqual([])
    expect(b.composer('cc-kebo').value).toBe('ls')
  })

  it('sends the draft of the card the button belongs to', async () => {
    const b = await page({ sessions: [row('cc-kebo'), row('cc-ralph')] })
    await waitFor(() => { expect(b.card('cc-ralph')).toBeTruthy() })
    fireEvent.change(b.composer('cc-ralph'), { target: { value: 'ls' } })
    const button = b.card('cc-ralph').querySelector('button')!
    expect(button.disabled).toBe(false)
    fireEvent.click(button)
    await waitFor(() => { expect(b.sent).toHaveLength(1) })
    expect(b.sent[0]![0]).toMatchObject({ name: 'cc-ralph' })
  })

  it('refuses to send nothing', async () => {
    const b = await page()
    await waitFor(() => { expect(b.card('cc-kebo')).toBeTruthy() })
    expect(b.card('cc-kebo').querySelector('button')!.disabled).toBe(true)
    fireEvent.keyDown(b.composer('cc-kebo'), { key: 'Enter' })
    await quiet()
    expect(b.sent).toEqual([])
  })

  it.each([
    ['refusal', { ok: false, error: 'session is protected', refused: 'session is protected', screen: '' },
      'The board refused this write: session is protected'],
    ['failed write', { ok: false, error: 'rate limited', refused: '', screen: '' },
      'Failed: rate limited'],
  ])('keeps the %s on the card it happened to', async (_label, value, stated) => {
    const b = await page({ send: () => Promise.resolve({ ok: true, value }) })
    await waitFor(() => { expect(b.card('cc-kebo')).toBeTruthy() })
    fireEvent.change(b.composer('cc-kebo'), { target: { value: 'ls' } })
    fireEvent.keyDown(b.composer('cc-kebo'), { key: 'Enter' })
    await waitFor(() => { expect(b.card('cc-kebo').textContent).toContain(stated) })
    // A line the board never took stays in the box for the reader to retry.
    expect(b.composer('cc-kebo').value).toBe('ls')
  })

  it.each([
    ['the board declined to write to it', row('cc-guard', { writable: false, writeBlock: 'session is protected' }),
      'session is protected'],
    ['it is the board process itself', row('cc-self', { isSelf: true }), 'this board process'],
  ])('shuts the composer when %s', async (_label, blocked, stated) => {
    const b = await page({ sessions: [blocked] })
    const name = String(blocked.name)
    await waitFor(() => { expect(b.card(name)).toBeTruthy() })
    expect(b.composer(name).disabled).toBe(true)
    expect(b.card(name).querySelector('button')!.disabled).toBe(true)
    expect(b.card(name).textContent).toContain(stated)
  })
})

describe('what the page says when the board cannot be read', () => {
  it('reads the board before the first answer lands', async () => {
    const b = await page({ rosterAnswer: () => new Promise(() => {}) })
    expect(b.view.getByText('Reading the board…')).toBeTruthy()
  })

  it('states a transport failure with the reason the host gave', async () => {
    const b = await page({
      rosterAnswer: () => Promise.resolve({ ok: false, error: { code: 'gateway/internal', message: 'host offline' } }),
    })
    await waitFor(() => {
      expect(b.view.getByText('Failed: gateway/internal: host offline')).toBeTruthy()
    })
    expect(b.view.queryByText('Reading the board…')).toBeNull()
  })

  it("keeps the board's own reason beside the list it managed to read", async () => {
    const b = await page({ roster: { ok: false, error: 'ray head unreachable' } })
    await waitFor(() => { expect(b.view.getByText('Failed: ray head unreachable')).toBeTruthy() })
    expect(b.card('cc-kebo')).toBeTruthy()
  })

  it('says a remembered answer is remembered, and how old it is', async () => {
    const b = await page({ roster: { stale: true, staleAgeS: 42.4 } })
    await waitFor(() => {
      expect(b.view.getByText(/The board served a remembered answer/)).toBeTruthy()
    })
    expect(b.view.getByText(/42s old/)).toBeTruthy()
  })

  it('names the nodes the sweep could not reach', async () => {
    const b = await page({ roster: { unreachableNodes: ['10.12.202.12'] } })
    await waitFor(() => { expect(b.view.getByText('10.12.202.12')).toBeTruthy() })
  })

  it('says the board has no sessions, which is not the same as not having read it', async () => {
    const b = await page({ sessions: [] })
    await waitFor(() => { expect(b.view.getByText('The board reports no sessions')).toBeTruthy() })
    expect(b.reads.pane).toBe(0)
  })

  it('does not call an unreadable board empty', async () => {
    const b = await page({ sessions: [], roster: { ok: false, error: 'ray head unreachable' } })
    await waitFor(() => { expect(b.view.getByText('Failed: ray head unreachable')).toBeTruthy() })
    expect(b.view.queryByText('The board reports no sessions')).toBeNull()
  })

  it('names the sweep the host asked the board for', async () => {
    const b = await page({ roster: { scan: 'registry' } })
    await waitFor(() => { expect(b.view.getByText('sweep: registry')).toBeTruthy() })
  })
})

describe('the poll driver the page owns', () => {
  it('keeps reading while the page is open', async () => {
    const b = await page()
    await waitFor(() => { expect(b.reads.roster).toBeGreaterThanOrEqual(3) })
  })

  it('stops on demand and reads once more when asked by hand', async () => {
    const b = await page()
    await waitFor(() => { expect(b.reads.roster).toBeGreaterThanOrEqual(2) })
    fireEvent.click(b.view.getByText('Pause polling'))
    await waitFor(() => { expect(b.view.getByText('Paused')).toBeTruthy() })
    const stopped = { ...b.reads }
    await quiet()
    expect(b.reads).toEqual(stopped)

    fireEvent.click(b.view.getByText('Refresh'))
    await waitFor(() => { expect(b.reads.roster).toBe(stopped.roster + 1) })
    fireEvent.click(b.view.getByText('Resume polling'))
    await waitFor(() => { expect(b.reads.roster).toBeGreaterThan(stopped.roster + 1) })
  })

  it('stops while the tab is hidden: the board is shared and nobody is watching', async () => {
    const b = await page()
    await waitFor(() => { expect(b.reads.roster).toBeGreaterThanOrEqual(2) })
    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
    try {
      fireEvent(document, new Event('visibilitychange'))
      await quiet()
      const stopped = { ...b.reads }
      await quiet()
      expect(b.reads).toEqual(stopped)
      visibility.mockReturnValue('visible')
      fireEvent(document, new Event('visibilitychange'))
      await waitFor(() => { expect(b.reads.roster).toBeGreaterThan(stopped.roster) })
    } finally {
      visibility.mockRestore()
    }
  })

  it('stops when the page goes away, which is what leaving the page must do', async () => {
    const b = await bench()
    await waitFor(() => { expect(b.reads.roster).toBeGreaterThanOrEqual(2) })
    await b.runtime.dispose()
    await quiet()
    const stopped = { ...b.reads }
    await quiet()
    expect(b.reads).toEqual(stopped)
  })

  it('lets a slow board delay the next list read instead of stacking reads', async () => {
    const held = gate<unknown>()
    const b = await page({ rosterAnswer: () => held.promise })
    await waitFor(() => { expect(b.reads.roster).toBe(1) })
    fireEvent.click(b.view.getByText('Refresh'))
    await quiet()
    expect(b.reads.roster).toBe(1)
    held.release({ ok: false, error: { code: 'gateway/internal', message: 'released' } })
  })

  it('lets a slow board delay the next screen batch', async () => {
    const held = gate<unknown>()
    const b = await page({ pane: () => held.promise })
    await waitFor(() => { expect(b.reads.pane).toBe(1) })
    await quiet()
    expect(b.reads.pane).toBe(1)
    held.release({ ok: false, error: { code: 'gateway/internal', message: 'released' } })
  })

  it('keeps reading after a list read rejected, instead of latching shut', async () => {
    let reads = 0
    const b = await page({
      rosterAnswer: () => {
        reads += 1
        return reads === 2
          ? Promise.reject(new Error('socket closed'))
          : Promise.resolve({ ok: true, value: listing([row('cc-kebo')]) })
      },
    })
    await waitFor(() => { expect(b.reads.roster).toBeGreaterThanOrEqual(4) })
    expect(b.card('cc-kebo')).toBeTruthy()
  })

  it('keeps reading after a screen read rejected, instead of latching shut', async () => {
    let first = true
    const b = await page({
      pane: (target) => {
        if (!first) {
          return Promise.resolve({ ok: true, value: { ok: true, error: '', target, text: 'after' } })
        }
        first = false
        return Promise.reject(new Error('socket closed'))
      },
    })
    await waitFor(() => { expect(b.reads.pane).toBeGreaterThanOrEqual(3) })
    await waitFor(() => { expect(b.card('cc-kebo').querySelector('pre')!.textContent).toBe('after') })
  })

  it('retries after a failure that left it no cadence to follow', async () => {
    // The host serves its cadence in every answer it gives, including one
    // reporting a board it could not read, so a page without one never reached
    // the host and keeps retrying on its own recovery interval.
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      const b = await page({
        rosterAnswer: () => Promise.resolve({
          ok: false,
          error: { code: 'gateway/internal', message: 'host offline' },
        }),
      })
      await waitFor(() => { expect(b.reads.roster).toBe(1) })
      await act(async () => { await vi.advanceTimersByTimeAsync(11_000) })
      expect(b.reads.roster).toBeGreaterThanOrEqual(3)
    } finally {
      vi.useRealTimers()
    }
  })

  it.each([
    ['a list read', (held: Promise<unknown>) => ({ rosterAnswer: () => held })],
    ['a screen read', (held: Promise<unknown>) => ({ pane: () => held })],
  ])('publishes nothing from %s that lands after the page is gone', async (_label, scripted) => {
    const held = gate<unknown>()
    const b = await bench(scripted(held.promise))
    await waitFor(() => { expect(b.reads.roster).toBeGreaterThanOrEqual(1) })
    const errors: unknown[] = []
    const onError = (event: ErrorEvent): void => { errors.push(event.error) }
    window.addEventListener('error', onError)
    await b.runtime.dispose()
    held.release({ ok: false, error: { code: 'gateway/internal', message: 'too late' } })
    await quiet()
    window.removeEventListener('error', onError)
    expect(errors).toEqual([])
    expect(b.view.container.querySelector('[data-cc-board]')).toBeNull()
  })
})

describe('the status a reader reads at a glance', () => {
  it.each([
    ['busy', 'ongoing'],
    ['idle', 'idle'],
    // A word this package has never seen must not be painted as a healthy one.
    ['wedged', 'warning'],
  ])('paints the board word %s as %s', async (state, dot) => {
    const b = await page({ sessions: [row('cc-kebo', { state })] })
    await waitFor(() => { expect(b.card('cc-kebo')).toBeTruthy() })
    expect(b.card('cc-kebo').querySelector(`[data-state="${dot}"]`)).not.toBeNull()
    expect(b.card('cc-kebo').textContent).toContain(state)
  })

  it('shows where the board reaches a session, falling back to its node', async () => {
    const b = await page({
      sessions: [row('cc-kebo'), row('cc-ralph', { where: 'rank1 via 10.12.202.12' })],
    })
    await waitFor(() => { expect(b.card('cc-ralph')).toBeTruthy() })
    expect(b.card('cc-ralph').textContent).toContain('rank1 via 10.12.202.12')
    expect(b.card('cc-kebo').textContent).toContain('10.12.202.11')
  })

  it('carries a role the board reported for a session it gave no directory for', async () => {
    const b = await page({ sessions: [row('cc-kebo', { cwd: '', role: 'lead' })] })
    await waitFor(() => { expect(b.card('cc-kebo')).toBeTruthy() })
    expect(b.card('cc-kebo').textContent).toContain('Role: lead')
    expect(b.card('cc-kebo').textContent).not.toContain('/data/dsh')
  })

  it('fills the reading pane of its sidebar glyph only while the board is open', async () => {
    const b = await page()
    const glyph = (nav: string): SVGRectElement => {
      const rects = b.view.container.querySelectorAll<SVGRectElement>(`[data-nav="${nav}"] svg rect`)
      expect(rects).toHaveLength(4)
      return rects[3]!
    }
    expect(glyph('open').getAttribute('fill')).toBe('currentColor')
    expect(glyph('resting').getAttribute('fill')).toBe('none')
  })
})
