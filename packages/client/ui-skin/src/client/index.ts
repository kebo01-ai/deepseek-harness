/**
 * Deployment skin, browser half.
 *
 * Everything here is additive: the token layer lands as inline custom
 * properties on `body`, the brand occupants fill slots their declaring
 * packages leave empty, and the sheet appended below lands after
 * `dsh-client-ui-theme`'s own sheets (that row is the first UI row and
 * activates immediately), so this layer gets the last word without
 * `!important` and without editing any upstream stylesheet.
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type {} from '@deepseek-ai/dsh-client-ui-theme/client'
import { SkinBrandMark, SkinBrandName, SkinHeroMark } from './Brand.tsx'
import { MARK_ATTRIBUTE, WORDMARK_ATTRIBUTE } from './attributes.ts'
import { SKIN_TOKENS } from './tokens.ts'

const PLUGIN_ID = '@deepseek-ai/dsh-client-ui-skin'

/**
 * The skin's own sheet: a mount sentinel a browser check can read back off
 * `documentElement`, then the two brand surfaces the occupants hand over.
 *
 * The wordmark runs uppercase on wide tracking, a register the stock sheet
 * uses nowhere, so the sidebar reads as a deployment name rather than a
 * product logotype. The mark restates the ink and overflow the hero's own
 * class carried, minus that class's hover sway.
 */
const SKIN_CSS = `:root { --dsh-skin-installed: 1; }
[${WORDMARK_ATTRIBUTE}] {
  font-size: 15px;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  white-space: nowrap;
}
[${MARK_ATTRIBUTE}] {
  display: block;
  overflow: visible;
  color: var(--dsw-alias-label-primary);
}`

/** Required services: the theme runtime and the UI slot registry. */
export const inject = ['theme', 'slots']

/**
 * Apply the token layer, append the skin stylesheet and fill the three brand
 * slots, withdrawing all of it when the row deactivates.
 *
 * The occupants register as one declaration-aware set, so the sidebar pair and
 * the hero mark land together once all three slots are declared and are
 * removed together on teardown.
 * @param ctx - Client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.theme.overrideTokens('skin', SKIN_TOKENS), 'ui-skin: palette')
  ctx.slots.inject('sidebar.brand.mark', () =>
    ctx.slots.inject('sidebar.brand.name', () =>
      ctx.slots.inject('conversation.hero.brand.mark', function* () {
        yield ctx.slots.register({ name: 'sidebar.brand.mark' }, SkinBrandMark)
        yield ctx.slots.register({ name: 'sidebar.brand.name' }, SkinBrandName)
        yield ctx.slots.register({ name: 'conversation.hero.brand.mark' }, SkinHeroMark)
      })))
  if (typeof document === 'undefined') return
  ctx.effect(() => {
    const tag = document.createElement('style')
    tag.dataset.plugin = PLUGIN_ID
    tag.dataset.pluginCss = `${PLUGIN_ID}/skin.css`
    tag.textContent = SKIN_CSS
    document.head.appendChild(tag)
    return () => { tag.remove() }
  }, 'ui-skin: skin stylesheet')
}
