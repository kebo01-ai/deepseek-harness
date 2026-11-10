/** Public agent-organization identities, membership roles, and projections. */

import type { Branded } from '@deepseek-ai/dsh-brand'
import type { SessionId } from '@deepseek-ai/dsh-session/types'

/**
 * Identifies one organization record. Unlike an implicit team identity, this
 * is the organization's own id: it is not derived from any Session, so the
 * organization outlives every Session that joins it.
 */
export type OrgId = Branded<'OrgId'>

/**
 * What one Session does in one organization. `manager` sessions dispatch work
 * and read the whole roster; `worker` sessions carry out dispatched work. The
 * role is per membership row, so one Session can manage one organization while
 * working in another.
 */
export type OrgRole = 'manager' | 'worker'

/** One Session's membership in one organization. */
export interface OrgMember {
  /** The member Session. */
  readonly sessionId: SessionId
  /** What the Session does in this organization. */
  readonly role: OrgRole
  /** ISO-8601 instant the membership row was written. */
  readonly joinedAt: string
}

/** Detached projection of one organization and its current roster. */
export interface Org {
  /** The organization's own durable id. */
  readonly id: OrgId
  /** Display name supplied at create; not unique. */
  readonly name: string
  /** Current roster in join order. */
  readonly members: readonly OrgMember[]
  /** ISO-8601 instant the organization was created. */
  readonly createdAt: string
  /** ISO-8601 instant of the last membership or name change. */
  readonly updatedAt: string
}

/**
 * The whole registry as one browser-readable snapshot. A reader of
 * organizations has no Session to scope the read to, so the Remote face answers
 * with every stored organization and lets the consumer pick.
 */
export interface OrgListView {
  /** Stored organizations in registry display order, newest first. */
  readonly orgs: readonly Org[]
}

/** Deployment limits for the organization registry. */
export interface Config {
  /** Maximum simultaneously stored organizations. */
  maxOrgs?: number
  /** Maximum membership rows in one organization. */
  maxMembersPerOrg?: number
  /** Maximum display-name length in code units. */
  maxNameLength?: number
}
