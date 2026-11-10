/**
 * Agent organization registry (`ctx.agentOrgs`): durable named organizations
 * and explicit many-to-many Session membership over the domain data form.
 *
 * An organization owns its identity. It is not an implicit root over one
 * Session, so it precedes the manager Session that configures it and outlives
 * every Session that joins it. Membership is an explicit stored row rather
 * than something derived from a spawn edge, so one Session can hold rows in
 * several organizations at once.
 * @module @deepseek-ai/dsh-experimental-agent-org
 */

import { randomUUID } from 'node:crypto'
import { Context, Service } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { KvTable } from '@deepseek-ai/dsh-storage-domain'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import { OrgError } from './error.ts'
import { orgDomainSpec } from './spec.ts'
import type { OrgRecord } from './spec.ts'
import type { Config, Org, OrgListView, OrgMember, OrgRole, OrgId as OrgIdBrand } from './types.ts'

export type { Config, Org, OrgListView, OrgMember, OrgRole } from './types.ts'
export { OrgError } from './error.ts'
export type { OrgErrorCode } from './error.ts'
export { orgDomainSpec, orgMemberRow, orgRecord } from './spec.ts'
export type { OrgRecord } from './spec.ts'

/** Identifies one organization record (see `src/types.ts` for the brand rationale). */
export type OrgId = OrgIdBrand

/**
 * Brand a string as an {@link OrgId}.
 * @param id - Raw organization id string.
 * @returns the same string, branded at compile time.
 */
export function OrgId(id: string): OrgId {
  return id as OrgId
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    agentOrgs: OrgRegistry
  }
}

const DEFAULT_MAX_ORGS = 64
const DEFAULT_MAX_MEMBERS_PER_ORG = 32
const DEFAULT_MAX_NAME_LENGTH = 120

/**
 * Validate one positive safe-integer deployment limit.
 * @param name - Config field being validated, used in the failure message.
 * @param value - Candidate limit.
 * @returns the same value once accepted.
 */
function positiveLimit(name: string, value: number): number {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new OrgError(`${name} must be a positive safe integer`, 'ORG_INVALID_CONFIG')
  }
  return value
}

/** Registry display order: newest organization first, id as a stable tiebreak. */
const compareOrgs = (left: Org, right: Org): number =>
  right.createdAt.localeCompare(left.createdAt) || String(left.id).localeCompare(String(right.id))

/**
 * Durable organization registry. Every verb reads the in-memory domain
 * snapshot and writes through the domain's single write chain, so a membership
 * change is one atomic record write with no order singleton to diverge from.
 */
export class OrgRegistry extends TypertRemoteService {
  static inject = ['storageDomain']

  static Config: z<Config> = z.object({
    maxOrgs: z.number().step(1).min(1).default(DEFAULT_MAX_ORGS),
    maxMembersPerOrg: z.number().step(1).min(1).default(DEFAULT_MAX_MEMBERS_PER_ORG),
    maxNameLength: z.number().step(1).min(1).default(DEFAULT_MAX_NAME_LENGTH),
  })

  /** Validated deployment limits applied by every registry operation. */
  private readonly limits: Required<Config>

  private table?: KvTable<OrgId, OrgRecord>

  /**
   * @param ctx - owning Cordis Context.
   * @param config - validated plugin config.
   */
  constructor(ctx: Context, config: Config = {}) {
    super(ctx, 'agentOrgs')
    this.limits = {
      maxOrgs: positiveLimit('maxOrgs', config.maxOrgs ?? DEFAULT_MAX_ORGS),
      maxMembersPerOrg: positiveLimit(
        'maxMembersPerOrg',
        config.maxMembersPerOrg ?? DEFAULT_MAX_MEMBERS_PER_ORG,
      ),
      maxNameLength: positiveLimit('maxNameLength', config.maxNameLength ?? DEFAULT_MAX_NAME_LENGTH),
    }
  }

  /** Open the organization domain and hand its close to the owning fiber. */
  protected async [Service.init](): Promise<void> {
    const domain = await this.ctx.storageDomain.open(orgDomainSpec)
    this.ctx.effect(() => () => domain.close(), 'agent-org.domainClose')
    this.table = domain.table('orgs')
  }

  /**
   * Create one empty organization. The name is a display label and is not
   * unique; two organizations may carry the same one.
   * @param name - Display name; rejected when empty after trimming or longer
   * than `maxNameLength`.
   * @returns the newly durable organization, with an empty roster.
   */
  async create(name: string): Promise<Org> {
    const table = this.requireTable()
    const label = this.validName(name)
    if (table.size >= this.limits.maxOrgs) {
      throw new OrgError(
        `cannot create organization '${label}': the registry already holds ${this.limits.maxOrgs}`,
        'ORG_LIMIT_REACHED',
      )
    }
    const id = OrgId(randomUUID())
    const now = new Date().toISOString()
    const record: OrgRecord = { name: label, members: [], createdAt: now, updatedAt: now }
    await table.put(id, record)
    return project(id, record)
  }

  /**
   * Look up one organization by id.
   * @param id - Organization id.
   * @returns the organization, or `undefined` when no record is stored.
   */
  get(id: OrgId): Org | undefined {
    const record = this.requireTable().get(id)
    return record === undefined ? undefined : project(id, record)
  }

  /**
   * Every stored organization, newest first.
   * @returns detached organization projections in registry display order.
   */
  list(): readonly Org[] {
    return [...this.requireTable().entries()]
      .map(([id, record]) => project(id, record))
      .sort(compareOrgs)
  }

  /**
   * Delete one organization and its whole roster. The member Sessions are not
   * touched: this removes the organization, not the work it dispatched.
   * @param id - Organization to delete.
   * @returns `true` when a record was deleted, `false` when none was stored.
   */
  async delete(id: OrgId): Promise<boolean> {
    return await this.requireTable().delete(id)
  }

  /**
   * Add one Session to one organization. The same Session may hold rows in
   * several organizations; a second row in the *same* organization is
   * rejected, because a Session has one role per organization.
   * @param id - Organization to join.
   * @param sessionId - Session gaining membership.
   * @param role - What the Session does in this organization.
   * @returns the organization with the new row appended to its roster.
   */
  async join(id: OrgId, sessionId: SessionId, role: OrgRole): Promise<Org> {
    this.requireRecord(id)
    const limit = this.limits.maxMembersPerOrg
    const updated = await this.requireTable().update(id, (current) => {
      if (current.members.some(member => member.sessionId === sessionId)) {
        throw new OrgError(
          `session '${sessionId}' already belongs to organization '${id}'`,
          'ORG_ALREADY_MEMBER',
        )
      }
      if (current.members.length >= limit) {
        throw new OrgError(
          `cannot add session '${sessionId}' to organization '${id}': it already holds ${limit} members`,
          'ORG_MEMBER_LIMIT_REACHED',
        )
      }
      const now = new Date().toISOString()
      return {
        ...current,
        members: [...current.members, { sessionId, role, joinedAt: now }],
        updatedAt: now,
      }
    })
    return project(id, updated)
  }

  /**
   * Remove one Session's membership row. Other organizations the Session
   * belongs to are unaffected, and the Session itself is not touched.
   * @param id - Organization to leave.
   * @param sessionId - Session losing membership.
   * @returns the organization without that row.
   */
  async leave(id: OrgId, sessionId: SessionId): Promise<Org> {
    this.requireRecord(id)
    const updated = await this.requireTable().update(id, (current) => {
      if (!current.members.some(member => member.sessionId === sessionId)) {
        throw new OrgError(
          `session '${sessionId}' does not belong to organization '${id}'`,
          'ORG_NOT_MEMBER',
        )
      }
      return {
        ...current,
        members: current.members.filter(member => member.sessionId !== sessionId),
        updatedAt: new Date().toISOString(),
      }
    })
    return project(id, updated)
  }

  /**
   * The roster of one organization in join order.
   * @param id - Organization to read.
   * @returns its membership rows.
   */
  membersOf(id: OrgId): readonly OrgMember[] {
    return project(id, this.requireRecord(id)).members
  }

  /**
   * Every organization one Session belongs to. This is the many-to-many read:
   * a worker Session dispatched by two managers appears in both.
   * @param sessionId - Session to look up.
   * @returns its organizations in registry display order.
   */
  orgsOf(sessionId: SessionId): readonly Org[] {
    return this.list().filter(org => org.members.some(member => member.sessionId === sessionId))
  }

  /**
   * Read the whole registry through the generated Remote API. The read is
   * global because an organization is not scoped to a Session: a browser
   * showing one Session's organizations filters this snapshot by
   * {@link OrgRegistry.orgsOf}'s rule on the Session it is displaying.
   * @returns every stored organization in registry display order.
   */
  @Remote('list')
  remoteList(): OrgListView {
    return { orgs: this.list() }
  }

  /** The stored record of one organization, or a typed miss. */
  private requireRecord(id: OrgId): OrgRecord {
    const record = this.requireTable().get(id)
    if (record === undefined) throw new OrgError(`unknown organization '${id}'`, 'ORG_NOT_FOUND')
    return record
  }

  /** The opened table, or a loud failure when a verb ran before service init. */
  private requireTable(): KvTable<OrgId, OrgRecord> {
    if (this.table === undefined) throw new OrgError('organization domain is not open', 'ORG_INVALID_CONFIG')
    return this.table
  }

  /** The trimmed display name, or a typed rejection. */
  private validName(name: string): string {
    const label = name.trim()
    if (label.length === 0) throw new OrgError('organization name must not be empty', 'ORG_INVALID_NAME')
    if (label.length > this.limits.maxNameLength) {
      throw new OrgError(
        `organization name must be at most ${this.limits.maxNameLength} characters`,
        'ORG_INVALID_NAME',
      )
    }
    return label
  }
}

/**
 * Detach one stored record into its public projection.
 * @param id - Organization id the record is stored under.
 * @param record - Stored organization record.
 * @returns the projection, with the roster copied out of the stored array.
 */
function project(id: OrgId, record: OrgRecord): Org {
  return {
    id,
    name: record.name,
    members: record.members.map(member => ({ ...member })),
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  }
}

export default OrgRegistry
