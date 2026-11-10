/**
 * Deployment skin, host half.
 *
 * Three things the browser half cannot reach by itself: the bundled typefaces
 * (bytes that live in the installed font packages, not in the page bundle),
 * the stylesheet that names them, and the tab icon. All three arrive through
 * one route and two index taps, so no file under `apps/web` changes and an
 * upgrade of the Web app has nothing here to conflict with.
 *
 * Without a web server — the Electron host serves `file://` and the worker
 * deployment ships its own payload — this half registers nothing.
 */

import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-host-webserver'
import { BRAND_NAME } from './brand.ts'
import { collectTypefaces, type Typefaces } from './fonts.ts'
import { faviconDocument, webManifest } from './mark-document.ts'

/** Route prefix the skin answers its own assets on. */
const MOUNT = '/_skin'

/** A year: the font URLs carry a revision segment, so their bytes never change. */
const IMMUTABLE = 'public, max-age=31536000, immutable'

/** Served paths that are not font files. */
const SHEET_PATH = `${MOUNT}/fonts.css`
const ICON_PATH = `${MOUNT}/mark.svg`
const MANIFEST_PATH = `${MOUNT}/app.webmanifest`

/**
 * Point the served document at this skin's icon and manifest.
 *
 * A rewrite rather than an added `<link>`: both stock tags stay in
 * `apps/web/index.html`, and a second icon link would leave the browser
 * choosing between two. The stock document carries one icon link per colour
 * scheme; this skin's mark answers both schemes from inside the SVG, so the
 * scheme-split links collapse into one unconditional link.
 * @param html - the rendered index document.
 * @returns the document with both brand references redirected.
 */
export function retargetBrandLinks(html: string): string {
  let placed = false
  return html
    .replace(/([ \t]*)<link[^>]*rel="icon"[^>]*>(\n?)/gi, (_match, indent: string, newline: string) => {
      if (placed) return ''
      placed = true
      return `${indent}<link rel="icon" type="image/svg+xml" href="${ICON_PATH}" />${newline}`
    })
    .replace(/(<link[^>]*rel="manifest"[^>]*href=")[^"]*(")/i, `$1${MANIFEST_PATH}$2`)
}

/**
 * Answer one skin asset request.
 *
 * Split from the route registration so the font allowlist, the revision
 * segment and the two brand documents are testable without a socket.
 * @param pathname - decoded request pathname.
 * @param typefaces - the collected stylesheet and its file allowlist.
 * @param respond - writes one response: status, headers, body.
 * @param readFont - reads one allowlisted font file from the installed package.
 * @returns a promise for a font response, nothing for the three built documents.
 */
export function answer(
  pathname: string,
  typefaces: Typefaces,
  respond: (status: number, headers: Record<string, string>, body: string | Buffer | undefined) => void,
  readFont: (path: string) => Promise<Buffer>,
): Promise<void> | void {
  if (pathname === SHEET_PATH) {
    respond(200, { 'content-type': 'text/css; charset=utf-8', 'cache-control': IMMUTABLE }, typefaces.css)
    return
  }
  if (pathname === ICON_PATH) {
    respond(200, { 'content-type': 'image/svg+xml', 'cache-control': 'public, max-age=3600' }, faviconDocument())
    return
  }
  if (pathname === MANIFEST_PATH) {
    respond(
      200,
      { 'content-type': 'application/manifest+json; charset=utf-8', 'cache-control': 'public, max-age=3600' },
      webManifest(BRAND_NAME, ICON_PATH),
    )
    return
  }
  // Font names are matched against the allowlist the stylesheet produced, so a
  // request cannot name a path the stylesheet never pointed at.
  const file = typefaces.files.get(pathname.slice(`${MOUNT}/${typefaces.revision}/`.length))
  if (file === undefined || !pathname.startsWith(`${MOUNT}/${typefaces.revision}/`)) {
    respond(404, {}, undefined)
    return
  }
  return readFont(file.path).then((bytes) => {
    respond(200, { 'content-type': file.type, 'cache-control': IMMUTABLE }, bytes)
  })
}

/**
 * Serve the skin's assets and redirect the document's brand references.
 * @param ctx - Host plugin context, which may acquire the web server.
 */
export function apply(ctx: Context): void {
  ctx.inject(['webServer'], (webCtx) => {
    const pending = collectTypefaces(MOUNT)
    webCtx.on('webserver/index-inject', (table) => {
      table.push({
        kind: 'html',
        placement: 'head',
        html: `<link rel="stylesheet" href="${SHEET_PATH}">`,
      })
    })
    webCtx.effect(() => webCtx.webServer.tapIndex(retargetBrandLinks), 'ui-skin: brand links')
    webCtx.effect(() => webCtx.webServer.register({
      kind: 'prefix',
      path: MOUNT,
      handler: async (req, res) => {
        const typefaces = await pending
        await answer(
          new URL(req.url ?? '/', 'http://skin').pathname,
          typefaces,
          (status, headers, body) => { res.writeHead(status, headers); res.end(body) },
          async path => (await import('node:fs/promises')).readFile(path),
        )
      },
    }), 'ui-skin: asset route')
  })
}
