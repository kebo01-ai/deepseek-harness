---
description: "Add the published experimental cc-session board page to a Web profile after the Host directory layer."
kind: "package-bundle"
---

# @deepseek-ai/dsh-experimental-cc-sessions-web-profile

English | [中文](README.zh.md)

## Summary

`dsh-experimental-cc-sessions-web-profile` is the published experimental Web layer for the [cc-session directory](../cc-sessions/README.md). Add it after `@deepseek-ai/dsh-web-app` and [`@deepseek-ai/dsh-experimental-cc-sessions-profile`](../cc-sessions-profile/README.md) to get a top-level sidebar entry and the full-page board behind it: one live card per external agent session, with a box that types into it. The row occupies a seat the shipped Web composition leaves empty, so no shipped panel is replaced. Removing either experimental layer leaves the stable base and Web composition unchanged. No shipped Web profile enables it by default.

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

Add the Host and Web cc-session layers to an initialized `web` profile in this order:

```sh
dsh plugin --profile web add @deepseek-ai/dsh-experimental-cc-sessions-profile
dsh plugin --profile web add @deepseek-ai/dsh-experimental-cc-sessions-web-profile
```

The first command supplies the directory, its endpoint and token resolution, and the generated Remote face. The second activates this package's declared patch and its browser presentation. Removing the package with `dsh plugin --profile web remove @deepseek-ai/dsh-experimental-cc-sessions-web-profile` removes the Web layer from the profile's ordered bundle list.

### What you get

The sidebar gains one top-level entry that opens a full page of cards. Each card carries the session's activity word, where the board reaches it, its captured screen, and a composer that types into it. The page owns the polling driver: leaving it, hiding its tab, or pausing it stops every read, which is what a reader expects of closing a page over a shared board. [`@deepseek-ai/dsh-experimental-client-ui-cc-board`](../client-ui-cc-board/README.md) owns those browser interactions and mounts the generated Client Remote namespace used to reach the Host directory, so the browser holds no board credentials.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

The package's runtime content is [`cordis.patch.yml`](cordis.patch.yml). Applied after `dsh-web-app` and the Host directory layer, its single `insert` entry adds the `ui-cc-board` row for `@deepseek-ai/dsh-experimental-client-ui-cc-board`. The inserted Client plugin owns the generated Remote assembly, the sidebar entry, and the page; this static bundle holds no mutable state and installs no runtime invariant.

| File | Role |
|---|---|
| [`cordis.patch.yml`](cordis.patch.yml) | Ordered Web patch containing the `ui-cc-board` row |
| [`src/index.ts`](src/index.ts) | Empty module entry; the patch is the runtime content |
| — | No runtime invariant companion is published; the package carries only a static profile patch. The Remote assembly and the board page own their activation requirements. |

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [Experimental packages](../README.md) — incubation status and publication policy.
- [cc-session Host profile](../cc-sessions-profile/README.md) — the required directory and Remote layer.
- [cc-session board browser UI](../client-ui-cc-board/README.md) — the page, its cards, and its polling driver.
- [Web bundle](../../bundle/web-app/README.md) — the stable browser layer this patch extends.

-----

<a id="model-experience"></a>
## Model Experience

None, as this Web bundle adds no tool and no prompt contribution, and the Host directory it depends on adds none either.

#### KV Cache effect

No direct effect. Nothing on this path reaches a model request.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **Ordered composition** — `dsh-base`, `dsh-web-app`, `dsh-experimental-cc-sessions-profile`, and this package must remain in that order. Without the Host layer the page has nothing to read.
- **Reads stop with the page** — the driver is owned by the open page, by the owner's decision that a shared board must not be polled by a browser nobody is watching. A deployment that wants a background watcher needs a Host-side driver this layer does not provide.
- **Opt-in only** — the package is public, but no shipped Web profile enables either cc-session layer.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
