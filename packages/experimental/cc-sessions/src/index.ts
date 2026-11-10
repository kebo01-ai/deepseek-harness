/**
 * Directory of the external agent sessions a workbench board reports
 * (`ctx.ccSessions`): one list read, one screen read, and one keystroke
 * forward, each also reachable from a browser through the generated Remote
 * API.
 *
 * The board owns the sessions. This package never starts, stops, or kills
 * one — the operations it offers are exactly list, read, and type, so a page
 * built on it cannot end a session that is doing work.
 * @module @deepseek-ai/dsh-experimental-cc-sessions
 */

import { readFile } from 'node:fs/promises'
import { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { launchEnvironmentOf } from '@deepseek-ai/dsh-launch-environment'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import { boardGet, boardPost, hexKeys, inputConfirm } from './board.ts'
import type { BoardAccess } from './board.ts'
import {
  DEFAULT_BOARD_URL_ENV,
  DEFAULT_PANE_INTERVAL_MS,
  DEFAULT_PANE_LINES,
  DEFAULT_REQUEST_TIMEOUT_MS,
  DEFAULT_ROSTER_INTERVAL_MS,
  DEFAULT_SCAN,
  DEFAULT_TOKEN_ENV,
  resolveConfig,
} from './config.ts'
import { CcBoardError, reasonOf } from './error.ts'
import { projectReason, projectRoster, projectScreen } from './project.ts'
import type {
  CcCadence,
  CcPaneView,
  CcRosterView,
  CcSendResult,
  CcSessionTarget,
  Config,
  ResolvedConfig,
} from './types.ts'

export type {
  CcCadence,
  CcPaneView,
  CcRosterView,
  CcScan,
  CcSendResult,
  CcSessionName,
  CcSessionRow,
  CcSessionTarget,
  Config,
  ResolvedConfig,
} from './types.ts'
export { CcBoardError } from './error.ts'
export type { CcBoardErrorCode } from './error.ts'
export { boardFullName, hexKeys, inputConfirm } from './board.ts'
export { resolveConfig } from './config.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    ccSessions: CcSessionDirectory
  }
}


/**
 * Read-and-type access to one workbench board's sessions.
 *
 * Endpoint and token resolve per request rather than at load: both come from
 * the launch environment or a file the board rewrites when it rotates its
 * token, so neither is knowable when the composition boots. A missing one is
 * reported to the reader as a stated reason, which is what a board page must
 * show instead of an empty grid.
 */
export class CcSessionDirectory extends TypertRemoteService {
  /** Deployment-varying endpoint, credential indirection, and poll cadence. */
  static Config: z<Config> = z.object({
    boardUrl: z.string(),
    boardUrlEnv: z.string().default(DEFAULT_BOARD_URL_ENV),
    tokenEnv: z.string().role('credential-ref').default(DEFAULT_TOKEN_ENV),
    tokenFile: z.string(),
    scan: z.union(['registry', 'cluster'] as const).default(DEFAULT_SCAN),
    requestTimeoutMs: z.number().step(1).min(1).default(DEFAULT_REQUEST_TIMEOUT_MS),
    rosterIntervalMs: z.number().step(1).min(1).default(DEFAULT_ROSTER_INTERVAL_MS),
    paneIntervalMs: z.number().step(1).min(1).default(DEFAULT_PANE_INTERVAL_MS),
    paneLines: z.number().step(1).min(1).default(DEFAULT_PANE_LINES),
  })

  private readonly config: ResolvedConfig

  /**
   * @param ctx - owning Cordis Context.
   * @param config - validated plugin config.
   */
  constructor(ctx: Context, config: Config = {}) {
    super(ctx, 'ccSessions')
    this.config = resolveConfig(config)
  }

  /**
   * Poll cadence this host serves to reading pages.
   * @returns the roster interval, the screen interval, and the capture height.
   */
  cadence(): CcCadence {
    return {
      rosterIntervalMs: this.config.rosterIntervalMs,
      paneIntervalMs: this.config.paneIntervalMs,
      paneLines: this.config.paneLines,
    }
  }

  /**
   * List the sessions the board reports.
   * @returns the list, or a stated reason with an empty list.
   */
  @Remote('roster')
  async roster(): Promise<CcRosterView> {
    const cadence = this.cadence()
    let access: BoardAccess
    try {
      access = await this.access()
    } catch (cause) {
      return this.unreadableRoster(cadence, cause)
    }
    try {
      const payload = await boardGet(access, '/api/cc/roster', { scan: this.config.scan })
      return projectRoster(payload, cadence, access.baseUrl)
    } catch (cause) {
      return { ...this.unreadableRoster(cadence, cause), boardUrl: access.baseUrl }
    }
  }

  /**
   * Read one session's screen.
   * @param target - session to read.
   * @returns the captured screen, or a stated reason with empty text.
   */
  @Remote('pane')
  async pane(target: CcSessionTarget): Promise<CcPaneView> {
    try {
      const access = await this.access()
      const payload = await boardGet(access, '/api/cc/read', {
        node_ip: target.nodeIp,
        name: String(target.name),
        lines: String(this.cadence().paneLines),
      })
      const reason = projectReason(payload)
      if (payload['ok'] !== true) return { ok: false, error: reason, target, text: '' }
      return { ok: true, error: '', target, text: projectScreen(payload) }
    } catch (cause) {
      return { ok: false, error: reasonOf(cause), target, text: '' }
    }
  }

  /**
   * Forward one keystroke batch into a session, as the reader typed it.
   * @param target - session to type into.
   * @param text - text to deliver; empty text is refused rather than sent.
   * @param submit - whether to append a carriage return, submitting the line.
   * @returns the board's answer, including its refusal when it declined.
   */
  @Remote('send')
  async send(target: CcSessionTarget, text: string, submit: boolean): Promise<CcSendResult> {
    if (text === '' && !submit) {
      return { ok: false, error: 'nothing to send', refused: '', screen: '' }
    }
    try {
      const access = await this.access()
      const payload = await boardPost(access, '/api/cc/input', {
        node_ip: target.nodeIp,
        name: String(target.name),
        confirm: inputConfirm(target),
        hex: hexKeys(submit ? `${text}\r` : text),
        echo: true,
      })
      const reason = projectReason(payload)
      if (payload['ok'] !== true) {
        const refused = typeof payload['refused'] === 'string' ? payload['refused'] : ''
        return { ok: false, error: reason, refused, screen: '' }
      }
      return { ok: true, error: '', refused: '', screen: projectScreen(payload) }
    } catch (cause) {
      return { ok: false, error: reasonOf(cause), refused: '', screen: '' }
    }
  }

  /** The endpoint and credentials for one request. */
  private async access(): Promise<BoardAccess> {
    return {
      baseUrl: this.boardUrl(),
      token: await this.token(),
      timeoutMs: this.config.requestTimeoutMs,
    }
  }

  /**
   * The configured board endpoint, normalized to what {@link BoardAccess}
   * requires and what is safe to echo to a reader: origin plus any path
   * prefix, with the trailing slash, query, fragment, and any credentials in
   * the configured string removed. The token travels in a header, so userinfo
   * on the endpoint would only leak into the page that displays it.
   */
  private boardUrl(): string {
    const name = this.config.boardUrlEnv
    const configured = this.config.boardUrl
    const raw = (configured === ''
      ? launchEnvironmentOf(this.ctx).get(name)?.value ?? ''
      : configured).trim()
    if (raw === '') {
      throw new CcBoardError(
        `no board endpoint: set the plugin's boardUrl or the ${name} environment variable`,
        'CC_BOARD_UNCONFIGURED',
      )
    }
    let parsed: URL
    try {
      parsed = new URL(raw)
    } catch (cause) {
      throw new CcBoardError(
        `board endpoint '${raw}' is not a URL: ${reasonOf(cause)}`,
        'CC_BOARD_INVALID_CONFIG',
      )
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new CcBoardError(`board endpoint '${raw}' is not an http(s) URL`, 'CC_BOARD_INVALID_CONFIG')
    }
    return parsed.origin + parsed.pathname.replace(/\/+$/, '')
  }

  /**
   * The board token for one request. A configured token file wins over the
   * environment, matching how a configured endpoint does, and is read per
   * request because the board rewrites it when it rotates: a token cached at
   * boot would authorize nothing after the next rotation.
   */
  private async token(): Promise<string> {
    const file = this.config.tokenFile
    if (file !== '') {
      let contents: string
      try {
        contents = await readFile(file, 'utf8')
      } catch (cause) {
        throw new CcBoardError(`board token file '${file}' is unreadable: ${reasonOf(cause)}`, 'CC_BOARD_NO_TOKEN')
      }
      const token = contents.trim()
      if (token !== '') return token
      throw new CcBoardError(`board token file '${file}' is empty`, 'CC_BOARD_NO_TOKEN')
    }
    const name = this.config.tokenEnv
    const ambient = launchEnvironmentOf(this.ctx).get(name)?.value ?? ''
    if (ambient.trim() !== '') return ambient.trim()
    throw new CcBoardError(
      `no board token: set the ${name} environment variable or the plugin's tokenFile`,
      'CC_BOARD_NO_TOKEN',
    )
  }

  /** The list view for a read that never reached the board. */
  private unreadableRoster(cadence: CcCadence, cause: unknown): CcRosterView {
    return {
      ok: false,
      error: reasonOf(cause),
      stale: false,
      scan: this.config.scan,
      sessions: [],
      nodes: [],
      unreachableNodes: [],
      cadence,
      boardUrl: '',
    }
  }
}

export default CcSessionDirectory
