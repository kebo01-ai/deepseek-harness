# Agent 组织

[English](agent-org.md) | 中文

实验性组织注册表与它的模型工具共用的类型。本页记录来自 [`packages/experimental/agent-org/src/types.ts`](../../packages/experimental/agent-org/src/types.ts) 的字面公开形态；动作、上限与失败码由 [agent-org 包 README](../../packages/experimental/agent-org/README.zh.md) 拥有。

## 身份

`OrgId` 是组织自己的[品牌化](core.zh.md#branded-ids) id，在 create 时生成，并作为记录键存下。它不是从任何会话推导出来的，这正是组织与 [Agent Teams](agent-team.zh.md) 里那个以 Lead 为隐式根的身份模型的分界：组织先于配置它的 manager 会话存在，并比所有加入过它的会话活得更久。

成员的会话 id 始终是它唯一的身份。注册表存的是它并不拥有的会话 id，也从不把它们与活会话对账，因此一条存下来的记录可以指向一个已经结束的会话。

## 成员资格

成员资格是一条显式存储的记录，而不是从 spawn 边反推出来的结论。因此一个会话可以同时在多个组织里持有记录，而且它的角色是按记录来的——它可以在一个组织里当 manager，同时在另一个组织里当 worker。

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

`OrgRole` 是 `manager | worker` 这个封闭的双成员词表。注册表写下调用方点名的那个角色，并不由它推导出任何权限；需要区分两者的消费者自己去强制这条区分。

## 投影

每次读取回答的都是一份脱离存储的投影，按加入顺序带着名册。两个时间戳都是 ISO-8601 时刻；`updatedAt` 在成员资格或名字变化时推进，读取时永不推进。

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

显示名不唯一，因此名字永远不能用来指代一个组织。create 之后的每一次调用都点名 `OrgId`。

## 存储

记录存放在 [storage domain](storage.zh.md) 数据形式之上的 `agent_org` 域里，只有一张以 `OrgId` 为键的 `orgs` 表。该域不声明任何全局顺序槽：注册表顺序由 `createdAt` 推导、以 id 作为并列时的决胜，这让创建与删除一个组织各自只是一次表写入。

## Remote 读取

浏览器通过一个生成出来的 Remote 方法读组织，而这次读取是全局的。组织并不按会话划分，所以没有哪个会话可以用来给这次读取划范围；注册表回答的是整个注册表，由消费方自己挑。没有会写的 Remote 动词，因为这里没有任何东西能判定某个读取方可以改哪些组织。

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

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.zh.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

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

Types: [SessionId](core.zh.md)

Source: [`packages/experimental/agent-org/src/index.ts`](../../packages/experimental/agent-org/src/index.ts)
<!-- END GENERATED cordis-surface -->
