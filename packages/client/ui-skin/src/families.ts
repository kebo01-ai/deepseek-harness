/**
 * The font stacks this skin installs, shared by the half that serves the faces
 * and the half that points the tokens at them.
 *
 * Both stacks keep the stock platform tail behind the bundled families: a
 * glyph none of the three carries still lands on something installed rather
 * than on the browser's last-resort face. The code stack deliberately omits a
 * bare `monospace`, matching the stock sheet's reason — Windows resolves it to
 * SimSun for CJK.
 */

/** Latin text and UI: IBM Plex Sans, variable weight. */
export const LATIN_FAMILY = 'IBM Plex Sans Variable'

/** Code, digits and anything tabular: IBM Plex Mono. */
export const MONO_FAMILY = 'IBM Plex Mono'

/** Simplified Chinese, reached when the Latin faces have no glyph. */
export const CHINESE_FAMILY = 'Noto Sans SC'

/** Platform faces the stock sheet names, kept as the tail of both stacks. */
const PLATFORM_TAIL = '-apple-system, BlinkMacSystemFont, \'Segoe UI\', \'PingFang SC\', \'Hiragino Sans GB\', \'Microsoft YaHei\', \'Helvetica Neue\', Helvetica, Arial, sans-serif'
const PLATFORM_MONO_TAIL = '\'SF Mono\', \'JetBrains Mono\', \'Fira Code\', Consolas, \'Liberation Mono\', Menlo, Courier, \'PingFang SC\', \'Microsoft YaHei\''

/** Value for `--dsw-font-family`: body and UI text in both scripts. */
export const TEXT_STACK = `'${LATIN_FAMILY}', '${CHINESE_FAMILY}', ${PLATFORM_TAIL}`

/** Value for `--ds-font-family-code`: code, with Chinese comments covered. */
export const CODE_STACK = `'${MONO_FAMILY}', '${CHINESE_FAMILY}', ${PLATFORM_MONO_TAIL}`
