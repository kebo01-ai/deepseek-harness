/** Endpoint and credential resolution, and the three operations the seam offers. */

import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import {
  createLaunchEnvironmentSnapshot,
  DSH_LAUNCH_ENVIRONMENT_KEY,
} from '@deepseek-ai/dsh-launch-environment'
import CcSessionDirectory from '../src/index.ts'
import type { Config, CcSessionName, CcSessionTarget } from '../src/index.ts'

const roots: string[] = []
const contexts: Context[] = []

const target: CcSessionTarget = { nodeIp: '10.12.202.11', name: 'kebo' as CcSessionName }

afterEach(async () => {
  vi.restoreAllMocks()
  await Promise.all(contexts.splice(0).map(async ctx => ctx.fiber.dispose()))
  await Promise.all(roots.splice(0).map(async root => rm(root, { recursive: true, force: true })))
})

/** Boot the directory over an environment snapshot the launcher would have filled. */
async function directory(
  config: Config = {},
  environment: Readonly<Record<string, string>> = {},
): Promise<CcSessionDirectory> {
  const ctx = new Context()
  contexts.push(ctx)
  ctx.provide(DSH_LAUNCH_ENVIRONMENT_KEY, createLaunchEnvironmentSnapshot([
    { source: 'process', values: environment },
  ]))
  await ctx.plugin(CcSessionDirectory, config)
  return ctx.ccSessions
}

/** Stub `fetch` with one scripted answer per call, and keep the calls. */
function answering(...bodies: readonly (string | ResponseInit & { body: string })[]) {
  const calls: { url: string; init: RequestInit }[] = []
  let index = 0
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    if (!(input instanceof URL)) throw new TypeError('board requests address a URL')
    calls.push({ url: input.href, init: init ?? {} })
    const scripted = bodies[Math.min(index++, bodies.length - 1)]!
    return typeof scripted === 'string' ? new Response(scripted) : new Response(scripted.body, scripted)
  })
  return calls
}

/**
 * The JSON one recorded board write carried.
 * @param init - the recorded request options.
 * @returns the parsed request body.
 */
function sentBody(init: RequestInit): unknown {
  const { body } = init
  if (typeof body !== 'string') throw new TypeError('board writes send a JSON string body')
  return JSON.parse(body)
}

/** A directory of a single busy session, as the board reports one. */
const ONE_SESSION = JSON.stringify({
  ok: true,
  scan: 'registry',
  sessions: [{ name: 'cc-kebo', node_ip: '10.12.202.11', state: 'busy', writable: true }],
  nodes: [{ node_ip: '10.12.202.11', live: true, reason: '', liveness_source: ['ray'] }],
  scanned_nodes: ['10.12.202.11'],
  unreachable_nodes: [],
})

describe('cadence served to reading pages', () => {
  it('serves the board-aware defaults when the composition set none', async () => {
    const board = await directory()
    expect(board.cadence()).toEqual({ rosterIntervalMs: 10000, paneIntervalMs: 3000, paneLines: 16 })
  })

  it('serves the configured cadence instead', async () => {
    const board = await directory({ rosterIntervalMs: 5000, paneIntervalMs: 1000, paneLines: 40 })
    expect(board.cadence()).toEqual({ rosterIntervalMs: 5000, paneIntervalMs: 1000, paneLines: 40 })
  })
})

describe('endpoint resolution', () => {
  it('takes the endpoint from the environment and trims its trailing slashes', async () => {
    const calls = answering(ONE_SESSION)
    const board = await directory({}, {
      DSH_CC_BOARD_URL: '  http://127.0.0.1:8197//  ',
      DSH_CC_BOARD_TOKEN: 'board-token',
    })
    const view = await board.roster()
    expect(view.ok).toBe(true)
    expect(view.boardUrl).toBe('http://127.0.0.1:8197')
    expect(view.nodes).toEqual(['10.12.202.11'])
    expect(calls[0]!.url).toBe('http://127.0.0.1:8197/api/cc/roster?scan=registry')
  })

  it('keeps an endpoint mounted under a path prefix', async () => {
    const calls = answering(ONE_SESSION)
    const board = await directory(
      { boardUrl: 'http://proxy.invalid/wb/' },
      { DSH_CC_BOARD_TOKEN: 'board-token' },
    )
    const view = await board.roster()
    expect(calls[0]!.url).toBe('http://proxy.invalid/wb/api/cc/roster?scan=registry')
    expect(view.boardUrl).toBe('http://proxy.invalid/wb')
  })

  it('drops credentials, query, and fragment rather than echoing them to a page', async () => {
    const calls = answering(ONE_SESSION)
    const board = await directory(
      { boardUrl: 'http://reader:board-token@127.0.0.1:8197/?token=board-token#top' },
      { DSH_CC_BOARD_TOKEN: 'board-token' },
    )
    const view = await board.roster()
    expect(view.boardUrl).toBe('http://127.0.0.1:8197')
    expect(calls[0]!.url).toBe('http://127.0.0.1:8197/api/cc/roster?scan=registry')
  })

  it('prefers the configured endpoint over the environment', async () => {
    const calls = answering(ONE_SESSION)
    const board = await directory(
      { boardUrl: 'http://127.0.0.1:8399' },
      { DSH_CC_BOARD_URL: 'http://127.0.0.1:8197', DSH_CC_BOARD_TOKEN: 'board-token' },
    )
    await board.roster()
    expect(calls[0]!.url).toBe('http://127.0.0.1:8399/api/cc/roster?scan=registry')
  })

  it('reads the endpoint from the configured variable name', async () => {
    const calls = answering(ONE_SESSION)
    const board = await directory(
      { boardUrlEnv: 'WB_BOARD', tokenEnv: 'WB_TOKEN' },
      { WB_BOARD: 'http://127.0.0.1:8398', WB_TOKEN: 'board-token' },
    )
    await board.roster()
    expect(calls[0]!.url).toBe('http://127.0.0.1:8398/api/cc/roster?scan=registry')
  })

  it('states the unconfigured endpoint and names the variable to set', async () => {
    const board = await directory()
    const view = await board.roster()
    expect(view).toMatchObject({
      ok: false,
      error: "no board endpoint: set the plugin's boardUrl or the DSH_CC_BOARD_URL environment variable",
      sessions: [],
      boardUrl: '',
    })
    expect(view.cadence.rosterIntervalMs).toBe(10000)
  })

  it('refuses an endpoint that is not an http(s) URL', async () => {
    const board = await directory({ boardUrl: 'ws://127.0.0.1:8197' })
    await expect(board.roster()).resolves.toMatchObject({
      ok: false,
      error: "board endpoint 'ws://127.0.0.1:8197' is not an http(s) URL",
    })
  })

  it('refuses an endpoint that is not a URL at all', async () => {
    const board = await directory({ boardUrl: 'http://[8197' })
    const view = await board.roster()
    expect(view.ok).toBe(false)
    expect(view.error).toContain("board endpoint 'http://[8197' is not a URL")
  })
})

describe('credential resolution', () => {
  it('sends the environment token in the header', async () => {
    const calls = answering(ONE_SESSION)
    const board = await directory({ boardUrl: 'http://b.invalid' }, { DSH_CC_BOARD_TOKEN: ' board-token\n' })
    await board.roster()
    expect((calls[0]!.init.headers as Record<string, string>)['authorization']).toBe('Bearer board-token')
  })

  it('reads the token file on every request, because the board rotates it', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-cc-token-'))
    roots.push(root)
    const file = join(root, 'token')
    await writeFile(file, 'first-token\n')
    const calls = answering(ONE_SESSION)
    const board = await directory({ boardUrl: 'http://b.invalid', tokenFile: file })
    await board.roster()
    await writeFile(file, 'rotated-token\n')
    await board.roster()
    expect(calls.map(call => (call.init.headers as Record<string, string>)['authorization']))
      .toEqual(['Bearer first-token', 'Bearer rotated-token'])
  })

  it('prefers the configured token file over the environment, as a configured endpoint is preferred', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-cc-token-'))
    roots.push(root)
    const file = join(root, 'token')
    await writeFile(file, 'file-token\n')
    const calls = answering(ONE_SESSION)
    const board = await directory(
      { boardUrl: 'http://b.invalid', tokenFile: file },
      { DSH_CC_BOARD_TOKEN: 'environment-token' },
    )
    await board.roster()
    expect((calls[0]!.init.headers as Record<string, string>)['authorization']).toBe('Bearer file-token')
  })

  it('states an unreadable token file', async () => {
    const board = await directory({ boardUrl: 'http://b.invalid', tokenFile: join(tmpdir(), 'dsh-cc-absent-token') })
    const view = await board.roster()
    expect(view.ok).toBe(false)
    expect(view.error).toContain('board token file')
    expect(view.error).toContain('is unreadable')
  })

  it('states an empty token file instead of sending an empty bearer', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-cc-token-'))
    roots.push(root)
    const file = join(root, 'token')
    await writeFile(file, '  \n')
    const board = await directory({ boardUrl: 'http://b.invalid', tokenFile: file })
    await expect(board.roster()).resolves.toMatchObject({
      ok: false,
      error: `board token file '${file}' is empty`,
    })
  })

  it('names both ways to supply a token when neither is set', async () => {
    const board = await directory({ boardUrl: 'http://b.invalid', tokenFile: '' })
    await expect(board.roster()).resolves.toMatchObject({
      ok: false,
      error: "no board token: set the DSH_CC_BOARD_TOKEN environment variable or the plugin's tokenFile",
    })
  })
})

/** A configured directory over a board that answers `bodies` in order. */
async function reading(...bodies: readonly (string | ResponseInit & { body: string })[]) {
  const calls = answering(...bodies)
  const board = await directory(
    { boardUrl: 'http://127.0.0.1:8197' },
    { DSH_CC_BOARD_TOKEN: 'board-token' },
  )
  return { board, calls }
}

describe('listing the sessions the board reports', () => {
  it('asks for the configured sweep kind', async () => {
    const calls = answering(ONE_SESSION)
    const board = await directory(
      { boardUrl: 'http://127.0.0.1:8197', scan: 'cluster' },
      { DSH_CC_BOARD_TOKEN: 'board-token' },
    )
    const view = await board.roster()
    expect(calls[0]!.url).toBe('http://127.0.0.1:8197/api/cc/roster?scan=cluster')
    expect(view.sessions).toEqual([{
      name: 'cc-kebo',
      nodeIp: '10.12.202.11',
      state: 'busy',
      summary: '',
      cwd: '',
      role: '',
      where: '',
      writable: true,
      writeBlock: '',
      isSelf: false,
    }])
  })

  it("keeps the board's own stated reason rather than reporting an empty board", async () => {
    const { board } = await reading(JSON.stringify({ ok: false, error: 'ray head unreachable', sessions: [] }))
    await expect(board.roster()).resolves.toMatchObject({
      ok: false,
      error: 'ray head unreachable',
      sessions: [],
      boardUrl: 'http://127.0.0.1:8197',
    })
  })

  it('names the endpoint it could not read', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('connect ECONNREFUSED'))
    const board = await directory(
      { boardUrl: 'http://127.0.0.1:8197' },
      { DSH_CC_BOARD_TOKEN: 'board-token' },
    )
    await expect(board.roster()).resolves.toMatchObject({
      ok: false,
      error: 'board http://127.0.0.1:8197 did not answer: connect ECONNREFUSED',
      sessions: [],
      boardUrl: 'http://127.0.0.1:8197',
    })
  })
})

describe('reading one screen', () => {
  it('asks for the configured line count and returns the capture', async () => {
    const calls = answering(JSON.stringify({ ok: true, output: 'line one\nline two' }))
    const board = await directory(
      { boardUrl: 'http://127.0.0.1:8197', paneLines: 40 },
      { DSH_CC_BOARD_TOKEN: 'board-token' },
    )
    await expect(board.pane(target)).resolves.toEqual({
      ok: true,
      error: '',
      target,
      text: 'line one\nline two',
    })
    expect(calls[0]!.url).toBe(
      'http://127.0.0.1:8197/api/cc/read?node_ip=10.12.202.11&name=kebo&lines=40',
    )
  })

  it('states why a capture failed and returns no text', async () => {
    const { board } = await reading(JSON.stringify({ ok: false, error: 'no such session' }))
    await expect(board.pane(target)).resolves.toEqual({
      ok: false,
      error: 'no such session',
      target,
      text: '',
    })
  })

  it('states a board it could not reach', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('timed out'))
    const board = await directory({ boardUrl: 'http://127.0.0.1:8197' }, { DSH_CC_BOARD_TOKEN: 't' })
    await expect(board.pane(target)).resolves.toMatchObject({
      ok: false,
      error: 'board http://127.0.0.1:8197 did not answer: timed out',
      text: '',
    })
  })
})

describe('typing into one session', () => {
  it('delivers the code points, the submitting return, and a confirm naming the target', async () => {
    const { board, calls } = await reading(JSON.stringify({ ok: true, output: 'echoed' }))
    await expect(board.send(target, '你好', true)).resolves.toEqual({
      ok: true,
      error: '',
      refused: '',
      screen: 'echoed',
    })
    expect(calls[0]!.url).toBe('http://127.0.0.1:8197/api/cc/input')
    expect(sentBody(calls[0]!.init)).toEqual({
      node_ip: '10.12.202.11',
      name: 'kebo',
      confirm: 'input:10.12.202.11:cc-kebo',
      hex: '4f60 597d d',
      echo: true,
    })
  })

  it('delivers keystrokes without a return when the reader did not submit', async () => {
    const { board, calls } = await reading(JSON.stringify({ ok: true }))
    await expect(board.send(target, 'a', false)).resolves.toMatchObject({ ok: true, screen: '' })
    expect(sentBody(calls[0]!.init)).toMatchObject({ hex: '61' })
  })

  it('submits an empty line, which is how a reader answers a prompt', async () => {
    const { board, calls } = await reading(JSON.stringify({ ok: true }))
    await expect(board.send(target, '', true)).resolves.toMatchObject({ ok: true })
    expect(sentBody(calls[0]!.init)).toMatchObject({ hex: 'd' })
  })

  it('refuses nothing-to-send without asking the board', async () => {
    const { board, calls } = await reading(JSON.stringify({ ok: true }))
    await expect(board.send(target, '', false)).resolves.toEqual({
      ok: false,
      error: 'nothing to send',
      refused: '',
      screen: '',
    })
    expect(calls).toEqual([])
  })

  it("carries the board's refusal separately from a failure", async () => {
    const { board } = await reading({
      status: 403,
      body: JSON.stringify({ ok: false, refused: 'session is protected' }),
    })
    await expect(board.send(target, 'rm -rf /', true)).resolves.toEqual({
      ok: false,
      error: 'session is protected',
      refused: 'session is protected',
      screen: '',
    })
  })

  it('states a declined write that named no refusal', async () => {
    const { board } = await reading(JSON.stringify({ ok: false, error: 'rate limited' }))
    await expect(board.send(target, 'ls', true)).resolves.toEqual({
      ok: false,
      error: 'rate limited',
      refused: '',
      screen: '',
    })
  })

  it('states a board it could not reach', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('socket hang up'))
    const board = await directory({ boardUrl: 'http://127.0.0.1:8197' }, { DSH_CC_BOARD_TOKEN: 't' })
    await expect(board.send(target, 'ls', true)).resolves.toMatchObject({
      ok: false,
      error: 'board http://127.0.0.1:8197 did not answer: socket hang up',
      refused: '',
    })
  })
})
