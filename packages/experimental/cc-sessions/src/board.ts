/**
 * HTTP client for one workbench board. Three operations, no lifecycle verbs:
 * this seam can list sessions, read a screen, and forward keystrokes, and it
 * deliberately cannot start or stop anything the board owns.
 * @module @deepseek-ai/dsh-experimental-cc-sessions/board
 */

import { CcBoardError, reasonOf } from './error.ts'
import { projectReason } from './project.ts'
import type { CcSessionName, CcSessionTarget } from './types.ts'

/**
 * Session-name prefix the board's bridge applies. Part of the board's
 * addressing rule, which a write has to restate exactly, so it is fixed here
 * rather than configurable.
 */
const BOARD_NAME_PREFIX = 'cc-'

/** Board write verb this seam uses; the board rejects any confirm naming another. */
const INPUT_VERB = 'input'

/** How a board operation resolves its credentials and endpoint for one request. */
export interface BoardAccess {
  /**
   * Board origin plus any path prefix it is mounted under, already normalized
   * by the caller: no trailing slash, no query, no fragment, no credentials.
   * Operations append a door path to it directly.
   */
  baseUrl: string
  /** Bearer token for this request. */
  token: string
  /** Request timeout in milliseconds. */
  timeoutMs: number
}

/**
 * The name the board will address, with its bridge prefix applied.
 * @param name - name as a reader typed or the board reported it.
 * @returns the prefixed name a confirm string must carry.
 */
export function boardFullName(name: CcSessionName): string {
  const raw = String(name)
  return raw.startsWith(BOARD_NAME_PREFIX) ? raw : BOARD_NAME_PREFIX + raw
}

/**
 * The confirm value the board requires of a write: a write has to name its
 * own target, so the string is derived from the target rather than passed in.
 * @param target - session the write addresses.
 * @returns the exact confirm string for an input write.
 */
export function inputConfirm(target: CcSessionTarget): string {
  return `${INPUT_VERB}:${target.nodeIp}:${boardFullName(target.name)}`
}

/**
 * Keystrokes as the board's input door takes them: space-separated lowercase
 * hex of the Unicode code points, one token per keystroke. The door validates
 * against that alphabet and rejects anything else, and it is the board that
 * expands a code point into the UTF-8 bytes its terminal layer needs, so a
 * byte encoding sent from here either fails validation or decodes as a
 * different character.
 * @param text - text to deliver.
 * @returns space-separated lowercase hex code points, empty for empty text.
 */
export function hexKeys(text: string): string {
  // `Array.from` iterates the string, so each element is one code point and a
  // surrogate pair stays one keystroke.
  return Array.from(text, character => (character.codePointAt(0) as number).toString(16))
    .join(' ')
}

/**
 * One board request before the authorization header is stamped on it. Headers
 * are a plain record so the stamp is one object spread, which `HeadersInit`'s
 * array form would turn into indices.
 */
interface BoardRequest {
  /** Both board doors this package uses. */
  method: 'GET' | 'POST'
  /** Request headers other than authorization. */
  headers?: Readonly<Record<string, string>>
  /** Serialized JSON body, present on writes. */
  body?: string
}

/**
 * One board GET. Reads carry the token in the `Authorization` header like
 * writes do: the board also accepts `?token=`, and declining to use it keeps
 * the token out of every log that records a URL.
 * @param access - endpoint and credentials.
 * @param path - board path beginning with a slash.
 * @param query - query parameters.
 * @returns the parsed JSON object.
 * @throws CcBoardError when the board is unreachable or answers unusably.
 */
export async function boardGet(
  access: BoardAccess,
  path: string,
  query: Readonly<Record<string, string>>,
): Promise<Record<string, unknown>> {
  const url = new URL(access.baseUrl + path)
  for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value)
  return await boardFetch(access, url, { method: 'GET' })
}

/**
 * One board POST. The board accepts a write token only in the header, so this
 * is the only shape a write can take.
 * @param access - endpoint and credentials.
 * @param path - board path beginning with a slash.
 * @param body - JSON object the board validates, including its `confirm`.
 * @returns the parsed JSON object.
 * @throws CcBoardError when the board is unreachable or answers unusably.
 */
export async function boardPost(
  access: BoardAccess,
  path: string,
  body: Readonly<Record<string, unknown>>,
): Promise<Record<string, unknown>> {
  return await boardFetch(access, new URL(access.baseUrl + path), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

/**
 * Perform one board request and decode its answer.
 * @param access - endpoint and credentials.
 * @param url - resolved request URL.
 * @param init - method, headers, and body.
 * @returns the parsed JSON object, with `ok` forced false on a refusal.
 * @throws CcBoardError when the request fails, times out, or the answer is unusable.
 */
async function boardFetch(
  access: BoardAccess,
  url: URL,
  init: BoardRequest,
): Promise<Record<string, unknown>> {
  let response: Response
  try {
    response = await fetch(url, {
      ...init,
      headers: { ...init.headers, authorization: `Bearer ${access.token}` },
      signal: AbortSignal.timeout(access.timeoutMs),
    })
  } catch (cause) {
    throw new CcBoardError(
      `board ${url.origin} did not answer: ${reasonOf(cause)}`,
      'CC_BOARD_UNREACHABLE',
    )
  }
  const payload = await readJsonObject(response, url)
  if (response.ok) return payload
  // The board states its reason in the body at every door it turns a request
  // away from, not only the 403 one. A stated reason is a reportable outcome
  // rather than a transport failure, so it is handed back for the caller to
  // project; `ok` comes from the status, because a non-2xx answer is not a
  // success however its body reads. An answer that states no reason has
  // nothing to report, so it fails with the status named.
  const reason = projectReason(payload)
  if (reason !== '') return { ...payload, ok: false }
  throw new CcBoardError(
    `board ${url.origin}${url.pathname} answered ${response.status}`,
    'CC_BOARD_REFUSED',
  )
}

/**
 * Decode a board answer, which is a JSON object on every documented path.
 * @param response - the board's response.
 * @param url - requested URL, named in the failure.
 * @returns the parsed object.
 * @throws CcBoardError when the body is not a JSON object, or when the request timed out mid-body.
 */
async function readJsonObject(response: Response, url: URL): Promise<Record<string, unknown>> {
  let parsed: unknown
  try {
    parsed = await response.json()
  } catch (cause) {
    // The timeout can fire while the body is still arriving, after `fetch`
    // itself has already resolved. That is the board failing to answer, not
    // the board answering badly, and the two have different remedies.
    if (cause instanceof Error && (cause.name === 'TimeoutError' || cause.name === 'AbortError')) {
      throw new CcBoardError(
        `board ${url.origin} did not answer: ${reasonOf(cause)}`,
        'CC_BOARD_UNREACHABLE',
      )
    }
    throw new CcBoardError(
      `board ${url.origin}${url.pathname} answered unreadable JSON: ${reasonOf(cause)}`,
      'CC_BOARD_REFUSED',
    )
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new CcBoardError(
      `board ${url.origin}${url.pathname} answered a non-object body`,
      'CC_BOARD_REFUSED',
    )
  }
  return parsed as Record<string, unknown>
}
