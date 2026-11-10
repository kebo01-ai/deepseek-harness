/** Board addressing, keystroke encoding, and request behavior of the seam. */

import { afterEach, describe, expect, it, vi } from 'vitest'
import { boardFullName, boardGet, boardPost, hexKeys, inputConfirm } from '../src/board.ts'
import type { BoardAccess } from '../src/board.ts'
import { CcBoardError } from '../src/error.ts'
import type { CcSessionName, CcSessionTarget } from '../src/types.ts'

const access: BoardAccess = {
  baseUrl: 'http://127.0.0.1:8197',
  token: 'board-token',
  timeoutMs: 500,
}

const name = (raw: string): CcSessionName => raw as CcSessionName
const target = (raw: string): CcSessionTarget => ({ nodeIp: '10.12.202.11', name: name(raw) })

/** Stub `fetch` with one scripted answer and keep the call for assertions. */
function answering(body: string, init: ResponseInit = {}) {
  const calls: { url: string; init: RequestInit }[] = []
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, requestInit) => {
    if (!(input instanceof URL)) throw new TypeError('board requests address a URL')
    calls.push({ url: input.href, init: requestInit ?? {} })
    return new Response(body, init)
  })
  return calls
}

/** The authorization header of one recorded call. */
function authorizationOf(init: RequestInit): string {
  return (init.headers as Record<string, string>)['authorization'] ?? ''
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('board addressing', () => {
  it('applies the bridge prefix exactly once', () => {
    expect(boardFullName(name('kebo'))).toBe('cc-kebo')
    expect(boardFullName(name('cc-kebo'))).toBe('cc-kebo')
  })

  it('derives the confirm string from the target the write addresses', () => {
    expect(inputConfirm(target('kebo'))).toBe('input:10.12.202.11:cc-kebo')
    expect(inputConfirm(target('cc-kebo'))).toBe('input:10.12.202.11:cc-kebo')
  })
})

describe('keystroke encoding', () => {
  it('hexes the code points, which is the alphabet the input door validates', () => {
    // `ccops.py` validates `^[0-9a-f]{1,6}( [0-9a-f]{1,6})*$` and expands each
    // token with `chr(int(c,16)).encode('utf-8')` next to tmux, so a byte
    // encoding sent from here would type different characters.
    expect(hexKeys('你')).toBe('4f60')
    expect(hexKeys('你好')).toBe('4f60 597d')
  })

  it('keeps one token per keystroke and encodes nothing as nothing', () => {
    expect(hexKeys('\r')).toBe('d')
    expect(hexKeys('a\r')).toBe('61 d')
    expect(hexKeys('')).toBe('')
  })

  it('spends one token on a character outside the basic plane', () => {
    expect(hexKeys('🙂')).toBe('1f642')
  })
})

describe('board reads', () => {
  it('sends the query in the URL and the token in the header', async () => {
    const calls = answering('{"ok":true,"session_count":2}')
    const payload = await boardGet(access, '/api/cc/roster', { scan: 'cluster' })
    expect(payload).toEqual({ ok: true, session_count: 2 })
    expect(calls).toHaveLength(1)
    expect(calls[0]!.url).toBe('http://127.0.0.1:8197/api/cc/roster?scan=cluster')
    expect(calls[0]!.init.method).toBe('GET')
    expect(authorizationOf(calls[0]!.init)).toBe('Bearer board-token')
  })

  it('keeps the token out of the URL a log would record', async () => {
    const calls = answering('{"ok":true}')
    await boardGet(access, '/api/cc/read', { node_ip: '10.12.202.11', name: 'cc-kebo', lines: '16' })
    expect(calls[0]!.url).not.toContain('board-token')
    expect(calls[0]!.url).toContain('name=cc-kebo')
  })
})

describe('board writes', () => {
  it('posts JSON with the content type and the token header', async () => {
    const calls = answering('{"ok":true,"output":"on screen"}')
    const body = { node_ip: '10.12.202.11', confirm: 'input:10.12.202.11:cc-kebo', hex: '61 d' }
    const payload = await boardPost(access, '/api/cc/input', body)
    expect(payload).toEqual({ ok: true, output: 'on screen' })
    expect(calls[0]!.url).toBe('http://127.0.0.1:8197/api/cc/input')
    expect(calls[0]!.init.method).toBe('POST')
    expect(calls[0]!.init.body).toBe(JSON.stringify(body))
    expect(calls[0]!.init.headers).toEqual({
      'content-type': 'application/json',
      authorization: 'Bearer board-token',
    })
  })
})

describe('board failures', () => {
  it('reports an unreachable board with the transport reason', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('connect ECONNREFUSED'))
    await expect(boardGet(access, '/api/cc/roster', {})).rejects.toMatchObject({
      name: 'CcBoardError',
      code: 'CC_BOARD_UNREACHABLE',
      message: 'board http://127.0.0.1:8197 did not answer: connect ECONNREFUSED',
    })
  })

  it('states a thrown non-error in its own words', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue('aborted')
    await expect(boardGet(access, '/api/cc/roster', {})).rejects.toThrow(
      'board http://127.0.0.1:8197 did not answer: aborted',
    )
  })

  it('refuses an answer that is not JSON', async () => {
    answering('<html>gateway</html>')
    const failure = await boardGet(access, '/api/cc/roster', {}).catch((cause: unknown) => cause)
    expect(failure).toBeInstanceOf(CcBoardError)
    expect((failure as CcBoardError).code).toBe('CC_BOARD_REFUSED')
    expect((failure as CcBoardError).message).toContain(
      'board http://127.0.0.1:8197/api/cc/roster answered unreadable JSON',
    )
  })

  it.each([
    ['an array', '[]'],
    ['null', 'null'],
    ['a number', '7'],
  ])('refuses %s body where an object is documented', async (_label, body) => {
    answering(body)
    await expect(boardGet(access, '/api/cc/roster', {})).rejects.toMatchObject({
      code: 'CC_BOARD_REFUSED',
      message: 'board http://127.0.0.1:8197/api/cc/roster answered a non-object body',
    })
  })

  it('names the status of an answer that states no reason', async () => {
    answering('{"ok":false}', { status: 500 })
    await expect(boardGet(access, '/api/cc/read', {})).rejects.toMatchObject({
      code: 'CC_BOARD_REFUSED',
      message: 'board http://127.0.0.1:8197/api/cc/read answered 500',
    })
  })

  it('hands back the reason a turned-away answer stated, on any of its statuses', async () => {
    for (const [status, reason] of [
      [400, 'confirm must equal input:10.12.202.11:cc-kebo'],
      [401, '口令不对'],
      [429, '太快了'],
      [409, '另一个 run 正持有'],
    ] as const) {
      answering(JSON.stringify({ ok: false, error: reason }), { status })
      const payload = await boardPost(access, '/api/cc/input', {})
      expect(payload).toEqual({ ok: false, error: reason })
      vi.restoreAllMocks()
    }
  })

  it('hands a 403 back as data, because a refusal is the board answering', async () => {
    answering('{"ok":false,"refused":"write door closed"}', { status: 403 })
    await expect(boardPost(access, '/api/cc/input', {})).resolves.toEqual({
      ok: false,
      refused: 'write door closed',
    })
  })

  it('reads a turned-away answer as a failure however its body reads', async () => {
    answering('{"ok":true,"refused":"write door closed","output":"on screen"}', { status: 403 })
    await expect(boardPost(access, '/api/cc/input', {})).resolves.toMatchObject({ ok: false })
  })

  it('reports a timeout that fires while the body arrives as unreachable', async () => {
    const answered = new Response('', { status: 200 })
    vi.spyOn(answered, 'json').mockRejectedValue(Object.assign(
      new Error('The operation was aborted due to timeout'),
      { name: 'TimeoutError' },
    ))
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(answered)
    await expect(boardGet(access, '/api/cc/roster', {})).rejects.toMatchObject({
      code: 'CC_BOARD_UNREACHABLE',
      message: 'board http://127.0.0.1:8197 did not answer: The operation was aborted due to timeout',
    })
  })
})
