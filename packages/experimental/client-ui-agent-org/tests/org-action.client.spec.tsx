// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, waitFor } from '@testing-library/react'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import {
  RemoteError, SlotTestRuntime, usePinnedBrowserLanguages,
} from '@deepseek-ai/dsh-client-test-runtime'
import type { SessionReference } from '@deepseek-ai/dsh-api-session-controller/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { OrgId, OrgListView } from '@deepseek-ai/dsh-experimental-agent-org/client'
import { OrgAction, type OrgActionInjected } from '../src/client/OrgAction.tsx'
import { en, NS, zh } from '../src/client/locales.ts'

const MANAGER = 'org-manager' as SessionId
const WORKER = 'org-worker' as SessionId
const STRANGER = 'org-stranger' as SessionId
const HEADER = 'conversation.session.header.actions'

function listView(members: OrgListView['orgs'][number]['members']): OrgListView {
  return {
    orgs: [{
      id: 'org-1' as OrgId,
      name: '研发一组',
      createdAt: '2026-11-09T00:00:00.000Z',
      updatedAt: '2026-11-09T00:00:02.000Z',
      members,
    }],
  }
}

const ROSTER = listView([
  { sessionId: MANAGER, role: 'manager', joinedAt: '2026-11-09T00:00:00.000Z' },
  { sessionId: WORKER, role: 'worker', joinedAt: '2026-11-09T00:00:01.000Z' },
])

const runtimes: SlotTestRuntime[] = []
const references: SessionReference[] = []

afterEach(async () => {
  for (const reference of references.splice(0)) reference.release()
  for (const runtime of runtimes.splice(0)) await runtime.dispose()
})

async function mountPanel(options: {
  actions?: Partial<OrgActionInjected>
  /** Member Sessions carrying a Session-list row, with their run state. */
  rows?: readonly { readonly id: SessionId; readonly running: boolean }[]
} = {}) {
  const runtime = await SlotTestRuntime.create()
  runtimes.push(runtime)
  const locale = new LocaleRuntime(runtime.ctx)
  runtime.ctx.provide('locale', locale)
  runtime.slots.installLocale(locale)
  locale.register(NS, { zh, en })
  await runtime.declare({ [HEADER]: { kind: 'list', scope: 'session' } })
  await runtime.sessions.add({ id: MANAGER })
  for (const row of options.rows ?? []) {
    await runtime.sessions.add({ id: row.id, summary: { running: row.running } })
  }
  const injected: OrgActionInjected = {
    load: () => Promise.resolve({ ok: true as const, value: ROSTER }),
    openMember: () => {},
    ...options.actions,
  }
  await act(async () => {
    runtime.slots.register({ name: HEADER, id: 'agent-org', order: 21, locale: NS, inject: () => injected }, OrgAction)
  })
  const viewed = runtime.sessions.retain(MANAGER, { source: 'mainView' })
  references.push(viewed)
  const slot = runtime.renderSlot(HEADER, {}, { session: viewed })
  const trigger = () => slot.view.getByRole('button', { name: new RegExp(en.trigger, 'u') })
  return {
    runtime,
    slot,
    view: slot.view,
    trigger,
    openPanel: () => { fireEvent.click(trigger()) },
  }
}

describe('OrgAction', () => {
  usePinnedBrowserLanguages('en-US')

  it('lists only the organizations whose roster names the viewed session', async () => {
    const load = vi.fn(() => Promise.resolve({
      ok: true as const,
      value: {
        orgs: [
          ...ROSTER.orgs,
          { ...ROSTER.orgs[0]!, id: 'org-2' as OrgId, name: '别人的组', members: [
            { sessionId: STRANGER, role: 'manager' as const, joinedAt: '2026-11-09T00:00:00.000Z' },
          ] },
        ],
      },
    }))
    const panel = await mountPanel({ actions: { load } })
    panel.openPanel()
    expect(await panel.view.findByText('研发一组')).toBeTruthy()
    expect(panel.view.queryByText('别人的组')).toBeNull()
    expect(load).toHaveBeenCalledOnce()
  })

  it('reads a member with a Session row as running and lets it be opened', async () => {
    const openMember = vi.fn()
    const panel = await mountPanel({
      actions: { openMember },
      rows: [{ id: WORKER, running: true }],
    })
    panel.openPanel()
    const member = await panel.view.findByRole('button', { name: en.open })
    expect(panel.view.getByText(en['status.running'])).toBeTruthy()
    fireEvent.click(member)
    expect(openMember).toHaveBeenCalledWith({
      viewingSessionId: MANAGER,
      memberSessionId: WORKER,
    })
  })

  it('reads each member from its own row so one unobserved row hides no other', async () => {
    const quiet = 'org-quiet' as SessionId
    const panel = await mountPanel({
      actions: {
        load: () => Promise.resolve({
          ok: true as const,
          value: listView([
            { sessionId: MANAGER, role: 'manager', joinedAt: '2026-11-09T00:00:00.000Z' },
            { sessionId: WORKER, role: 'worker', joinedAt: '2026-11-09T00:00:01.000Z' },
            { sessionId: quiet, role: 'worker', joinedAt: '2026-11-09T00:00:02.000Z' },
          ]),
        }),
      },
      rows: [{ id: WORKER, running: true }],
    })
    panel.openPanel()
    expect(await panel.view.findByText(en['status.running'])).toBeTruthy()
    expect(panel.view.getByText(en['status.unobserved'])).toBeTruthy()
    expect(panel.view.getAllByRole('button', { name: en.open })).toHaveLength(1)
  })

  it('closes the panel by pressing its own trigger again', async () => {
    const load = vi.fn(() => Promise.resolve({ ok: true as const, value: ROSTER }))
    const panel = await mountPanel({ actions: { load } })
    panel.openPanel()
    await panel.view.findByText('研发一组')
    panel.openPanel()
    expect(panel.view.queryByText('研发一组')).toBeNull()
    expect(load).toHaveBeenCalledOnce()
  })

  it('reports an unobserved member instead of inventing inactivity', async () => {
    const panel = await mountPanel()
    panel.openPanel()
    const status = await panel.view.findByText(en['status.unobserved'])
    expect(status.getAttribute('title')).toBe(en['status.unobserved.hint'])
    expect(panel.view.queryByRole('button', { name: en.open })).toBeNull()
  })

  it('never offers the viewed session itself as a navigation target', async () => {
    const panel = await mountPanel({ rows: [{ id: WORKER, running: false }] })
    panel.openPanel()
    await panel.view.findByRole('button', { name: en.open })
    expect(panel.view.getByText(en.self)).toBeTruthy()
    expect(panel.view.getAllByRole('button', { name: en.open })).toHaveLength(1)
  })

  it('surfaces the join instant of each membership row', async () => {
    const panel = await mountPanel()
    panel.openPanel()
    await panel.view.findByText('研发一组')
    const labels = panel.view.getAllByTitle(/^Joined /u).map(node => node.getAttribute('title'))
    expect(labels).toEqual([
      'Joined 2026-11-09T00:00:00.000Z',
      'Joined 2026-11-09T00:00:01.000Z',
    ])
  })

  it('renders the registry failure as the registry reported it', async () => {
    const panel = await mountPanel({
      actions: { load: () => Promise.resolve({ ok: false, error: new RemoteError('gateway/internal', 'offline', {}) }) },
    })
    panel.openPanel()
    expect(await panel.view.findByText('offline (gateway/internal)')).toBeTruthy()
  })

  it('says the viewed session belongs to no organization rather than showing a blank panel', async () => {
    const panel = await mountPanel({
      actions: { load: () => Promise.resolve({ ok: true as const, value: { orgs: [] } }) },
    })
    panel.openPanel()
    expect(await panel.view.findByText(en.empty)).toBeTruthy()
  })

  it('announces the read in flight before the first registry answer lands', async () => {
    const answer = Promise.withResolvers<{ ok: true; value: OrgListView }>()
    const panel = await mountPanel({ actions: { load: () => answer.promise } })
    panel.openPanel()
    expect(await panel.view.findByText(en.loading)).toBeTruthy()
    await act(async () => {
      answer.resolve({ ok: true, value: ROSTER })
      await answer.promise
    })
    expect(panel.view.queryByText(en.loading)).toBeNull()
  })

  it('keeps the newest registry answer when an earlier read resolves last', async () => {
    const slow = Promise.withResolvers<{ ok: true; value: OrgListView }>()
    const late = listView([{ sessionId: MANAGER, role: 'worker', joinedAt: '2026-11-09T00:00:03.000Z' }])
    const load = vi.fn()
      .mockReturnValueOnce(slow.promise)
      .mockReturnValue(Promise.resolve({ ok: true as const, value: { ...late, orgs: [{ ...late.orgs[0]!, name: '第二次读到的组' }] } }))
    const panel = await mountPanel({ actions: { load: load as OrgActionInjected['load'] } })
    panel.openPanel()
    await panel.view.findByText(en.loading)
    fireEvent.click(panel.view.getByRole('button', { name: en.refresh }))
    expect(await panel.view.findByText('第二次读到的组')).toBeTruthy()

    await act(async () => {
      slow.resolve({ ok: true, value: ROSTER })
      await slow.promise
    })
    expect(panel.view.getByText('第二次读到的组')).toBeTruthy()
    expect(panel.view.queryByText('研发一组')).toBeNull()
  })

  it('resets the panel when the conversation switches to another session', async () => {
    const panel = await mountPanel()
    panel.openPanel()
    await panel.view.findByText('研发一组')
    await panel.runtime.sessions.add({ id: STRANGER })
    const next = panel.runtime.sessions.retain(STRANGER, { source: 'mainView' })
    references.push(next)
    await act(async () => { panel.slot.update({}, { session: next }) })
    expect(panel.view.queryByText('研发一组')).toBeNull()
  })

  it('shows a member it can neither observe nor reach with a readable short label', async () => {
    const long = 'org-worker-with-a-long-id' as SessionId
    const panel = await mountPanel({
      actions: {
        load: () => Promise.resolve({
          ok: true as const,
          value: listView([
            { sessionId: MANAGER, role: 'worker', joinedAt: '2026-11-09T00:00:00.000Z' },
            { sessionId: long, role: 'worker', joinedAt: '2026-11-09T00:00:01.000Z' },
          ]),
        }),
      },
    })
    panel.openPanel()
    expect(await panel.view.findByText('…h-a-long-id')).toBeTruthy()
    expect(panel.view.getByText(en['status.unobserved'])).toBeTruthy()
    expect(panel.view.queryByRole('button', { name: en.open })).toBeNull()
  })

  it('closes the panel through its own close control', async () => {
    const panel = await mountPanel()
    panel.openPanel()
    await panel.view.findByText('研发一组')
    fireEvent.click(panel.view.getByRole('button', { name: en.close }))
    expect(panel.view.queryByText('研发一组')).toBeNull()
  })

  it('re-reads the registry on the explicit refresh control', async () => {
    const load = vi.fn(() => Promise.resolve({ ok: true as const, value: ROSTER }))
    const panel = await mountPanel({ actions: { load } })
    panel.openPanel()
    await panel.view.findByText('研发一组')
    fireEvent.click(panel.view.getByRole('button', { name: en.refresh }))
    await waitFor(() => { expect(load).toHaveBeenCalledTimes(2) })
  })

  it('dismisses the panel on an outside pointer press', async () => {
    const panel = await mountPanel()
    panel.openPanel()
    await panel.view.findByText('研发一组')
    fireEvent.pointerDown(document.body)
    await waitFor(() => { expect(panel.view.queryByText('研发一组')).toBeNull() })
  })
})
