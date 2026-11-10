---
description: "Add the published experimental agent-organization registry and its model tools to a profile."
kind: "package-bundle"
---

# @deepseek-ai/dsh-experimental-agent-org-profile

English | [中文](README.zh.md)

## Summary

`dsh-experimental-agent-org-profile` is the published experimental Host layer for [agent organizations](../agent-org/README.md). Add it after `@deepseek-ai/dsh-base` and [`@deepseek-ai/dsh-experimental-agent-team-profile`](../agent-team-profile/README.md): the organization registry owns durable membership rows, while delegation and message delivery stay on the Team rows, so one composition keeps exactly one mailbox. Removing either experimental layer leaves the stable base composition unchanged. No shipped profile enables it by default.

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

### Install into a profile

Add the Agent Teams layer and this layer to an initialized profile in this order:

```sh
dsh plugin --profile web add @deepseek-ai/dsh-experimental-agent-team-profile
dsh plugin --profile web add @deepseek-ai/dsh-experimental-agent-org-profile
```

The first command supplies spawning, the durable mailbox, and the shared task board. The second activates this package's declared patch: the organization registry and its four model tools. Removing the package with `dsh plugin --profile web remove @deepseek-ai/dsh-experimental-agent-org-profile` removes the layer from the profile's ordered bundle list.

### What you get

A manager Agent gains `org_create`, `org_add_worker`, `org_list`, and `org_members`. An organization has its own id and name, so its roster outlives the Session that created it, and one Session can hold rows in several organizations at once. Lineage is unchanged: a worker remains the continuable child of the manager that spawned it.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

The package's runtime content is [`cordis.patch.yml`](cordis.patch.yml). Its single `insert` entry adds the `agent-org` row for the registry and the `tool-agent-org` row for the model tools. Both rows take the registry's shipped limits; a deployment that needs different limits sets them in its own patch layer rather than restating the defaults here. This static bundle holds no mutable state and installs no runtime invariant.

| File | Role |
|---|---|
| [`cordis.patch.yml`](cordis.patch.yml) | Ordered Host patch containing the `agent-org` and `tool-agent-org` rows |
| [`src/index.ts`](src/index.ts) | Empty module entry; the patch is the runtime content |
| — | No runtime invariant companion is published; the package carries only a static profile patch. The registry and its tools own their activation requirements. |

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [Experimental packages](../README.md) — incubation status and publication policy.
- [Agent organization registry](../agent-org/README.md) — durable membership rows and the Remote read.
- [Agent organization tools](../tool-agent-org/README.md) — the four model tools this layer installs.
- [Agent Teams Host profile](../agent-team-profile/README.md) — the required spawning, mailbox, and task-board layer.
- [Agent organization Web profile](../agent-org-web-profile/README.md) — the browser layer that shows the roster.

-----

<a id="model-experience"></a>
## Model Experience

### Organization tools

#### What the model sees

The four tool names and schemas belong to [`@deepseek-ai/dsh-experimental-tool-agent-org`](../tool-agent-org/README.md). This layer changes composition only: `org_create` names an organization, `org_add_worker` records one live Session in it as a worker, `org_members` reads one roster back in join order, and `org_list` answers which organizations the calling Session belongs to. Each result is compact JSON. Spawning, messaging, and shared tasks stay with `tool-agent-team`.

#### Token effect

The layer adds the four tool schemas described by `@deepseek-ai/dsh-experimental-tool-agent-org` and no prompt text of its own. Each call appends its own JSON result: a created or joined organization is a few fields, and a roster grows with its member count.

#### KV Cache effect

Installing this layer adds four tool schemas to every request in the composition, which invalidates a prefix cached without them. The layer's composition is prefix-stable while its patch and those schemas remain unchanged.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **Ordered composition** — `dsh-base`, `dsh-experimental-agent-team-profile`, and this package must remain in that order. The organization registry records membership; it does not spawn, deliver, or schedule.
- **One membership per resolver answer** — storage holds `(organization, Session, role)` rows and already accepts one Session in several organizations. The Team roster's resolver still answers with a single membership, so cross-organization delivery waits on that return type.
- **Opt-in only** — the package is public, but no shipped profile enables either experimental layer.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
