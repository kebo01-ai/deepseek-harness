/**
 * The organization domain declaration: the stored record schema and the
 * `defineDomain` spec the registry opens. The zod schema validates the shipped
 * format at the durability boundary.
 *
 * The spec declares no global slot. Registry order is derived from
 * `createdAt` with the id as tiebreak, so creating and deleting an
 * organization is one table write each. A stored order singleton would make
 * both operations two writes that can diverge, which is only worth its
 * recovery marker for an order a person can rearrange.
 * @module @deepseek-ai/dsh-experimental-agent-org/src/spec
 */

import { z } from 'zod'
import { brandString } from '@deepseek-ai/dsh-brand'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { defineDomain, domainTable } from '@deepseek-ai/dsh-storage-domain'
import type { OrgId } from './types.ts'

/** Durable shape of one membership row. */
export const orgMemberRow = z.object({
  sessionId: z.string().transform(value => brandString<SessionId>(value)),
  role: z.enum(['manager', 'worker']),
  joinedAt: z.string(),
})

/**
 * Durable shape of one organization record. `members` is the roster in join
 * order; timestamps are ISO-8601 strings. The record names Sessions it does
 * not own: a row survives the Session it names, and reconciling a row against
 * live Sessions belongs to the consumer that can observe them.
 */
export const orgRecord = z.object({
  name: z.string(),
  members: z.array(orgMemberRow),
  createdAt: z.string(),
  updatedAt: z.string(),
})

/** One stored organization record, inferred from {@link orgRecord}. */
export type OrgRecord = z.infer<typeof orgRecord>

/**
 * The organization domain spec: one `orgs` table keyed by {@link OrgId}. The
 * registry opens this through `ctx.storageDomain`; the spec object is the
 * single source of the domain's identity, version, and schema.
 */
export const orgDomainSpec = defineDomain({
  name: 'agent_org',
  version: 1,
  tables: { orgs: domainTable<OrgId, OrgRecord>(orgRecord) },
})
