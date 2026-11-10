/**
 * Identities and projections of the external agent sessions a workbench board
 * reports. Types only.
 * @module @deepseek-ai/dsh-experimental-cc-sessions/types
 */

import type { Branded } from '@deepseek-ai/dsh-brand'

/**
 * A board-owned session name. Branded because it addresses a session in
 * another process' namespace and must never stand in for a dsh `SessionId`.
 */
export type CcSessionName = Branded<'CcSessionName'>

/** One session as the board addresses it: the node holding it plus its name. */
export interface CcSessionTarget {
  /** Address of the node whose terminal multiplexer holds the session. */
  nodeIp: string
  /** Board-side session name. */
  name: CcSessionName
}

/** One row of the board's session list, reduced to what a board page renders. */
export interface CcSessionRow extends CcSessionTarget {
  /**
   * Activity word verbatim from the board (`busy` and `idle` observed). Kept
   * raw rather than mapped onto an owned union: the board owns this
   * vocabulary, and a word this package has not seen should reach the reader
   * unchanged instead of collapsing into a guess.
   */
  state: string
  /** Last lines of the session's screen, as the board captured them. */
  summary: string
  /** Working directory the session was started in, empty when unreported. */
  cwd: string
  /** Role label the board carries for the session, empty when unreported. */
  role: string
  /** Where the board reaches the session, for display beside the node address. */
  where: string
  /** Whether the board accepts keystrokes for this session. */
  writable: boolean
  /** The board's stated reason when {@link writable} is false. */
  writeBlock: string
  /** Whether the board recognizes this session as the one asking. */
  isSelf: boolean
}

/** Poll cadence the host was configured with, obeyed by the page that reads it. */
export interface CcCadence {
  /** Milliseconds between session-list reads. */
  rosterIntervalMs: number
  /** Milliseconds between screen reads of the sessions a page is showing. */
  paneIntervalMs: number
  /** Screen lines one read requests. */
  paneLines: number
}

/**
 * The session list as one page load sees it. A failed read is reported as
 * `ok: false` with a stated `error`, never as an empty list: an unreachable
 * board and a board with no sessions must not render the same.
 */
export interface CcRosterView {
  /** Whether this answer came from a successful board read. */
  ok: boolean
  /** Why the read failed, empty while {@link ok}. */
  error: string
  /** Whether the board served a remembered answer instead of a fresh sweep. */
  stale: boolean
  /** Age in seconds of a stale answer, absent when the board reported none. */
  staleAgeS?: number
  /** Board-reported sweep kind (`registry` or `cluster`). */
  scan: string
  /** Rows in board order. */
  sessions: readonly CcSessionRow[]
  /** Nodes the board swept. */
  nodes: readonly string[]
  /** Nodes the board could not reach during the sweep. */
  unreachableNodes: readonly string[]
  /** Cadence the reading page should poll at. */
  cadence: CcCadence
  /** Board endpoint this answer came from, without credentials. */
  boardUrl: string
}

/** One screen read of one session. */
export interface CcPaneView {
  /** Whether the screen was captured. */
  ok: boolean
  /** Why the capture failed, empty while {@link ok}. */
  error: string
  /** The session that was read. */
  target: CcSessionTarget
  /** Captured screen text, empty on failure. */
  text: string
}

/** The board's answer to one forwarded keystroke batch. */
export interface CcSendResult {
  /** Whether the board accepted and delivered the keystrokes. */
  ok: boolean
  /** Why delivery failed, empty while {@link ok}. */
  error: string
  /** The board's refusal word when it declined the write, empty otherwise. */
  refused: string
  /** Screen the board returned after delivery, empty when it returned none. */
  screen: string
}

/** How the board is asked to find sessions on one list read. */
export type CcScan = 'registry' | 'cluster'

/** Plugin config; every field optional, `apply` fills environment defaults. */
export interface Config {
  /** Board base URL, for example `http://127.0.0.1:8197`; prefer {@link boardUrlEnv}. */
  boardUrl?: string
  /** Environment variable carrying the board base URL. Defaults to `DSH_CC_BOARD_URL`. */
  boardUrlEnv?: string
  /** Environment variable carrying the board token. Defaults to `DSH_CC_BOARD_TOKEN`. */
  tokenEnv?: string
  /** File holding the board token, read per request so a rotated token is picked up. */
  tokenFile?: string
  /** Board sweep kind requested on every list read. Defaults to `registry`. */
  scan?: CcScan
  /** Per-request timeout in milliseconds. Defaults to 20000. */
  requestTimeoutMs?: number
  /** Cadence served to reading pages. */
  rosterIntervalMs?: number
  /** Cadence served to reading pages. */
  paneIntervalMs?: number
  /** Screen lines one read requests. */
  paneLines?: number
}

/**
 * {@link Config} with every field decided, as the operations read it. An
 * unsupplied endpoint or token file is the empty string, which each operation
 * judges for itself: both are legitimately absent in a deployment that
 * supplies them through the environment.
 */
export type ResolvedConfig = Required<Config>
