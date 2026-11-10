/**
 * The one place a board plugin's deployment-varying choices are decided: the
 * `Config` a composition writes is optional throughout, and every operation
 * reads a {@link ResolvedConfig} instead of defaulting at its point of use.
 * @module @deepseek-ai/dsh-experimental-cc-sessions/config
 */

import type { Config, ResolvedConfig } from './types.ts'

/** Environment variable the board endpoint is read from when config names none. */
export const DEFAULT_BOARD_URL_ENV = 'DSH_CC_BOARD_URL'

/** Environment variable the board token is read from when config names none. */
export const DEFAULT_TOKEN_ENV = 'DSH_CC_BOARD_TOKEN'

/** Sweep kind requested of the board on a list read. */
export const DEFAULT_SCAN = 'registry'

/** Per-request timeout; a board sweep of a cold cluster is slow. */
export const DEFAULT_REQUEST_TIMEOUT_MS = 20000

// The board remembers a registry sweep for 20s, so a faster list poll buys
// nothing but load; screen captures have no such memory and are cheap.

/** Milliseconds between list reads a page is told to poll at. */
export const DEFAULT_ROSTER_INTERVAL_MS = 10000

/** Milliseconds between screen reads a page is told to poll at. */
export const DEFAULT_PANE_INTERVAL_MS = 3000

/** Screen lines one read requests. */
export const DEFAULT_PANE_LINES = 16

/**
 * Decide every optional field once, at construction.
 *
 * The plugin schema carries the same defaults so `--dump-config` and the
 * settings UI show real values, but a directly constructed service never sees
 * the schema: this function, not the schema, is what the operations rely on.
 * @param config - config as a composition wrote it.
 * @returns the config with every field decided.
 */
export function resolveConfig(config: Config): ResolvedConfig {
  return {
    boardUrl: config.boardUrl ?? '',
    boardUrlEnv: config.boardUrlEnv ?? DEFAULT_BOARD_URL_ENV,
    tokenEnv: config.tokenEnv ?? DEFAULT_TOKEN_ENV,
    tokenFile: config.tokenFile ?? '',
    scan: config.scan ?? DEFAULT_SCAN,
    requestTimeoutMs: config.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS,
    rosterIntervalMs: config.rosterIntervalMs ?? DEFAULT_ROSTER_INTERVAL_MS,
    paneIntervalMs: config.paneIntervalMs ?? DEFAULT_PANE_INTERVAL_MS,
    paneLines: config.paneLines ?? DEFAULT_PANE_LINES,
  }
}
