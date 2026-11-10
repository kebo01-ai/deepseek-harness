---
description: "Use and debug the experimental Web agent-organization roster, live member status, and member navigation panel."
kind: "package-reference"
---

# @deepseek-ai/dsh-experimental-client-ui-agent-org

English | [中文](README.zh.md)

## Summary

This package adds an organization action to the Web conversation header, where a user can see every organization the viewed Session belongs to, read each member's currently observed activity, and navigate into a member's conversation. Membership comes from the registry's one global Remote read; activity comes from the browser's own session stores, because the registry never reconciles its rows against live Sessions. Choose it through a profile that already carries the Host-side organization registry. The browser projection stores no organization state and registers no model-facing input.

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

Install the package after the stable Web bundle and the Host-side [`@deepseek-ai/dsh-experimental-agent-org`](../agent-org/README.md) registry. The Web Client loader mounts the `/client` export; the root Host export is inert, and the package has no user configuration fields.

### Read the roster

Opening the panel calls `agentOrgs/list`, which answers with the whole registry, and the panel keeps the organizations whose roster names the viewed Session. Each row shows the member's role, a shortened Session id, the row's join instant as a tooltip, and the activity this browser can currently observe. Activity comes from the Session list the Host already keeps, so it tracks that store live without a second panel open.

### Navigate to a member

Selecting a member opens its conversation. Only a member the Session list already carries a row for is selectable; the navigation layer resolves that id's own address, including the direct-parent subagent address when the member is a continuable child. A member with no row is reported `unobserved` and offered no target. Navigation is abandoned when the user has moved to another conversation, which the panel checks by asking whether the viewed Session still holds the main view.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

The Client export mounts the generated `ctx.remote.agentOrgs` contribution from [`@deepseek-ai/dsh-experimental-agent-org/remote`](../agent-org/README.md), then registers its locale dictionaries and one conversation-header slot through Cordis effects. Disposing the plugin fiber removes both registrations.

The organization listing is addressed by the viewed Session's own membership rows rather than by walking the single parent edge, which is what lets one worker appear under several organizations at once. An organization whose roster claims no manager still lists its members on the same terms as any other: membership itself grants no address.

Activity resolution reads the Session list, whose rows are the Host's catalog entries plus retained subagent fallbacks, and reports `unobserved` when the member has no row. That third state is distinct from inactivity on purpose: the registry stores membership it does not own and a stored row can name a Session that has already ended.

| File | Role |
|---|---|
| [`src/client/mount.ts`](src/client/mount.ts) | Generated Remote, locale, navigation, and slot registrations |
| [`src/client/OrgAction.tsx`](src/client/OrgAction.tsx) | Roster interaction state and activity resolution |
| [`src/client/locales.ts`](src/client/locales.ts) | English and Chinese panel copy |
| [`src/index.ts`](src/index.ts) | Inert Host entry |

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [Agent organization registry](../agent-org/README.md) — authoritative membership rows, limits, and Remote behavior.
- [Agent organizations subsystem](../../../docs/subsystems/agent-org.md) — the identity, membership, and projection types.
- [Agent Teams Web UI](../client-ui-agent-team/README.md) — the Lead-rooted roster panel this one sits beside.
- [Conversation UI](../../client/ui-conversation/README.md) — the stable header slot and addressed-subagent navigation surface.
- [Experimental packages](../README.md) — incubation status and publication policy.

-----

<a id="model-experience"></a>
## Model Experience

None, as this browser projection registers no model-facing input.

#### KV Cache effect

No direct effect; the organization tools and ordinary conversation submission own any later model-visible use.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **Read-only panel** — the registry's Remote face carries no writing verb, so a user cannot create an organization, add a member, or remove one from here. Those stay with the model-facing [`tool-agent-org`](../tool-agent-org/README.md) tools until a per-reader authority model exists.
- **Snapshot refresh of membership** — membership reloads on panel open and explicit refresh; only member activity tracks the session stores continuously. A membership change made elsewhere appears at the next refresh.
- **Activity is this browser's observation** — a member Session with no list row reports `unobserved`, which is neither a liveness claim nor a failure.
- **Reachability is limited to loaded rows** — a member is navigable only while the Session list carries a row for it. The Client session contract no longer exposes a subagent catalog per parent, so a member that exists on the Host but has not been loaded into this browser's list is unreachable from the panel until something else loads it.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

The panel exists to separate lineage from membership in the user-visible surface: the Agent Teams panel beside it derives its roster from the single parent edge, while this one derives nothing and reads stored rows. Keep that direction when extending it — an address is a navigation detail resolved from the manager row, never the identity of a membership.

</details>

**Runtime invariant:** No companion is published. RPC is authoritative and the package owns only one disposable slot registration.
