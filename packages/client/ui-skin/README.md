---
description: "Deployment skin for the Web client — brand occupants, theme tokens and typography supplied additively; for maintainers giving a deployment its own identity without editing upstream UI packages."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-skin

English | [中文](README.zh.md)

## Summary

This package carries one deployment's visual identity: the sidebar and hero brand occupants, its colours, typography, tab icon and install manifest. Every surface it changes is supplied additively — a slot occupant, a theme-token override, a stylesheet appended after the theme package's own sheets, or one route the node half serves — so a deployment can look like itself without editing `dsh-client-ui-theme`, `dsh-client-ui-sidebar`, `dsh-client-ui-conversation` or anything under `apps/web`. Mount it from a profile patch; leave it out and the shell renders its shipped fallbacks. It holds no runtime state and nothing here reaches a model request.

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

Insert the row at the end of a Web profile's patch, so the sheet this package appends lands after the theme package's sheets:

```yaml
- insert:
    - id: ui-skin
      name: '@deepseek-ai/dsh-client-ui-skin'
```

The row resolves from wherever the profile directory can resolve it, so a deployment may keep the package beside its profile instead of inside the product's dependency tree.

### Name the deployment

The product name has one home, `src/brand.ts`, which reads `DSH_CLIENT_BRAND_NAME` and falls back to `Harness`. The browser bundle inlines that variable when it is built; the node half reads it from the server's own environment. A deployment that overrides the name must therefore set it in both places — in the client build and for the host process — or the sidebar and the install manifest will disagree. The browser tab's title is a separate build-environment value, `DSH_CLIENT_TITLE`, owned by `apps/web`.

### What it occupies

The sidebar mark and name, and the conversation hero mark, are slots with shipped fallbacks; registering an occupant replaces the fallback. Colour and font values go through `ctx.theme.overrideTokens()`, which writes inline custom properties on `body` and therefore needs no selector-specificity contest with any upstream sheet.

### What it serves

When a web server is present, the node half answers one route prefix, `/_skin`: the concatenated `@font-face` stylesheet of the installed font packages, the `woff2` files that sheet names, the tab icon, and the install manifest. The font URLs carry a revision segment derived from the stylesheet's digest, so they are served immutable and a font upgrade invalidates them by changing the digest. The stylesheet `<link>` arrives through the `webserver/index-inject` table; the icon and manifest references are repointed by rewriting the served document, because the stock tags stay in `apps/web/index.html` and a second icon link would leave the browser choosing between two.

Without a web server — the Electron host serves `file://`, and the worker deployment ships its own payload — the node half registers nothing.

### What it does not do

There is no configuration surface. A deployment that wants different values edits this package, or composes a different one in its place — one skin row at a time.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

The node half ([`src/index.ts`](src/index.ts)) serves the skin's own assets and taps the served index document; it registers nothing unless a web server is present. [`src/fonts.ts`](src/fonts.ts) reads the installed font packages' stylesheets at first request, keeps only their `woff2` sources, rewrites each relative URL onto the route, and returns the file allowlist the route answers from — so a request cannot name a path the stylesheet never pointed at, and no font bytes are copied into this repository or into the Web bundle. The browser half ([`src/client/index.ts`](src/client/index.ts)) appends its stylesheet inside `ctx.effect()`, so the sheet withdraws when the row deactivates and no partial skin survives a reload. The mark's geometry and the two ink colours live in face-neutral modules ([`src/mark-geometry.ts`](src/mark-geometry.ts), [`src/ink.ts`](src/ink.ts)) that both halves import, so the tab icon cannot drift from the sidebar's.

The package has two compiler faces: [`tsconfig.host.json`](tsconfig.host.json) for the node half, which needs ambient node types, and [`tsconfig.client.json`](tsconfig.client.json) for the browser half, which must not have them.

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

Read these when a surface this package cannot reach needs changing.

- [ui-theme](../ui-theme/README.md) — owns the token tiers this package overrides and the six sheets it appends after.
- [ui-sidebar](../ui-sidebar/README.md) — declares `sidebar.brand.mark` and `sidebar.brand.name`.
- [ui-conversation](../ui-conversation/README.md) — declares `conversation.hero.brand.mark` in the empty hero.
- [ui-brand-official](../ui-brand-official/README.md) — the profile-gated occupant set this package's shape follows.

-----

<a id="model-experience"></a>
## Model Experience

None, as the package contributes browser presentation only; nothing here reaches a model request.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>


These limits describe what a skin can and cannot reach today. They are current composition constraints, not a design backlog.

- **Only slotted surfaces** — text with no slot and no token, such as the empty hero's headline, lives in an upstream locale dictionary and cannot be overridden from here; the locale runtime rejects a duplicate namespace-locale pair.
- **No configuration surface** — values are source, not config, so two deployments with different identities need two packages rather than two config blocks.
- **The boot splash is out of reach** — it renders before any plugin row loads.
- **The name is set twice** — the browser bundle bakes `DSH_CLIENT_BRAND_NAME` at build time and the node half reads it at run time, so a deployment that overrides it must set it in both; only the shared default keeps them equal by itself.
- **Fonts need a web server** — the typefaces reach the page through this package's route, so a deployment that serves the client without one keeps the platform tail of each stack instead.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

The surfaces this package could not reach additively are patched upstream instead, and each patch is accounted for in [skin patches](../../../docs/skin-patches.md) together with the seam that would delete it. Keep that list short: a patch is read by hand on every upgrade.

</details>

**Runtime invariant:** No companion is published. The package retains no mutable state, and its stylesheet installs and withdraws through one effect.
