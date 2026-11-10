---
description: "Add the published experimental cc-session directory to a profile, reading one workbench board over HTTP."
kind: "package-bundle"
---

# @deepseek-ai/dsh-experimental-cc-sessions-profile

English | [中文](README.zh.md)

## Summary

`dsh-experimental-cc-sessions-profile` is the published experimental Host layer for the [cc-session directory](../cc-sessions/README.md). Add it after `@deepseek-ai/dsh-base` to give a deployment read-and-type access to the external agent sessions one workbench board reports. The row offers exactly list, read, and type, so a composition carrying it cannot start, stop, or kill a session the board owns. Removing the layer leaves the stable base composition unchanged. No shipped profile enables it by default.

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

Add this layer to an initialized profile:

```sh
dsh plugin --profile web add @deepseek-ai/dsh-experimental-cc-sessions-profile
```

The command activates this package's declared patch: the `cc-sessions` row and its generated Remote face. Removing the package with `dsh plugin --profile web remove @deepseek-ai/dsh-experimental-cc-sessions-profile` removes the layer from the profile's ordered bundle list.

### Point the layer at a board

The endpoint and token are deployment facts, not defaults. The inserted row reads them per request from the launch environment — `DSH_CC_BOARD_URL` and `DSH_CC_BOARD_TOKEN` — unless a deployment sets `boardUrl`, `boardUrlEnv`, `tokenEnv`, or `tokenFile` in its own patch layer. Reading the token per request is what lets a board rotate it without a restart. An unset endpoint, an unreadable token file, and a board that does not answer each reach the reader as a stated reason rather than as an empty list.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

The package's runtime content is [`cordis.patch.yml`](cordis.patch.yml). Its single `insert` entry adds the `cc-sessions` row. The row takes the directory's shipped cadence and endpoint resolution; a deployment that needs different values sets them in its own patch layer rather than restating the defaults here. This static bundle holds no mutable state and installs no runtime invariant.

| File | Role |
|---|---|
| [`cordis.patch.yml`](cordis.patch.yml) | Ordered Host patch containing the `cc-sessions` row |
| [`src/index.ts`](src/index.ts) | Empty module entry; the patch is the runtime content |
| — | No runtime invariant companion is published; the package carries only a static profile patch. The directory owns its activation requirements. |

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [Experimental packages](../README.md) — incubation status and publication policy.
- [cc-session directory](../cc-sessions/README.md) — endpoint and token resolution, and the three operations.
- [cc-session board Web profile](../cc-sessions-web-profile/README.md) — the browser layer that shows the board.
- [cc-session board browser UI](../client-ui-cc-board/README.md) — the page, its cards, and its polling driver.

-----

<a id="model-experience"></a>
## Model Experience

None, as the inserted row registers no tool and no prompt contribution; it is a host service with a browser-reachable Remote face.

#### KV Cache effect

No direct effect. Nothing this layer adds reaches a model request.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **Ordered composition** — `dsh-base` and this package must remain in that order. The directory reads one board; it does not own the sessions on it.
- **One board per composition** — the row resolves a single endpoint. A deployment watching two boards needs two compositions.
- **Opt-in only** — the package is public, but no shipped profile enables the experimental layer.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
