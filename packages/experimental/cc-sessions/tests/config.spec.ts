/** Where the plugin's optional fields are decided, and what they decide to. */

import { describe, expect, it } from 'vitest'
import { resolveConfig } from '../src/config.ts'

describe('config resolution', () => {
  it('decides every unsupplied field, including the board-aware cadence', () => {
    expect(resolveConfig({})).toEqual({
      boardUrl: '',
      boardUrlEnv: 'DSH_CC_BOARD_URL',
      tokenEnv: 'DSH_CC_BOARD_TOKEN',
      tokenFile: '',
      scan: 'registry',
      requestTimeoutMs: 20000,
      rosterIntervalMs: 10000,
      paneIntervalMs: 3000,
      paneLines: 16,
    })
  })

  it('keeps every field a composition supplied', () => {
    const written = {
      boardUrl: 'http://127.0.0.1:8197',
      boardUrlEnv: 'WB_BOARD',
      tokenEnv: 'WB_TOKEN',
      tokenFile: '/run/board.token',
      scan: 'cluster',
      requestTimeoutMs: 5000,
      rosterIntervalMs: 4000,
      paneIntervalMs: 1000,
      paneLines: 40,
    } as const
    expect(resolveConfig(written)).toEqual(written)
  })
})
