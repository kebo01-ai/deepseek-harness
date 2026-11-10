/**
 * Skin palette: the token layer handed to `ctx.theme.overrideTokens`.
 *
 * Every entry lands as an inline custom property on `body`, so it outranks the
 * `body` and `body[data-ds-dark-theme]` rules in `dsh-client-ui-theme`'s
 * `design-platform.css` without `!important` and without editing that sheet.
 *
 * Each replacement value carries the CIELAB lightness of the stock value it
 * replaces and a hue rotated to h≈57° — the hue of {@link ACCENT} — with
 * chroma scaled by the same factor across a ladder. Holding lightness fixed
 * keeps every contrast pair a component was designed against, so no consumer
 * needs inspecting; `tests/palette.client.spec.ts` asserts both properties
 * against the stock sheet and fails when an upgrade adds a ladder step this
 * layer does not cover.
 *
 * The alias and specific tokens that paint accent surfaces read the accent
 * ladder through `var()`, in both palettes, so overriding the ladder reaches
 * them. {@link LITERAL_ACCENT_ALIASES} names the one that does not.
 */
import type { ThemeTokenOverrides } from '@deepseek-ai/dsh-client-ui-theme/client'
import { CODE_STACK, TEXT_STACK } from '../families.ts'
import { ACCENT, ACCENT_HOVER, INK_DARK, INK_LIGHT } from '../ink.ts'

export { ACCENT, ACCENT_HOVER }

/**
 * Pair one value for both palettes.
 *
 * The stock sheet declares every `--dsw-static-*` identically in its light and
 * dark blocks — a static names an absolute colour, and the palettes differ by
 * which step their aliases point at. Overrides keep that property.
 * @param value - CSS colour applied in both palettes.
 * @returns The palette pair `overrideTokens` requires.
 */
function both(value: string): { light: string; dark: string } {
  return { light: value, dark: value }
}

/**
 * Warm transposition of the stock accent ladder.
 *
 * Steps 50–200 paint light-palette fills (message bubble, active sidebar row,
 * tertiary state), 400–450 the dark-palette link and button, 500 the
 * light-palette brand, and 800 the dark-palette tertiary fill. Steps 300,
 * 600, 700 and 900 have no current consumer and are covered so that one
 * appearing in an upgrade inherits the skin instead of the stock blue.
 */
export const ACCENT_LADDER: ThemeTokenOverrides = {
  '--dsw-static-deepseek-50': both('#FBEFE7'),
  '--dsw-static-deepseek-100': both('#F9E5D7'),
  '--dsw-static-deepseek-200': both('#F3D4BE'),
  '--dsw-static-deepseek-300': both('#E0B596'),
  '--dsw-static-deepseek-400': both('#D78D5F'),
  '--dsw-static-deepseek-450': both('#CC763D'),
  '--dsw-static-deepseek-500': both(ACCENT),
  '--dsw-static-deepseek-600': both(ACCENT_HOVER),
  '--dsw-static-deepseek-700-delete': both('#6B4228'),
  '--dsw-static-deepseek-800': both('#2A1C12'),
  '--dsw-static-deepseek-900': both('#241810'),
}

/**
 * Warm transposition of both stock neutral ladders.
 *
 * `neutral` is the stock pure grey and `neutral-bluish` its cool-cast sibling;
 * page, surface, border and body-text colours come from one or the other, so
 * leaving either in place keeps a cool cast on screen next to a warm accent.
 */
export const NEUTRAL_LADDERS: ThemeTokenOverrides = {
  '--dsw-static-neutral-00': both('#FFFFFF'),
  '--dsw-static-neutral-50': both('#FBFAF9'),
  '--dsw-static-neutral-100': both(INK_DARK),
  '--dsw-static-neutral-150': both('#F0ECEB'),
  '--dsw-static-neutral-200': both('#E9E4E1'),
  '--dsw-static-neutral-250': both('#E1DBD7'),
  '--dsw-static-neutral-300': both('#DBD3CE'),
  '--dsw-static-neutral-400': both('#AFA19A'),
  '--dsw-static-neutral-500': both('#8E7F77'),
  '--dsw-static-neutral-550': both('#72645C'),
  '--dsw-static-neutral-600': both('#5F534B'),
  '--dsw-static-neutral-700': both('#443A35'),
  '--dsw-static-neutral-800': both(INK_LIGHT),
  '--dsw-static-neutral-850': both('#25201E'),
  '--dsw-static-neutral-900': both('#110F0D'),
  '--dsw-static-neutral-1000': both('#000000'),
  '--dsw-static-neutral-bluish-00': both('#FFFFFF'),
  '--dsw-static-neutral-bluish-50': both('#FBFAF9'),
  '--dsw-static-neutral-bluish-60': both('#F7F6F5'),
  '--dsw-static-neutral-bluish-75': both('#F5F2F1'),
  '--dsw-static-neutral-bluish-100': both('#F0EDEB'),
  '--dsw-static-neutral-bluish-150': both('#EFEBE9'),
  '--dsw-static-neutral-bluish-200': both('#E9E4E1'),
  '--dsw-static-neutral-bluish-300': both('#D9D1CD'),
  '--dsw-static-neutral-bluish-400': both('#BCAFA8'),
  '--dsw-static-neutral-bluish-500': both('#A89A92'),
  '--dsw-static-neutral-bluish-600': both('#918279'),
  '--dsw-static-neutral-bluish-700': both('#71635B'),
  '--dsw-static-neutral-bluish-750': both('#4E433D'),
  '--dsw-static-neutral-bluish-800': both('#3D3430'),
  '--dsw-static-neutral-bluish-850': both('#322B27'),
  '--dsw-static-neutral-bluish-875': both('#27221F'),
  '--dsw-static-neutral-bluish-900': both('#1E1A18'),
  '--dsw-static-neutral-bluish-950': both('#171513'),
  '--dsw-static-neutral-bluish-1000': both('#13100F'),
}

/**
 * Accent aliases that carry text.
 *
 * {@link ACCENT} against white reaches 3.70:1 — enough for a mark or an icon,
 * short of the 4.5:1 WCAG AA asks of body text. The light palette therefore
 * points the link and the filled button, the two accent surfaces that carry a
 * label, at {@link ACCENT_HOVER} (4.88:1) and hovers toward {@link ACCENT},
 * keeping the stock direction where hover is the lighter step. The stock blue
 * reached 4.23:1 in the same places, so this is the compliant side of the
 * change, not a trade against it. Each dark value restates the ladder step the
 * stock dark palette references, because an inline override replaces the
 * declaration in both palettes at once.
 */
export const TEXT_BEARING_ACCENT_ALIASES: ThemeTokenOverrides = {
  '--dsw-alias-link': { light: ACCENT_HOVER, dark: '#D78D5F' },
  '--dsw-alias-button-info-fill': { light: ACCENT_HOVER, dark: '#D78D5F' },
  '--dsw-alias-button-info-hover': { light: ACCENT, dark: ACCENT },
}

/**
 * Accent aliases the ladder cannot reach.
 *
 * The stock light palette declares the brand alias as an `rgb()` literal
 * rather than a reference, so overriding the ladder leaves it blue. The
 * dark palette does reference step 450, but an inline override replaces the
 * declaration in both palettes at once, so the dark value restates that step.
 */
export const LITERAL_ACCENT_ALIASES: ThemeTokenOverrides = {
  '--dsw-alias-brand-primary-new-colorprimary-new-color': { light: ACCENT, dark: '#CC763D' },
}

/**
 * The two font stacks the whole client reads.
 *
 * `dsh-client-ui-theme`'s `base.css` declares both on `:root`, with a fallback
 * copy in `dsh-client-web`'s own `base.css`. An inline property on `body`
 * replaces the inherited value for `body` and everything under it, which is
 * every surface that renders text, so neither sheet needs editing. Identical
 * in both palettes: a typeface is not a colour.
 */
export const FONT_FAMILIES: ThemeTokenOverrides = {
  '--dsw-font-family': both(TEXT_STACK),
  '--ds-font-family-code': both(CODE_STACK),
}

/** Complete skin token layer, in the order it is documented above. */
export const SKIN_TOKENS: ThemeTokenOverrides = {
  ...ACCENT_LADDER,
  ...NEUTRAL_LADDERS,
  ...TEXT_BEARING_ACCENT_ALIASES,
  ...LITERAL_ACCENT_ALIASES,
  ...FONT_FAMILIES,
}
