---
description: "Add the published experimental agent-organization roster to a Web profile after the Host layer."
kind: "package-bundle"
---

# @deepseek-ai/dsh-experimental-agent-org-web-profile

English | [中文](README.zh.md)

## Summary

`dsh-experimental-agent-org-web-profile` is the published experimental Web layer for [agent organizations](../agent-org/README.md). Add it after `@deepseek-ai/dsh-web-app` and [`@deepseek-ai/dsh-experimental-agent-org-profile`](../agent-org-profile/README.md) to show the organization roster, live member status, and member navigation in the browser. Removing either experimental layer leaves the stable base and Web composition unchanged. No shipped Web profile enables it by default.

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

Add the Host and Web organization layers to an initialized `web` profile in this order:

```sh
dsh plugin --profile web add @deepseek-ai/dsh-experimental-agent-org-profile
dsh plugin --profile web add @deepseek-ai/dsh-experimental-agent-org-web-profile
```

The first command supplies the organization domain, its generated Remote read, and the model tools. The second activates this package's declared patch and its browser presentation. Removing the package with `dsh plugin --profile web remove @deepseek-ai/dsh-experimental-agent-org-web-profile` removes the Web layer from the profile's ordered bundle list.

### What you get

The conversation header gains the organization roster with each member's live status. Selecting a member opens that Session as a continuable child, so the ordinary conversation page and its composer reach the worker directly. [`@deepseek-ai/dsh-experimental-client-ui-agent-org`](../client-ui-agent-org/README.md) owns those browser interactions and mounts the generated Client Remote namespace used to reach the Host registry.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

The package's runtime content is [`cordis.patch.yml`](cordis.patch.yml). Applied after `dsh-web-app` and the Host organization layer, its single `insert` entry adds the `ui-agent-org` row for `@deepseek-ai/dsh-experimental-client-ui-agent-org`. The inserted Client plugin owns the generated Remote assembly and the roster UI; this static bundle holds no mutable state and installs no runtime invariant.

| File | Role |
|---|---|
| [`cordis.patch.yml`](cordis.patch.yml) | Ordered Web patch containing the `ui-agent-org` row |
| [`src/index.ts`](src/index.ts) | Empty module entry; the patch is the runtime content |
| — | No runtime invariant companion is published; the package carries only a static profile patch. The Remote assembly and roster UI own their activation requirements. |

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [Experimental packages](../README.md) — incubation status and publication policy.
- [Agent organization Host profile](../agent-org-profile/README.md) — the required domain, Remote, and model-tool layer.
- [Agent organization browser UI](../client-ui-agent-org/README.md) — roster, live status, and member-navigation behavior.
- [Web bundle](../../bundle/web-app/README.md) — the stable browser layer this patch extends.

-----

<a id="model-experience"></a>
## Model Experience

Indirectly, through the Host-side organization profile selected alongside this Web layer.

#### KV Cache effect

This Web bundle adds no model request content; the Host-side organization tools own prompt, schema, and cache effects.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **Ordered composition** — `dsh-base`, `dsh-web-app`, `dsh-experimental-agent-org-profile`, and this package must remain in that order.
- **Roster alongside legacy child controls** — stable Web presets still mount continuable Subagent controls inside the preset scope. Top-level Host profile overrides do not replace those scoped registrations, so the organization roster and legacy child controls can both appear until Web has an organization-aware preset.
- **Opt-in only** — the package is public, but no shipped Web profile enables either organization layer.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
