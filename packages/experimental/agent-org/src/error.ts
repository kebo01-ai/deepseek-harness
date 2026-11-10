/** Typed agent-organization registry failures. */

import { HarnessError } from '@deepseek-ai/dsh-llm'

/**
 * Stable failure raised by the organization registry. The `code` is the
 * caller-facing discriminant; the message names the offending organization or
 * Session so a tool result is actionable without a second lookup.
 */
export class OrgError extends HarnessError {
  constructor(message: string, code: OrgErrorCode, options?: ErrorOptions) {
    super(message, code, options)
    this.name = 'OrgError'
  }
}

/** Every failure the registry raises. */
export type OrgErrorCode =
  /** A named organization id has no stored record. */
  | 'ORG_NOT_FOUND'
  /** A display name was empty after trimming, or longer than the configured maximum. */
  | 'ORG_INVALID_NAME'
  /** Creating one more organization would exceed `maxOrgs`. */
  | 'ORG_LIMIT_REACHED'
  /** Joining one more Session would exceed `maxMembersPerOrg`. */
  | 'ORG_MEMBER_LIMIT_REACHED'
  /** The Session already holds a membership row in this organization. */
  | 'ORG_ALREADY_MEMBER'
  /** The Session holds no membership row in this organization. */
  | 'ORG_NOT_MEMBER'
  /** A deployment limit was not a positive safe integer. */
  | 'ORG_INVALID_CONFIG'
