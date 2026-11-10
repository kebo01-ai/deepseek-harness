/**
 * Typed failures of the workbench-board seam.
 * @module @deepseek-ai/dsh-experimental-cc-sessions/error
 */

/** Why a board operation could not be carried out. */
export type CcBoardErrorCode =
  /** No board endpoint is configured, so no read can be attempted. */
  | 'CC_BOARD_UNCONFIGURED'
  /** No board token could be resolved from configuration or environment. */
  | 'CC_BOARD_NO_TOKEN'
  /** A config field carries a value this plugin cannot use. */
  | 'CC_BOARD_INVALID_CONFIG'
  /** The board was reached but answered with a failure. */
  | 'CC_BOARD_REFUSED'
  /** The board could not be reached, or did not answer in time. */
  | 'CC_BOARD_UNREACHABLE'

/**
 * A board operation that could not be carried out, carrying the reason a
 * reader is shown. Messages never include the token.
 */
export class CcBoardError extends Error {
  override readonly name = 'CcBoardError'

  /**
   * @param message - reader-facing reason.
   * @param code - which failure this is.
   */
  constructor(message: string, readonly code: CcBoardErrorCode) {
    super(message)
  }
}

/**
 * The reader-facing reason behind a thrown value. Every board failure a page
 * shows passes through here, so a value thrown without a message still names
 * itself instead of rendering as nothing.
 * @param cause - the thrown value.
 * @returns its message, or its string form when it carries none.
 */
export function reasonOf(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause)
}
