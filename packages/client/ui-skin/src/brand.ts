/**
 * The deployment's name, read by both faces.
 *
 * Renaming the product is a change to this one line — the sidebar wordmark,
 * the hero and the install manifest all read from here.
 * `DSH_CLIENT_BRAND_NAME` moves the name into the environment without a source
 * edit: the browser bundle inlines every `DSH_CLIENT_*` variable present when
 * it is built, and the host half reads the same variable from its own process,
 * so a deployment that sets it for the build sets it for the server too. Pair
 * it with `DSH_CLIENT_TITLE`, which the Vite template and the runtime document
 * title read for themselves.
 */

/** Product name shown in the sidebar, the hero and the install manifest. */
export const BRAND_NAME = process.env.DSH_CLIENT_BRAND_NAME ?? 'Harness'
