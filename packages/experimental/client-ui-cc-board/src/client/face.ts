/** Operation faces the board page is handed, and the copy seat it renders with. */

import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { CcRosterView, CcSessionTarget } from '@deepseek-ai/dsh-experimental-cc-sessions/client'
import type { NS } from './locales.ts'

/** The localized-copy function for this plugin's namespace. */
export type CcBoardTranslate = PropsLocale<typeof NS>['t']

/** How one board read ended. */
export interface CcRosterOutcome {
  /** The list, or undefined when the read did not produce one. */
  view: CcRosterView | undefined
  /** Why the read produced nothing, empty when it did. */
  failure: string
}

/** How one keystroke delivery ended. */
export interface CcSendOutcome {
  /** `sent` when the board delivered it; `refused` when the board declined; `failed` otherwise. */
  kind: 'sent' | 'refused' | 'failed'
  /** The board's stated reason, empty on `sent`. */
  reason: string
}

/** How one screen read ended. */
export interface CcPaneOutcome {
  /** The captured screen, empty when the read produced none. */
  text: string
  /** Why the read produced no screen, empty when it did. */
  failure: string
}

/** Read the board's session list once. */
export type CcBoardLoadRoster = () => Promise<CcRosterOutcome>

/**
 * Read one session's screen once. The outcome keeps a screen this read could
 * not get apart from a screen that is genuinely blank, because a card that
 * states neither leaves a reader guessing which one it is looking at.
 */
export type CcBoardLoadPane = (target: CcSessionTarget) => Promise<CcPaneOutcome>

/** Deliver one keystroke batch, submitting the line. */
export type CcBoardSend = (target: CcSessionTarget, text: string) => Promise<CcSendOutcome>

/** Operations the plugin hands the board page. */
export interface CcBoardInjected {
  /** Read the session list. */
  loadRoster: CcBoardLoadRoster
  /** Read one session's screen. */
  loadPane: CcBoardLoadPane
  /** Type into one session. */
  send: CcBoardSend
}

/**
 * The key one session is tracked under across reads: the board addresses a
 * session by node and name together, and names repeat across nodes.
 * @param target - the session.
 * @returns a stable per-session key.
 */
export function targetKey(target: CcSessionTarget): string {
  return `${target.nodeIp}/${String(target.name)}`
}

/**
 * The sentence a page shows for a read that threw instead of answering. The
 * generated Remote namespace reports a failed call as data, so a rejection is
 * the browser's own fault — a closed socket or a disposed namespace — and the
 * page states it rather than letting it escape a driver tick unhandled.
 * @param cause - the thrown value.
 * @returns the reason to show, never empty.
 */
export function thrownReason(cause: unknown): string {
  const stated = cause instanceof Error ? cause.message : String(cause)
  return stated === '' ? 'the read threw without a reason' : stated
}
