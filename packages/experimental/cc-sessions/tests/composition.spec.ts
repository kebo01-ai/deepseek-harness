/** The seam through a real Loader composition against a real board over HTTP. */

import { createServer } from 'node:http'
import type { Server } from 'node:http'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { Context, FiberState } from '@deepseek-ai/cordis'
import Include from '@deepseek-ai/cordis-plugin-include'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import * as CcSessions from '../src/index.ts'
import type { CcSessionName, CcSessionTarget } from '../src/index.ts'

const PLUGIN = '@deepseek-ai/dsh-experimental-cc-sessions'
const TOKEN = 'composition-board-token'

const servers: Server[] = []
const roots: string[] = []
const contexts: Context[] = []

/** One request the stub board received, as the board itself would log it. */
interface BoardCall {
  method: string
  path: string
  authorization: string
  body: string
}

afterEach(async () => {
  await Promise.all(contexts.splice(0).map(async ctx => ctx.fiber.dispose()))
  await Promise.all(servers.splice(0).map(async server => new Promise<void>((resolve) => {
    server.close(() => { resolve() })
  })))
  await Promise.all(roots.splice(0).map(async root => rm(root, { recursive: true, force: true })))
})

/**
 * A board that answers the three doors this seam uses, refuses a protected
 * session with its own 403, and demands the bearer token on every door.
 */
async function board(): Promise<{ origin: string; calls: BoardCall[] }> {
  const calls: BoardCall[] = []
  const server = createServer((request, response) => {
    const chunks: Buffer[] = []
    request.on('data', (chunk: Buffer) => chunks.push(chunk))
    request.on('end', () => {
      const url = new URL(request.url ?? '/', 'http://board.invalid')
      const authorization = request.headers.authorization ?? ''
      calls.push({
        method: request.method ?? '',
        path: url.pathname + url.search,
        authorization,
        body: Buffer.concat(chunks).toString('utf8'),
      })
      const answer = (status: number, payload: unknown): void => {
        response.writeHead(status, { 'content-type': 'application/json' })
        response.end(JSON.stringify(payload))
      }
      if (authorization !== `Bearer ${TOKEN}`) {
        answer(401, { ok: false, error: 'bad token' })
        return
      }
      if (url.pathname === '/api/cc/roster') {
        answer(200, {
          ok: true,
          scan: url.searchParams.get('scan'),
          stale: false,
          sessions: [
            { name: 'cc-kebo', node_ip: '10.12.202.11', state: 'busy', summary: '> ', writable: true },
            {
              name: 'cc-guard',
              node_ip: '10.12.202.12',
              state: 'idle',
              writable: false,
              write_block: 'protected',
            },
          ],
          nodes: [
            { node_ip: '10.12.202.11', live: true, reason: '', liveness_source: ['ray'] },
            { node_ip: '10.12.202.12', live: true, reason: '', liveness_source: ['ray'] },
          ],
          scanned_nodes: ['10.12.202.11', '10.12.202.12'],
          unreachable_nodes: [],
        })
        return
      }
      if (url.pathname === '/api/cc/read') {
        answer(200, { ok: true, output: `${url.searchParams.get('name')} screen\nsecond line` })
        return
      }
      if (url.pathname === '/api/cc/input') {
        const sent = JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, string>
        if (sent['name'] === 'guard') {
          answer(403, { ok: false, refused: 'session is protected' })
          return
        }
        if (sent['confirm'] !== `input:${sent['node_ip']}:cc-${sent['name']}`) {
          answer(400, { ok: false, error: 'confirm does not name the target' })
          return
        }
        // The real door validates this alphabet (`HEX_RE` in `ccops.py`) and
        // then expands each token into UTF-8 beside tmux, so the stub refuses
        // anything else rather than quietly accepting a byte encoding.
        const hex = sent['hex'] ?? ''
        if (!/^([0-9a-f]{1,6}( [0-9a-f]{1,6})*)?$/.test(hex)) {
          answer(400, { ok: false, error: 'hex must be space-separated code points' })
          return
        }
        const typed = hex === ''
          ? ''
          : hex.split(' ').map(token => String.fromCodePoint(Number.parseInt(token, 16))).join('')
        answer(200, { ok: true, output: `echo ${typed}` })
        return
      }
      answer(404, { ok: false, error: 'no such door' })
    })
  })
  servers.push(server)
  await new Promise<void>((resolve) => { server.listen(0, '127.0.0.1', resolve) })
  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('stub board did not bind a port')
  return { origin: `http://127.0.0.1:${address.port}`, calls }
}

/** Boot a composition whose only entry is this plugin, as a profile overlay inserts it. */
async function compose(origin: string): Promise<Context> {
  const root = await mkdtemp(join(tmpdir(), 'dsh-cc-composition-'))
  roots.push(root)
  const tokenFile = join(root, 'board.token')
  await writeFile(tokenFile, `${TOKEN}\n`)
  const configPath = join(root, 'cordis.yml')
  await writeFile(configPath, [
    '- id: cc-sessions',
    `  name: '${PLUGIN}'`,
    '  config:',
    `    boardUrl: '${origin}'`,
    `    tokenFile: '${tokenFile}'`,
    "    scan: 'cluster'",
    '    paneLines: 24',
    '    requestTimeoutMs: 5000',
    '',
  ].join('\n'))

  const ctx = new Context()
  contexts.push(ctx)
  ctx.baseUrl = pathToFileURL(root).href + '/'
  await ctx.plugin(Loader)
  ctx.loader.builtins.include = Include
  ctx.loader.internal = {
    version: 'v2',
    async import(specifier: string) {
      if (specifier !== PLUGIN) throw new Error(`unexpected Loader import: ${specifier}`)
      return CcSessions
    },
  } as never
  await ctx.loader.create({ name: 'cordis:include', config: { path: pathToFileURL(configPath).href } })
  await ctx.loader.await()
  return ctx
}

const kebo: CcSessionTarget = { nodeIp: '10.12.202.11', name: 'kebo' as CcSessionName }
const guard: CcSessionTarget = { nodeIp: '10.12.202.12', name: 'guard' as CcSessionName }

describe('cc-session directory through a real Loader composition', () => {
  it('lists, reads, and types over the board doors a cordis.yml entry configured', async () => {
    const { origin, calls } = await board()
    const ctx = await compose(origin)
    expect([...ctx.loader.entries()].every(entry => entry.fiber?.state === FiberState.ACTIVE)).toBe(true)

    const view = await ctx.ccSessions.roster()
    expect(view).toMatchObject({
      ok: true,
      error: '',
      scan: 'cluster',
      boardUrl: origin,
      nodes: ['10.12.202.11', '10.12.202.12'],
      cadence: { rosterIntervalMs: 10000, paneIntervalMs: 3000, paneLines: 24 },
    })
    expect(view.sessions.map(session => [session.name, session.state, session.writable, session.writeBlock]))
      .toEqual([['cc-kebo', 'busy', true, ''], ['cc-guard', 'idle', false, 'protected']])

    await expect(ctx.ccSessions.pane(kebo)).resolves.toEqual({
      ok: true,
      error: '',
      target: kebo,
      text: 'kebo screen\nsecond line',
    })

    await expect(ctx.ccSessions.send(kebo, '继续', true)).resolves.toEqual({
      ok: true,
      error: '',
      refused: '',
      screen: 'echo 继续\r',
    })

    // The board demanded the bearer on every door and the configured line
    // count reached the read; the write arrived in the code-point alphabet the
    // input door validates, which is what let the stub echo it back as text.
    expect(calls.map(call => `${call.method} ${call.path}`)).toEqual([
      'GET /api/cc/roster?scan=cluster',
      'GET /api/cc/read?node_ip=10.12.202.11&name=kebo&lines=24',
      'POST /api/cc/input',
    ])
    expect(new Set(calls.map(call => call.authorization))).toEqual(new Set([`Bearer ${TOKEN}`]))
    expect(JSON.parse(calls[2]!.body)).toMatchObject({ hex: '7ee7 7eed d', echo: true })
  })

  it("projects the board's own refusal instead of raising it", async () => {
    const { origin } = await board()
    const ctx = await compose(origin)
    await expect(ctx.ccSessions.send(guard, 'ls', true)).resolves.toEqual({
      ok: false,
      error: 'session is protected',
      refused: 'session is protected',
      screen: '',
    })
  })

  it('releases the service when its Loader entry is disposed', async () => {
    const { origin } = await board()
    const ctx = await compose(origin)
    expect(ctx.get('ccSessions')).toBeDefined()
    const entry = [...ctx.loader.entries()].find(item => item.options.id === 'cc-sessions')
    await entry?.fiber?.dispose()
    expect(ctx.get('ccSessions')).toBeUndefined()
  })
})
