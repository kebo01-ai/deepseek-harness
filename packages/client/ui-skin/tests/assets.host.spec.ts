/**
 * Host half: the one route that carries the typefaces and the tab icon, and
 * the tap that points the served document at them.
 */
import { readFile, stat } from 'node:fs/promises'
import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import type { IndexInjection, WebRoute, WebServer } from '@deepseek-ai/dsh-host-webserver'
import { BRAND_NAME } from '../src/brand.ts'
import { collectTypefaces, type Typefaces } from '../src/fonts.ts'
import { ACCENT, INK_DARK, INK_LIGHT } from '../src/ink.ts'
import { answer, apply, retargetBrandLinks } from '../src/index.ts'
import { faviconDocument, webManifest } from '../src/mark-document.ts'
import { MARK_BRACKETS, MARK_CURSOR, MARK_VIEWBOX } from '../src/mark-geometry.ts'

const MOUNT = '/_skin'

/** One recorded response: what `answer` wrote, in the order it wrote it. */
interface Written {
  status: number
  headers: Record<string, string>
  body: string | Buffer | undefined
}

/** Call `answer` against the real collected sheet and record the response. */
async function ask(pathname: string, typefaces: Typefaces, reader = readFontBytes): Promise<Written> {
  let written: Written | undefined
  await answer(pathname, typefaces, (status, headers, body) => { written = { status, headers, body } }, reader)
  if (written === undefined) throw new Error(`no response for ${pathname}`)
  return written
}

function readFontBytes(path: string): Promise<Buffer> {
  return readFile(path)
}

/** Structural webServer fake recording the route table and the index taps. */
function fakeWebServer(
  routes: WebRoute[],
  taps: Array<(html: string) => string>,
): Pick<WebServer, 'register' | 'tapIndex'> {
  return {
    register(route) {
      routes.push(route)
      return () => { routes.splice(routes.indexOf(route), 1) }
    },
    tapIndex(transform) {
      taps.push(transform)
      return () => { taps.splice(taps.indexOf(transform), 1) }
    },
  }
}

/** Collect the injection table the way an index render does. */
function collect(ctx: Context): IndexInjection[] {
  const table: IndexInjection[] = []
  ctx.emit('webserver/index-inject', table)
  return table
}

describe('the collected typefaces', () => {
  it('names only woff2 sources, each one a file that exists', async () => {
    const typefaces = await collectTypefaces(MOUNT)
    expect(typefaces.css).not.toMatch(/\.woff\)/)
    expect(typefaces.css).not.toMatch(/format\('woff'\)/)
    expect(typefaces.files.size).toBeGreaterThan(200)
    const sizes = await Promise.all([...typefaces.files.values()].map(async file => (await stat(file.path)).size))
    expect(sizes.every(size => size > 0)).toBe(true)
    expect([...typefaces.files.values()].every(file => file.type === 'font/woff2')).toBe(true)
  })

  it('points every url at this deployment under one revision segment', async () => {
    const typefaces = await collectTypefaces(MOUNT)
    expect(typefaces.css).not.toContain('url(./files/')
    expect(typefaces.revision).toMatch(/^[\w-]{12}$/)
    const urls = [...typefaces.css.matchAll(/url\(([^)]+)\)/g)].map(match => match[1] ?? '')
    expect(urls.length).toBe(typefaces.files.size)
    expect(urls.every(url => url.startsWith(`${MOUNT}/${typefaces.revision}/`))).toBe(true)
    expect(typefaces.css).not.toContain('/REVISION/')
  })

  it('carries all three families at the weights this UI asks for', async () => {
    const typefaces = await collectTypefaces(MOUNT)
    expect(typefaces.css).toContain("font-family: 'IBM Plex Sans Variable'")
    expect(typefaces.css).toContain("font-family: 'IBM Plex Mono'")
    expect(typefaces.css).toContain("font-family: 'Noto Sans SC'")
    expect(typefaces.css).toContain('font-style: italic')
    // Noto Sans SC arrives split by `unicode-range`, which is what keeps a page
    // from paying for the whole family; an unsplit sheet would carry none.
    const ranges = [...typefaces.css.matchAll(/unicode-range:/g)]
    expect(ranges.length).toBeGreaterThan(200)
  })

  it('derives the revision from the sheet, so identical input repeats it', async () => {
    const first = await collectTypefaces(MOUNT)
    const second = await collectTypefaces(MOUNT)
    expect(second.revision).toBe(first.revision)
    const elsewhere = await collectTypefaces('/other')
    expect(elsewhere.revision).not.toBe(first.revision)
  })
})

describe('the asset route', () => {
  it('serves the sheet and the files it names, both immutable', async () => {
    const typefaces = await collectTypefaces(MOUNT)
    const sheet = await ask(`${MOUNT}/fonts.css`, typefaces)
    expect(sheet.status).toBe(200)
    expect(sheet.headers['content-type']).toBe('text/css; charset=utf-8')
    expect(sheet.headers['cache-control']).toContain('immutable')
    expect(sheet.body).toBe(typefaces.css)
    const name = [...typefaces.files.keys()][0]
    const font = await ask(`${MOUNT}/${typefaces.revision}/${name}`, typefaces)
    expect(font.status).toBe(200)
    expect(font.headers['content-type']).toBe('font/woff2')
    expect(font.headers['cache-control']).toContain('immutable')
    expect(Buffer.isBuffer(font.body)).toBe(true)
    expect((font.body as Buffer).subarray(0, 4).toString('latin1')).toBe('wOF2')
  })

  it('answers only names the stylesheet pointed at', async () => {
    const typefaces = await collectTypefaces(MOUNT)
    const name = [...typefaces.files.keys()][0]
    let opened: string | undefined
    const reader = (path: string) => { opened = path; return Promise.resolve(Buffer.alloc(0)) }
    // Right name, wrong revision: the segment is part of the match, so a stale
    // URL misses rather than serving bytes under an immutable header.
    expect((await ask(`${MOUNT}/deadbeefdead/${name}`, typefaces, reader)).status).toBe(404)
    expect((await ask(`${MOUNT}/${name}`, typefaces, reader)).status).toBe(404)
    expect((await ask(`${MOUNT}/${typefaces.revision}/nothing.woff2`, typefaces, reader)).status).toBe(404)
    expect((await ask(`${MOUNT}/${typefaces.revision}/../../etc/passwd`, typefaces, reader)).status).toBe(404)
    expect((await ask(`${MOUNT}/`, typefaces, reader)).status).toBe(404)
    expect(opened).toBeUndefined()
  })

  it('serves the mark and the manifest, both naming this deployment', async () => {
    const typefaces = await collectTypefaces(MOUNT)
    const icon = await ask(`${MOUNT}/mark.svg`, typefaces)
    expect(icon.status).toBe(200)
    expect(icon.headers['content-type']).toBe('image/svg+xml')
    expect(icon.body).toBe(faviconDocument())
    const manifest = await ask(`${MOUNT}/app.webmanifest`, typefaces)
    expect(manifest.status).toBe(200)
    expect(manifest.headers['content-type']).toBe('application/manifest+json; charset=utf-8')
    const parsed = JSON.parse(manifest.body as string) as { name: string; icons: Array<{ src: string }> }
    expect(parsed.name).toBe(BRAND_NAME)
    expect(parsed.icons[0]?.src).toBe(`${MOUNT}/mark.svg`)
  })
})

describe('the tab icon', () => {
  it('draws the same geometry as the rendered mark', () => {
    const svg = faviconDocument()
    expect(svg).toContain(`viewBox="${MARK_VIEWBOX}"`)
    for (const bracket of MARK_BRACKETS) expect(svg).toContain(`d="${bracket}"`)
    expect(svg).toContain(`x="${MARK_CURSOR.x}"`)
    expect(svg).toContain(`height="${MARK_CURSOR.height}"`)
  })

  it('states its own ink for both surface brightnesses', () => {
    const svg = faviconDocument()
    // Nothing is inherited in a document the browser loads on its own, so a
    // missing dark rule leaves the brackets invisible on a dark tab strip.
    expect(svg).toContain(`stroke:${INK_LIGHT}`)
    expect(svg).toContain('@media (prefers-color-scheme:dark)')
    expect(svg.indexOf(INK_DARK)).toBeGreaterThan(svg.indexOf('prefers-color-scheme:dark'))
    expect(svg).toContain(`fill="${ACCENT}"`)
    expect(svg).not.toContain('currentColor')
    expect(svg).not.toMatch(/deepseek|DeepSeek/)
  })

  it('names the deployment in the manifest and nothing upstream', () => {
    const manifest = webManifest('Placeholder', `${MOUNT}/mark.svg`)
    expect(JSON.parse(manifest)).toMatchObject({
      name: 'Placeholder',
      short_name: 'Placeholder',
      icons: [{ type: 'image/svg+xml' }],
    })
    expect(manifest).not.toMatch(/DeepSeek|深度求索/)
    expect(manifest.endsWith('\n')).toBe(true)
  })
})

describe('the brand links', () => {
  it('repoints both stock references in the shipped document', async () => {
    const stock = await readFile(new URL('../../../../apps/web/index.html', import.meta.url), 'utf8')
    expect(stock).toContain('href="/favicon.svg"')
    expect(stock).toContain('href="/manifest.webmanifest"')
    const skinned = retargetBrandLinks(stock)
    expect(skinned).toContain(`href="${MOUNT}/mark.svg"`)
    expect(skinned).toContain(`href="${MOUNT}/app.webmanifest"`)
    expect(skinned).not.toContain('href="/favicon.svg"')
    expect(skinned).not.toContain('href="/manifest.webmanifest"')
    // One icon link, not two: a second would leave the browser choosing.
    expect([...skinned.matchAll(/rel="icon"/g)]).toHaveLength(1)
  })

  it('collapses the stock scheme-split icon pair into one unconditional link', () => {
    const paired = '<head>\n'
      + '    <link rel="icon" type="image/svg+xml" href="/favicon-dark.svg" media="(prefers-color-scheme: dark)" />\n'
      + '    <link rel="icon" type="image/svg+xml" href="/favicon.svg" media="(prefers-color-scheme: light)" />\n'
      + '  </head>'
    const skinned = retargetBrandLinks(paired)
    expect(skinned).toBe('<head>\n'
      + `    <link rel="icon" type="image/svg+xml" href="${MOUNT}/mark.svg" />\n`
      + '  </head>')
    // The skin's mark answers both surfaces from inside the SVG, so a kept
    // media query would hide the icon in the other scheme.
    expect(skinned).not.toContain('prefers-color-scheme')
  })

  it('leaves a document without either reference alone', () => {
    const bare = '<html><head><title>x</title></head><body></body></html>'
    expect(retargetBrandLinks(bare)).toBe(bare)
  })
})

describe('the host plugin', () => {
  it('registers nothing without a web server', async () => {
    const ctx = new Context()
    const fiber = ctx.plugin({ apply })
    await fiber.await()
    expect(collect(ctx)).toEqual([])
    await fiber.dispose()
  })

  it('contributes the route, the tap and the stylesheet row, all withdrawn on teardown', async () => {
    const routes: WebRoute[] = []
    const taps: Array<(html: string) => string> = []
    const ctx = new Context()
    ctx.provide('webServer', fakeWebServer(routes, taps) as WebServer)
    const fiber = ctx.plugin({ apply })
    await fiber.await()
    expect(routes).toEqual([expect.objectContaining({ kind: 'prefix', path: MOUNT })])
    expect(taps).toHaveLength(1)
    expect(taps[0]?.('<link rel="icon" href="/favicon.svg">')).toContain(`${MOUNT}/mark.svg`)
    expect(collect(ctx)).toEqual([{
      kind: 'html',
      placement: 'head',
      html: `<link rel="stylesheet" href="${MOUNT}/fonts.css">`,
    }])
    await fiber.dispose()
    expect(routes).toEqual([])
    expect(taps).toEqual([])
    expect(collect(ctx)).toEqual([])
  })

  it('answers a real request through the registered handler', async () => {
    const routes: WebRoute[] = []
    const ctx = new Context()
    ctx.provide('webServer', fakeWebServer(routes, []) as WebServer)
    const fiber = ctx.plugin({ apply })
    await fiber.await()
    const chunks: Array<string | Buffer> = []
    let status = 0
    let headers: Record<string, string> = {}
    await routes[0]!.handler(
      { url: `${MOUNT}/fonts.css` } as never,
      {
        writeHead(code: number, written: Record<string, string>) { status = code; headers = written },
        end(body: string | Buffer) { chunks.push(body) },
      } as never,
    )
    expect(status).toBe(200)
    expect(headers['content-type']).toBe('text/css; charset=utf-8')
    expect(String(chunks[0])).toContain('@font-face')
    await fiber.dispose()
  })
})
