/**
 * The typefaces this deployment carries, read out of the installed font
 * packages at request time.
 *
 * Nothing is copied into the repository or into the Web bundle: each package
 * ships the `@font-face` blocks with the `unicode-range` splits its subsetting
 * produced, and this module hands that stylesheet to the browser with the URLs
 * pointed at the route below. A font upgrade is therefore a version bump, and
 * the Simplified Chinese family keeps the property that makes it affordable —
 * a page pulls only the slices its glyphs fall in, not the 1.1 MB whole.
 *
 * Latin runs on IBM Plex Sans (variable weight), code and digits on IBM Plex
 * Mono, and Chinese on Noto Sans SC at the two weights this UI asks for. All
 * three are OFL-1.1; `THIRD_PARTY_NOTICES.md` carries the attribution because
 * they are declared dependencies rather than vendored bytes.
 */

import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'

/**
 * The stylesheets to concatenate, in cascade order.
 *
 * Plex Sans arrives as one variable face per style rather than one per weight.
 * Plex Mono and Noto Sans SC are static, so each weight the UI uses is named:
 * 400 for body, 500 for the medium runs headings and buttons ask for.
 */
const STYLESHEETS = [
  '@fontsource-variable/ibm-plex-sans/wght.css',
  '@fontsource-variable/ibm-plex-sans/wght-italic.css',
  '@fontsource/ibm-plex-mono/400.css',
  '@fontsource/ibm-plex-mono/500.css',
  '@fontsource/noto-sans-sc/400.css',
  '@fontsource/noto-sans-sc/500.css',
] as const

/** One served font file: the name its stylesheet asks for and where it lives. */
export interface FontFile {
  /** Absolute path inside the installed font package. */
  path: string
  /** MIME type for the response. */
  type: string
}

/** The stylesheet and the files it names, both answerable from one route. */
export interface Typefaces {
  /** Concatenated `@font-face` CSS with every URL pointed at this deployment. */
  css: string
  /** Revision segment of the font URLs: the CSS digest, so a bump busts caches. */
  revision: string
  /** Served file name to its source, the allowlist the route answers from. */
  files: Map<string, FontFile>
}

const require = createRequire(import.meta.url)

/**
 * Collect the installed stylesheets into one sheet plus its file allowlist.
 *
 * Only `woff2` sources survive: every browser this client supports reads it,
 * and dropping the `woff` fallback halves a sheet that carries one `src` per
 * `unicode-range` slice. The URLs are rewritten rather than left relative
 * because the sheet is served from a route, not from the font package's
 * directory.
 * @param mount - absolute route prefix the rewritten URLs point at.
 * @returns the sheet, its revision segment and the files it names.
 */
export async function collectTypefaces(mount: string): Promise<Typefaces> {
  const files = new Map<string, FontFile>()
  const sheets: string[] = []
  for (const specifier of STYLESHEETS) {
    const stylesheet = require.resolve(specifier)
    const packageRoot = dirname(stylesheet)
    const source = await readFile(stylesheet, 'utf8')
    sheets.push(source.replace(/src:\s*([^;]+);/g, (whole, list: string) => {
      const kept = list.split(',')
        .map(entry => entry.trim())
        .filter(entry => entry.includes('.woff2'))
        .map(entry => entry.replace(/url\(\.\/files\/([^)]+)\)/, (_, name: string) => {
          files.set(name, { path: join(packageRoot, 'files', name), type: 'font/woff2' })
          return `url(${mount}/REVISION/${name})`
        }))
      /* v8 ignore next -- every fontsource src list names a woff2 source */
      if (kept.length === 0) return whole
      return `src: ${kept.join(', ')};`
    }))
  }
  const css = sheets.join('\n')
  const revision = createHash('sha256').update(css).digest('base64url').slice(0, 12)
  return { css: css.replaceAll('/REVISION/', `/${revision}/`), revision, files }
}
