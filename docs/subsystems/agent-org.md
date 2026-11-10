# Agent organizations

English | [中文](agent-org.zh.md)

Types shared by the experimental organization registry and its model tools. This page records the literal public forms from [`packages/experimental/agent-org/src/types.ts`](../../packages/experimental/agent-org/src/types.ts); the [agent-org package README](../../packages/experimental/agent-org/README.md) owns the verbs, limits, and failure codes.

## Identity

`OrgId` is the organization's own [branded](core.md#branded-ids) id, generated at create and stored as the record key. It is not derived from any Session, which is what separates an organization from the implicit Lead-rooted identity in [Agent Teams](agent-team.md): the organization precedes the manager Session that configures it and outlives every Session that joins it.

A member's Session id stays its only identity. The registry stores Session ids it does not own and never reconciles them against live Sessions, so a stored row can name a Session that has already ended.

## Membership

Membership is one explicit stored row rather than a conclusion derived from a spawn edge. One Session therefore holds rows in several organizations at once, and its role is per row — it can manage one organization while working in another.

```ts type-equiv
/** One Session's membership in one organization. */
interface OrgMember {
  /** The member Session. */
  readonly sessionId: SessionId
  /** What the Session does in this organization. */
  readonly role: OrgRole
  /** ISO-8601 instant the membership row was written. */
  readonly joinedAt: string
}
```

`OrgRole` is the closed two-member vocabulary `manager | worker`. The registry writes whichever role a caller names and enforces no authority from it; a consumer that distinguishes the two enforces that distinction itself.

## Projection

Every read answers with a detached projection carrying the roster in join order. Both timestamps are ISO-8601 instants; `updatedAt` moves on a membership or name change, never on a read.

```ts type-equiv
/** Detached projection of one organization and its current roster. */
interface Org {
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
```

Display names are not unique, so a name never addresses an organization. Every call after create names the `OrgId`.

## Storage

Records live in the `agent_org` domain over the [storage domain](storage.md) data form, one `orgs` table keyed by `OrgId`. The domain declares no global order slot: registry order is derived from `createdAt` with the id as tiebreak, which keeps creating and deleting an organization one table write each.

## Remote reads

The browser reads organizations through one generated Remote method, and that read is global. An organization is not scoped to a Session, so there is no Session to scope the read to; the registry answers with the whole registry and the consumer picks. There is no writing Remote verb, because nothing here decides which organizations a given reader may change.

```ts type-equiv
/**
 * The whole registry as one browser-readable snapshot. A reader of
 * organizations has no Session to scope the read to, so the Remote face answers
 * with every stored organization and lets the consumer pick.
 */
interface OrgListView {
  /** Stored organizations in registry display order, newest first. */
  readonly orgs: readonly Org[]
}
```

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxagentorgs--orgregistry"></a>

### `ctx.agentOrgs` — `OrgRegistry`

Durable organization registry. Every verb reads the in-memory domain snapshot and writes through the domain's single write chain, so a membership change is one atomic record write with no order singleton to diverge from.

```ts cordis-catalog
/**
 * Create one empty organization. The name is a display label and is not
 * unique; two organizations may carry the same one.
 * @param name - Display name; rejected when empty after trimming or longer
 * than `maxNameLength`.
 * @returns the newly durable organization, with an empty roster.
 */
async create(name: string): Promise<Org>

/**
 * Look up one organization by id.
 * @param id - Organization id.
 * @returns the organization, or `undefined` when no record is stored.
 */
get(id: OrgId): Org | undefined

/**
 * Every stored organization, newest first.
 * @returns detached organization projections in registry display order.
 */
list(): readonly Org[]

/**
 * Delete one organization and its whole roster. The member Sessions are not
 * touched: this removes the organization, not the work it dispatched.
 * @param id - Organization to delete.
 * @returns `true` when a record was deleted, `false` when none was stored.
 */
async delete(id: OrgId): Promise<boolean>

/**
 * Add one Session to one organization. The same Session may hold rows in
 * several organizations; a second row in the *same* organization is
 * rejected, because a Session has one role per organization.
 * @param id - Organization to join.
 * @param sessionId - Session gaining membership.
 * @param role - What the Session does in this organization.
 * @returns the organization with the new row appended to its roster.
 */
async join(id: OrgId, sessionId: SessionId, role: OrgRole): Promise<Org>

/**
 * Remove one Session's membership row. Other organizations the Session
 * belongs to are unaffected, and the Session itself is not touched.
 * @param id - Organization to leave.
 * @param sessionId - Session losing membership.
 * @returns the organization without that row.
 */
async leave(id: OrgId, sessionId: SessionId): Promise<Org>

/**
 * The roster of one organization in join order.
 * @param id - Organization to read.
 * @returns its membership rows.
 */
membersOf(id: OrgId): readonly OrgMember[]

/**
 * Every organization one Session belongs to. This is the many-to-many read:
 * a worker Session dispatched by two managers appears in both.
 * @param sessionId - Session to look up.
 * @returns its organizations in registry display order.
 */
orgsOf(sessionId: SessionId): readonly Org[]

/**
 * Read the whole registry through the generated Remote API. The read is
 * global because an organization is not scoped to a Session: a browser
 * showing one Session's organizations filters this snapshot by
 * {@link OrgRegistry.orgsOf}'s rule on the Session it is displaying.
 * @returns every stored organization in registry display order.
 */
@Remote('list') remoteList(): OrgListView
```

Types: [SessionId](core.md)

Source: [`packages/experimental/agent-org/src/index.ts`](../../packages/experimental/agent-org/src/index.ts)
<!-- END GENERATED cordis-surface -->
