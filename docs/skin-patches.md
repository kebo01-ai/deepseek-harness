# Deployment skin patches

English | [中文](skin-patches.zh.md)

A deployment that wants its own identity adds [`@deepseek-ai/dsh-client-ui-skin`](../packages/client/ui-skin/README.md) and mounts it from a profile patch. Everything that package can reach — the brand slots, the colour and font tokens, the typefaces, the tab icon, the install manifest — costs nothing at upgrade time, because a new directory and a new profile row never conflict. This page lists what it could **not** reach, so the next upstream merge has one place to look instead of discovering each edit in a conflict marker.

The measurement that makes this list worth keeping: `master..upgrade/0.1.7-alpha.2` rewrites 1783 files under `packages/client` and `apps/web` (+98002/−26318), while `ui-brand-official` — a package that contributes the same kind of surface additively — changed zero source lines. Each row below is a line that will be read by hand on an upgrade of that size; each row's **missing seam** is the request that would delete it.

## Patched upstream files

| File | What the skin needed | Missing seam |
|---|---|---|
| [`packages/client/ui-conversation/src/client/locales.ts`](../packages/client/ui-conversation/src/client/locales.ts) | The empty hero's headline, in both locales | The headline is `t('hero.headline')` with no slot, and the locale runtime gives a namespace-locale pair exactly one owner, so a later plugin cannot override one key. Either a slot around the headline or a per-key override would remove this row. |
| [`packages/client/web/src/boot-page.ts`](../packages/client/web/src/boot-page.ts) | The splash wordmark to name the deployment | The splash renders before any plugin row loads, so no occupant can reach it. It now reads `DSH_CLIENT_BRAND_NAME`, the same build variable the skin's name defaults from, which makes this row a one-line edit rather than a recurring one. |
| [`scripts/gen-third-party-notices.ts`](../scripts/gen-third-party-notices.ts) | OFL-1.1 font packages to pass the runtime-license gate | The gate recognized permissive code licenses and one identity-scoped owner authorization, with no category for a dependency that ships assets rather than code. The added `isAssetOnly` admits the font license without reclassifying it as permissive. |
| [`scripts/package-dependency-policy.ts`](../scripts/package-dependency-policy.ts) | The three font packages to stay runtime dependencies | A Client-faced package's external dependencies are browser build inputs, so the policy required them to be `devDependencies`-only. The skin's host half resolves the installed font packages by path and serves files out of them, and no static import names them, so the added `hostRuntimeAssetDependencies` records that relationship per package. A gate that could see a path resolution as a runtime use would remove this row. |

Tests and recorded output follow the copy change rather than being patched for their own sake: [`packages/client/ui-conversation/tests/skeleton.client.spec.tsx`](../packages/client/ui-conversation/tests/skeleton.client.spec.tsx), [`packages/client/web/tests/boot-page.client.spec.ts`](../packages/client/web/tests/boot-page.client.spec.ts), [`scripts/gen-third-party-notices.spec.ts`](../scripts/gen-third-party-notices.spec.ts), [`scripts/verify-package-dependencies.spec.ts`](../scripts/verify-package-dependencies.spec.ts), five Playwright suites under [`apps/web/tests/`](../apps/web/tests/) that select the hero by its text, and the two `snapshots/web/lifecycle-chrome/` documents that record it.

## Registrations, not patches

Adding any package touches these files; they are listed so an upgrade's conflicts are recognizable rather than surprising, not as a cost the skin could have avoided.

- [`tsconfig.base.json`](../tsconfig.base.json) — the two import paths, as every workspace package declares.
- [`tsconfig.host.json`](../tsconfig.host.json) and [`tsconfig.client.json`](../tsconfig.client.json) — one reference each, as [the project layout](development.md#typescript-project-layout) requires for a package with two compiler faces.
- [`scripts/verify-package-readme-model-experience.ts`](../scripts/verify-package-readme-model-experience.ts) — the one-line sentence contract every package README declares.
- `pnpm-lock.yaml`, [`THIRD_PARTY_NOTICES.md`](../THIRD_PARTY_NOTICES.md), [`docs/module-graph.md`](module-graph.md) and [`packages/extensions/cordis-client-runner/src/client/slot-catalog.ts`](../packages/extensions/cordis-client-runner/src/client/slot-catalog.ts) — generated; regenerate rather than merge.

## Not patched, on purpose

- **`DSH_CLIENT_BUILD_PROFILE` stays unset.** Setting it to `official` wakes `ui-brand-official`, whose occupants would take the three brand slots back.
- **The `ui-settings-models` row stays enabled.** Disabling it would remove the model settings page along with its onboarding notice.
- **No file under `apps/web` is edited.** The tab icon and the install manifest are served by the skin's own route, and the served document's two brand references are repointed by rewriting it on the way out.
- **`CONTRIBUTING.zh.md` keeps its closing line.** It is the repository's own voice, not product UI.
