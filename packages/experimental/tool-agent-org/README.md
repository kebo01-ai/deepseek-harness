---
description: "Model-facing tools that name one organization, record a running worker Session in it, and read membership back, over the durable agent-org registry."
kind: "package-reference"
---

# @deepseek-ai/dsh-experimental-tool-agent-org

English | [中文](README.zh.md)

## Summary

`dsh-experimental-tool-agent-org` gives a model four tools over `ctx.agentOrgs`: name an organization, record a running worker Session in it, list the organizations the calling Session belongs to, and read one roster. Dispatch and messaging are not re-implemented here — a manager names the group with these tools and then uses the Agent Teams tools to spawn workers and deliver work, so one composition holds one mailbox. The tools write durable membership rows, so the group survives the Session that created it.

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

Add this package where a model must create the group itself instead of having a deployment configure it.

### When to choose it

Choose it when the model is the one that decides a group exists: it names an organization mid-conversation, adds the workers it just spawned, and later reads back who is in it. Leave it out when only host code or a UI creates organizations — the registry is reachable directly from a host row, and these tools add nothing it does not already answer.

### Smallest working setup

<a id="smallest-working-setup"></a>

The tools consume one host service and publish none, so the registry rows go on the host plane and the tool row sits in the agent composition:

```yaml
# host composition — the storage domain plus the organization registry
- name: '@deepseek-ai/dsh-storage'
- name: '@deepseek-ai/dsh-storage-domain'
- name: '@deepseek-ai/dsh-experimental-agent-org'
# agent composition — the model-facing tools
- name: '@deepseek-ai/dsh-experimental-tool-agent-org'
```

The plugin accepts no config: every limit belongs to the registry, and the tool set is fixed.

### The four tools

`org_create` takes a display name, stores one organization, and records the calling Session in it as `manager`. It returns the organization's own id, which is what every later call names.

`org_add_worker` takes that id plus the Session id of a running worker and appends one `worker` row. The Session id is the one `spawn_teammate` and `list_agents` return, so the model passes a value it already holds rather than composing one.

`org_list` answers with every organization the calling Session belongs to, newest first. A worker calling it sees each manager that recruited it.

`org_members` reads one roster in join order, each row carrying its Session id, role, and the instant it was written.

### What success and failure look like

Success looks like `org_create` returning an id with `memberCount` 1, each `org_add_worker` returning the same id with one more member, and `org_members` listing the manager first and the workers in the order they were added. The rows stay readable after the manager Session ends.

Failures are tool errors carrying the registry's own message, never a silent partial write. A Session id no live Agent answers to is refused before any row is written, and the message names the id and points at `spawn_teammate` and `list_agents`. An unknown organization id, a second row for one Session in one organization, an empty or over-long name, and both exhaustion limits are refused by the registry and surface verbatim. A call that carries no Agent is refused by name, because `org_create` and `org_list` are answers about the calling Session.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

This section explains the design decisions behind the tools and points at the code that realizes them; the observable behavior is fully covered in [Use this package](#use-this-package).

### Design philosophy

- **One mailbox per composition.** Creating an organization is the only verb this package adds. Spawning, messaging, and shared tasks stay with `tool-agent-team`, so `pnpm run duplication` has one delivery path to find, not two.
- **The caller is the manager.** `org_create` records the calling Session itself rather than accepting a manager id, so a model cannot name someone else as the manager of a group it just created.
- **A wrong Session id fails at the write.** The registry stores Session ids it does not own and never reconciles them, so the moment a row is written is the only moment a hallucinated id can be refused. `org_add_worker` resolves the id against the live Agents first.

### Source map

| File | Role |
|---|---|
| [`src/index.ts`](src/index.ts) | Plugin entry: the four tool definitions, their output schemas, and the calling-Session and live-Session resolvers |

### Registration plane

The tools register on the composing plane through `ctx.tools.register`, not per Agent scope, because every call reads its caller from the execution metadata rather than from a scoped closure. Each Agent in that composition therefore sees the same four schemas, and disposing the plugin removes them from every assembly.

### Output shape

Each result is compact JSON over a declared value schema, so the compiler checks what the model is promised. `org_create` and `org_add_worker` return the organization without its roster and with a `memberCount`, which is the cheapest proof that the row landed; `org_members` is the separate read for the rows themselves.

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

Read these pages when the package-level contract is not enough.

- [agent-org package](../agent-org/README.md) — the durable registry these tools call, its limits, and its failure codes.
- [tool-agent-team package](../tool-agent-team/README.md) — the spawn, message, and shared-task tools a manager uses after naming the group.
- [Adding a tool](../../../docs/cookbook/adding-a-tool.md) — the tool definition, result, and presentation rules this package follows.

-----

<a id="model-experience"></a>
## Model Experience

### Organization tools

#### What the model sees

Four schemas and no prompt section: `org_create` (a display name), `org_add_worker` (an organization id plus a worker Session id), `org_list` (no parameters), and `org_members` (an organization id). The descriptions carry the whole policy — that an organization owns its own id and outlives the creating Session, that the Session id comes from `spawn_teammate` or `list_agents` and must still be running, and that one Session may be a worker in several organizations but never twice in one. Results are compact JSON: an organization record with `memberCount`, a list of them, or a roster of `sessionId`/`role`/`joinedAt` rows.

#### Token effect

Four tool schemas on every request of the composition that loads the row, and nothing else: the plugin registers no system-prompt section and no Session event of its own. Each call appends one short JSON result whose size is bounded by the registry's `maxOrgs` and `maxMembersPerOrg` limits.

#### KV Cache effect

The schemas join the stable tool list, so loading the row changes the reusable request prefix once and membership changes never do. Results append after that prefix like any other tool result.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

These are current package constraints, not a comparison with other grouping mechanisms.

- **Experimental prototype with no stability promise** — the package is public, but its tool names, parameters, and results can change freely while it incubates.
- **No authority model** — any Agent that holds these tools may create an organization, add a worker to any organization by id, and read any roster. The registry has no authority model yet, and a tool-side check that the executor could bypass would not be enforcement.
- **A manager row is written only by creation** — `org_add_worker` always writes the `worker` role. Recording a second manager, or changing a role, needs the registry directly.
- **No removal and no deletion** — `leave` and `delete` have no tool, so a wrong row stays until host code removes it. The tools that undo a membership wait for the consumer that needs them.
- **The worker must be running when it is added** — the live-Agent check that refuses a hallucinated Session id also refuses an ended one, so a Session cannot be recruited after it stops.
- **No `./invariant` companion** — No runtime invariant companion is published because this package owns no relation: every row it writes belongs to the registry, which is its only observer. A companion here could only re-read what the registry already answers, which [the package invariant rules](../AGENTS.md) reject as an empty check.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

This Dev Note is working context for maintainers and is explicitly non-authoritative.

#### Promotion

Promotion to a product-role group requires reviewing the model-facing contract, limitations, test evidence, release payload, runtime dependents, and a named stable owner, per the [experimental subtree rules](../AGENTS.md).

#### Future directions

Undecided directions include removal and deletion tools, an authority model that distinguishes a manager from a worker at execution, addressing a worker by name instead of by Session id, and whether recruiting an ended Session should be possible at all. None of these are committed.

</details>
