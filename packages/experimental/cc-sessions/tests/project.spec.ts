/**
 * Projection of board answers, which arrive from another process. Every
 * payload here is shaped as `/data/dsh/ccops.py` really answers: the session
 * row keys it stamps in `cc_roster`, the object-per-node table under `nodes`
 * beside the swept addresses under `scanned_nodes`, and the capture under
 * `output`.
 */

import { describe, expect, it } from 'vitest'
import { projectReason, projectRoster, projectScreen } from '../src/project.ts'
import type { CcCadence } from '../src/types.ts'

const cadence: CcCadence = { rosterIntervalMs: 10000, paneIntervalMs: 3000, paneLines: 16 }

const row = {
  name: 'cc-kebo',
  node_ip: '10.12.202.11',
  state: 'busy',
  summary: 'last lines',
  cwd: '/data/dsh',
  role: 'worker',
  where: 'tmux',
  writable: true,
  write_block: '',
  is_self: false,
}

/** One entry of the board's node table, which carries liveness, not an address. */
const node = { node_ip: '10.12.202.11', live: true, reason: '', liveness_source: ['ray'] }

describe('session list projection', () => {
  it('carries every reported field through, in board order', () => {
    const view = projectRoster({
      ok: true,
      scan: 'cluster',
      stale: true,
      stale_age_s: 4.5,
      error: '',
      sessions: [row, { ...row, name: 'cc-kebo2', state: 'idle', writable: false, write_block: 'protected' }],
      nodes: [node, { ...node, node_ip: '10.12.202.12', live: false, reason: 'not in the node table' }],
      scanned_nodes: ['10.12.202.11', '10.12.202.12'],
      unreachable_nodes: ['10.12.202.12'],
    }, cadence, 'http://127.0.0.1:8197')
    expect(view).toEqual({
      ok: true,
      error: '',
      stale: true,
      staleAgeS: 4.5,
      scan: 'cluster',
      sessions: [
        {
          name: 'cc-kebo',
          nodeIp: '10.12.202.11',
          state: 'busy',
          summary: 'last lines',
          cwd: '/data/dsh',
          role: 'worker',
          where: 'tmux',
          writable: true,
          writeBlock: '',
          isSelf: false,
        },
        {
          name: 'cc-kebo2',
          nodeIp: '10.12.202.11',
          state: 'idle',
          summary: 'last lines',
          cwd: '/data/dsh',
          role: 'worker',
          where: 'tmux',
          writable: false,
          writeBlock: 'protected',
          isSelf: false,
        },
      ],
      nodes: ['10.12.202.11', '10.12.202.12'],
      unreachableNodes: ['10.12.202.12'],
      cadence,
      boardUrl: 'http://127.0.0.1:8197',
    })
  })

  it('reads the addresses the board swept, not the node table beside them', () => {
    const view = projectRoster({
      ok: true,
      nodes: [node, { ...node, node_ip: '10.12.202.13' }],
      scanned_nodes: ['10.12.202.12'],
    }, cadence, '')
    expect(view.nodes).toEqual(['10.12.202.12'])
  })

  it('states the reason behind a refused list read', () => {
    const view = projectRoster({ ok: false, refused: '口令不对' }, cadence, 'http://b')
    expect(view.ok).toBe(false)
    expect(view.error).toBe('口令不对')
  })

  it('omits the stale age the board did not report', () => {
    const view = projectRoster({ ok: true, stale: true }, cadence, 'http://b')
    expect('staleAgeS' in view).toBe(false)
    expect(view.stale).toBe(true)
  })

  it('reads an unreported field as unreported, not as a guess', () => {
    const view = projectRoster({
      sessions: [{ name: 'cc-kebo', state: 7, writable: 'yes', is_self: 1 }],
      scanned_nodes: 'not-a-list',
      stale_age_s: 'soon',
    }, cadence, '')
    expect(view.ok).toBe(false)
    expect(view.sessions[0]).toMatchObject({
      nodeIp: '',
      state: '',
      summary: '',
      writable: false,
      isSelf: false,
    })
    expect(view.nodes).toEqual([])
    expect('staleAgeS' in view).toBe(false)
  })

  it('drops a row that addresses nothing and keeps the rest', () => {
    const view = projectRoster({
      sessions: [row, { node_ip: '10.12.202.11' }, { name: '' }, null, 'cc-kebo3', [row]],
    }, cadence, '')
    expect(view.sessions.map(session => session.name)).toEqual(['cc-kebo'])
  })

  it('reports no sessions when the board sent no list', () => {
    expect(projectRoster({ ok: true, sessions: 'none' }, cadence, '').sessions).toEqual([])
    expect(projectRoster({}, cadence, '').sessions).toEqual([])
  })

  it('keeps only the addresses out of a mixed swept list', () => {
    const view = projectRoster({ scanned_nodes: ['10.12.202.11', 42, null] }, cadence, '')
    expect(view.nodes).toEqual(['10.12.202.11'])
  })
})

describe('screen projection', () => {
  it('takes the capture the board put under output', () => {
    expect(projectScreen({ ok: true, output: 'on screen', ansi: false })).toBe('on screen')
  })

  it('reads no capture out of a key the board never captures into', () => {
    expect(projectScreen({ text: 'on screen', screen: 'on screen', lines: ['on screen'] })).toBe('')
  })

  it('reports a capture that is not text as no text', () => {
    expect(projectScreen({ output: 42 })).toBe('')
  })

  it('reports no capture as no text', () => {
    expect(projectScreen({ ok: true })).toBe('')
  })
})

describe('stated reason projection', () => {
  it('prefers the refusal the board named', () => {
    expect(projectReason({ refused: 'write door closed', error: 'denied' })).toBe('write door closed')
  })

  it('falls back to the error when no refusal was stated', () => {
    expect(projectReason({ refused: '', error: 'no such session' })).toBe('no such session')
    expect(projectReason({ refused: 7, error: 'no such session' })).toBe('no such session')
  })

  it('states nothing when the board stated nothing', () => {
    expect(projectReason({ ok: false })).toBe('')
  })
})
