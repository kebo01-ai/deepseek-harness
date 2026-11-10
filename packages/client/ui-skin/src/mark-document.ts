/**
 * The tab icon and the install manifest, rendered as standalone documents.
 *
 * Both replace a stock file under `apps/web/public` without editing it: the
 * host half points the document's two brand links here instead. The icon is
 * the same geometry the sidebar and hero marks draw, but nothing is inherited
 * in a document the browser loads on its own — no `currentColor` to resolve
 * and no theme attribute to watch — so the ink is stated, and the two
 * surface brightnesses are covered by a `prefers-color-scheme` rule inside
 * the SVG itself.
 */

import { ACCENT, INK_DARK, INK_LIGHT } from './ink.ts'
import {
  MARK_BRACKETS, MARK_CURSOR, MARK_STROKE_WIDTH, MARK_VIEWBOX,
} from './mark-geometry.ts'

/**
 * Render the tab icon.
 * @returns a standalone SVG document carrying its own ink for both surfaces.
 */
export function faviconDocument(): string {
  const brackets = MARK_BRACKETS
    .map(bracket => `<path d="${bracket}" />`)
    .join('')
  const cursor = `<rect x="${MARK_CURSOR.x}" y="${MARK_CURSOR.y}" width="${MARK_CURSOR.width}"`
    + ` height="${MARK_CURSOR.height}" rx="${MARK_CURSOR.rx}" fill="${ACCENT}" />`
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${MARK_VIEWBOX}" fill="none">`
    + '<style>'
    + `.b{stroke:${INK_LIGHT};stroke-width:${MARK_STROKE_WIDTH};stroke-linecap:round}`
    + `@media (prefers-color-scheme:dark){.b{stroke:${INK_DARK}}}`
    + '</style>'
    + `<g class="b">${brackets}</g>${cursor}</svg>`
}

/**
 * Render the install manifest.
 *
 * One icon entry, the SVG the same route serves: it is the only size the mark
 * needs, and `any maskable` lets a launcher both pad it and crop it.
 * @param name - the deployment name shown by the installing browser.
 * @param iconPath - absolute path the icon is served on.
 * @returns the manifest document.
 */
export function webManifest(name: string, iconPath: string): string {
  return `${JSON.stringify({
    name,
    short_name: name,
    start_url: '/',
    display: 'standalone',
    background_color: INK_DARK,
    theme_color: INK_LIGHT,
    icons: [{ src: iconPath, sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' }],
  }, undefined, 2)}\n`
}
