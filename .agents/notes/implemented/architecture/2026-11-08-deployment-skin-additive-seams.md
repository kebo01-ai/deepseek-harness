# Agent Note: A deployment skin that survives an upgrade

Status: implemented

English | [中文](2026-11-08-deployment-skin-additive-seams.zh.md)

## Problem

A deployment that wants its own name, colours and typefaces had nowhere additive to put them. The brand surfaces are a slot pair in the sidebar and one in the conversation hero; everything else — the token ladder the components read, the font declaration, the tab icon, the install manifest, the browser title — lived in upstream files that a deployment would have to edit.

Those edits are not free. `master..upgrade/0.1.7-alpha.2` rewrites 1783 files under `packages/client` and `apps/web` (+98002/−26318). Over the same range `ui-brand-official`, which contributes the same kind of surface through slot occupants, changed zero source lines. An identity carried by upstream edits is re-read by hand on every upgrade of that size; an identity carried by a new directory and a new profile row is not read at all.

`ui-brand-official` could not be reused as-is: its first statement returns unless `DSH_CLIENT_BUILD_PROFILE` is `official`, so it is one identity selected by a build flag rather than one of several a deployment composes.

## Decision

`@deepseek-ai/dsh-client-ui-skin` carries one deployment's visual identity, and every surface it changes is supplied additively: a slot occupant, a theme-token override, a stylesheet appended after the theme package's own sheets, or one route the node half serves. A profile mounts it with a single `- insert:` row at the end of its patch, which puts the appended sheet after the theme's six and gives it the last word without `!important`.

Four tiers, ranked by what an upgrade costs, and a surface descends only when the tier above cannot reach it:

1. **Build-time environment** — any `DSH_CLIENT_*` variable passes through `scripts/client-build-environment.ts` without being registered individually. `DSH_CLIENT_TITLE` owns the browser title; `DSH_CLIENT_BRAND_NAME` is what the package's one name constant defaults from.
2. **This package** — slot occupants, `ctx.theme.overrideTokens()` (inline custom properties on `body`, so no selector-specificity contest), the appended sheet, and one `/_skin` prefix route serving the concatenated `@font-face` sheet, the `woff2` files that sheet names, the tab icon and the install manifest.
3. **Profile overlay** — `- insert:` to add a row, `disabled: true` to retire one. To replace a whole surface, replace the plugin that renders it rather than patching it.
4. **Upstream patch** — last resort, each entry accounted in [skin patches](../../../../docs/skin-patches.md) together with the seam that would delete it.

Three surfaces reached tier 4: the empty hero's headline, because it is `t('hero.headline')` with no slot and the locale runtime gives a namespace-locale pair exactly one owner; the boot splash's wordmark, because the splash renders before any plugin row loads; and the runtime-license gate, which had no category for a dependency shipping assets rather than code.

That last one is a policy change worth naming. `ASSET_ONLY_LICENSES` / `isAssetOnly` admits OFL-1.1 because its obligations bind the font files — they stay under OFL-1.1, carry their notice, and may not be redistributed under a reserved font name — and nothing that ships beside them. It deliberately does not widen `PERMISSIVE_LICENSES`, which would reclassify the license for every future dependency, and does not claim the identity-scoped owner authorization the gate already has.

## Alternatives considered

**Set `DSH_CLIENT_BUILD_PROFILE=official` and edit `ui-brand-official`.** One identity per build rather than one per deployment, and waking it evicts this package's three occupants from the brand slots.

**Fork `dsh-client-ui-theme` and change the tokens at the source.** This moves the 1783-file diff onto the fork and has to be re-resolved every upgrade — the cost the measurement above argues against.

**Ask for a per-key locale override so the hero headline stays additive.** `LocaleRuntime.register` throws on a duplicate namespace-locale pair and `lookup()` takes the first locale in the fallback chain that has the key, so a later plugin cannot own one key of a namespace it did not register. That is an upstream change; the ledger records it as the missing seam instead of pretending the patch was avoidable.

**Copy the `woff2` files into `apps/web/public/fonts/`.** Client-plugin CSS is injected as a string, so a relative `url()` inside it does not resolve against the stylesheet — the reason the route exists. Serving from the route also keeps the font bytes in the installed packages instead of committing them here, and the revision segment derived from the sheet's digest lets them be served immutable while a font upgrade invalidates them.

## Consequences

The identity is verifiable from the browser rather than asserted. Across both themes, none of the 384 enumerated custom properties on `body` resolves to a blue, the three bundled families load from the route with Noto Sans SC fetching only the slices a page hits, the icon and manifest links point at `/_skin`, the title comes from `DSH_CLIENT_TITLE`, and `pageerror` is empty. No file under `apps/web` is edited: the two stock brand links are repointed by rewriting the served document, because a second icon link would leave the browser choosing between two.

Two limits follow from the design. The name is set twice — the browser bundle bakes `DSH_CLIENT_BRAND_NAME` at build time while the node half reads it at run time — so a renaming deployment must set it in both places, and only the shared default keeps them equal by itself. And the typefaces reach the page through the route, so a deployment serving the client without a web server keeps the platform tail of each stack; the node half registers nothing in that case.

The package has no configuration surface. Values are source, so two deployments with different identities need two packages rather than two config blocks — which is the point of making the package cheap to add rather than configurable.
