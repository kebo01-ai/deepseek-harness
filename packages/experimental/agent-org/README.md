---
description: "Durable named agent organizations with explicit many-to-many Session membership, for deployments where an organization must outlive the Session that configured it."
kind: "package-reference"
---

# @deepseek-ai/dsh-experimental-agent-org

English | [中文](README.zh.md)

## Summary

`dsh-experimental-agent-org` stores named organizations of agent Sessions. An organization owns its own id, so it exists before the manager Session that configures it and remains after every joined Session has ended. Membership is an explicit stored row — `(organization, Session, role)` — not something read back from a spawn edge, so one worker Session can belong to several organizations at once. The registry answers cross-Session reads, which is why it belongs to the host composition; it provides no tools and no UI. It is published under its experimental name, carries no stability promise, and needs the storage domain to activate.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Further Exploration](#further-exploration)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

Add this package to a host composition when agent Sessions must be grouped under a name that is not one of their Sessions, and when a Session may belong to more than one such group.

### When to choose it

Choose it when the group has to survive its creator: a manager Session configures an organization, dispatches work, and ends, while the organization and its roster remain readable. Choose it when one worker Session is dispatched by two managers and must appear in both rosters.

`@deepseek-ai/dsh-experimental-agent-team` is the sibling to choose instead when the group is exactly one Session's helpers: a Team's identity *is* its Lead Session, and it carries the durable mailbox, the shared task board, and the roster UI this package does not have. The two compose — an organization names and outlives the group, and Team delivers the messages inside it.

### Smallest working setup

<a id="smallest-working-setup"></a>

The registry is a host row and needs the storage domain:

```yaml
# smallest organization setup — the storage domain plus the registry
- name: '@deepseek-ai/dsh-storage'
- name: '@deepseek-ai/dsh-storage-domain'
- name: '@deepseek-ai/dsh-experimental-agent-org'
```

All limits are optional and validated at startup, before the domain is opened:

| Field | Default | Meaning |
|---|---|---|
| `maxOrgs` | `64` | Maximum simultaneously stored organizations |
| `maxMembersPerOrg` | `32` | Maximum membership rows in one organization |
| `maxNameLength` | `120` | Maximum display-name length in code units |

The generated [configuration catalog](../../../docs/config-catalog.md#deepseek-aidsh-experimental-agent-org) is the exhaustive source for every accepted field and its JSDoc.

### Organizations

`create(name)` stores one empty organization and returns it with its own id. The name is a display label: it is trimmed, it may not be empty, and it is not unique, so two organizations may legitimately carry the same one. `get(id)` reads one, `list()` reads all of them newest first, and `delete(id)` removes one organization together with its whole roster.

Deleting an organization does not touch the Sessions it named. It removes the grouping, not the work those Sessions did, and a Session that belonged to two organizations keeps the other one.

### Membership

`join(organization, session, role)` appends one row; `leave(organization, session)` removes it. A role is `manager` or `worker` and belongs to the row, not to the Session, so the same Session can manage one organization while working in another.

`membersOf(organization)` returns one roster in join order, each row stamped with the instant it was written. `orgsOf(session)` is the many-to-many read: every organization that Session belongs to. Both return detached copies, so a caller that mutates the returned array does not reach the stored record.

### What success and failure look like

Success looks like a `create` returning an id and an empty roster, `join` returning the organization with one more row, and both reads still answering after the manager Session has ended and after the process has restarted over the same medium.

Failures are typed, never silent. An unknown id is `ORG_NOT_FOUND` on the operations that need a record and a plain `undefined` or `false` on `get` and `delete`. A second row for one Session in one organization is `ORG_ALREADY_MEMBER`; removing a Session that holds no row is `ORG_NOT_MEMBER`. An empty or over-long name is `ORG_INVALID_NAME`, and the two exhaustion cases are `ORG_LIMIT_REACHED` and `ORG_MEMBER_LIMIT_REACHED`. A limit that is not a positive safe integer is `ORG_INVALID_CONFIG`, raised while the plugin loads rather than on first use.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

This section explains the design decisions behind the service and points at the code that realizes them; the observable behavior is fully covered in [Use this package](#use-this-package).

### Design philosophy

The registry rests on one separation and two commitments:

- **Identity before membership.** The organization's id is its own, not a brand over a Session id. That one choice is what lets the record outlive its manager and lets a Session hold rows in several organizations.
- **Membership is stored, not derived.** A row is written by an explicit verb. Nothing reads a parent-Session edge to infer who belongs where, so lineage and membership can disagree without either being wrong.
- **One write per change.** Every verb is a single record write on the domain's write chain, so there is no second write to diverge from and no recovery marker to interpret.

### Source map

| File | Role |
|---|---|
| [`src/index.ts`](src/index.ts) | Plugin entry: `Config` schema, limit validation, service registration, and every verb |
| [`src/spec.ts`](src/spec.ts) | The durable domain declaration and the zod schema validating the stored format |
| [`src/types.ts`](src/types.ts) | Public identities, roles, and detached projections |
| [`src/error.ts`](src/error.ts) | `OrgError` and the closed set of failure codes |

### Records and ordering

One organization is one `orgs` table record keyed by its id, holding the display name, the roster in join order, and two ISO-8601 instants. The domain declares no global slot: registry order is derived from `createdAt` with the id as a stable tiebreak, so `create` and `delete` are each one table write. A stored order singleton would make both of them two writes that can diverge, and it only earns its recovery marker for an order a person can rearrange — which this registry does not offer.

The record names Sessions it does not own. A row survives the Session it names, and nothing here reconciles a row against live Sessions; that belongs to the consumer that can observe them.

### Durability model

`Service.init` opens the domain and hands its close to the owning fiber through `ctx.effect`, so disposing the plugin closes the domain. Reads answer from the domain's in-memory snapshot. `create` and `delete` write the record directly; `join` and `leave` go through `KvTable.update()`, whose read-modify-write runs on the domain's single write chain, so a concurrent membership change cannot interleave. Both checks that reject a membership change — the duplicate row and the member limit — are evaluated inside that update callback, which is the operation that makes the decision.

### Limits

The three limits are validated in the constructor, before the domain is opened, so a deployment typo fails at load with `ORG_INVALID_CONFIG` instead of surfacing on the first write. The schema already rejects non-integers from `cordis.yml`; the constructor check also covers a direct `new OrgRegistry(ctx, config)` from host code.

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

Read these pages when the package-level contract is not enough.

- [agent-team package](../agent-team/README.md) — the Lead-rooted sibling that carries the durable mailbox and the shared task board.
- [Storage domain package](../../storage/storage-domain/README.md) — the data form this registry stores its records in.
- [Experimental package decision](../../../.agents/notes/implemented/architecture/2026-08-18-experimental-agent-teams-packages.md) — placement, publication, and dependency isolation for this subtree.

-----

<a id="model-experience"></a>
## Model Experience

None, as the registry adds no tool, prompt section, or Session event and keeps organizations in the storage domain outside every Session log.

#### KV Cache effect

None; the registry appends nothing to any conversation history, so a membership change invalidates no reusable prefix.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

These are current package constraints, not a comparison with other grouping mechanisms.

- **Experimental prototype with no stability promise** — the package is public, but its contracts can change freely while it incubates.
- **No tools of its own** — the registry is reachable from host code and from the generated Remote face. The model-facing surface is the separate [`tool-agent-org`](../tool-agent-org/README.md) package.
- **The Remote face is read-only and global** — `list` answers with every stored organization, because an organization is not scoped to a Session and nothing here can decide which organizations a given browser reader may see. A writing Remote verb waits for that authority model.
- **No `./invariant` companion** — No runtime invariant companion is published because the registry is the only observer of its own records, so there is no second independent observation to diverge from it. A companion here could only re-read the table it just wrote, which [the package invariant rules](../AGENTS.md) reject as an empty check.
- **Rows are not reconciled against live Sessions** — a membership row naming an ended Session stays in the roster until something removes it. Nothing here can observe Session liveness.
- **One process** — the registry holds no cross-process lock; two harness processes over one medium are unsupported.
- **No rename and no archive** — a stored name and the set of stored organizations change only through `create` and `delete`.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

This Dev Note is working context for maintainers and is explicitly non-authoritative.

#### Promotion

Promotion to a product-role group requires reviewing the public contract, limitations, test evidence, release payload, runtime dependents, and a named stable owner, per the [experimental subtree rules](../AGENTS.md).

#### Future directions

Undecided directions include a per-reader authority model that would allow writing Remote verbs, reconciling rows against observed Session liveness, rename and archive verbs, and whether a membership-resolving consumer should read N organizations per Session instead of one. None of these are committed.

</details>
