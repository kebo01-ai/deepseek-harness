/**
 * The skin's colours, named once for both faces.
 *
 * The browser half spends them through the token layer, where every value is a
 * palette pair; the host half spends two of them literally, in the tab icon,
 * where a standalone document has no tokens to read and no theme attribute to
 * watch. Keeping the numbers here is what lets the icon's ink match the
 * sidebar's without a second copy of the hex.
 */

/** Accent fill: the one saturated colour in the skin. */
export const ACCENT = '#C2703A'

/** Accent fill under pointer and keyboard interaction. */
export const ACCENT_HOVER = '#A85E2E'

/** Mark ink on a light surface: the neutral ladder's step 800. */
export const INK_LIGHT = '#2E2824'

/** Mark ink on a dark surface: the neutral ladder's step 100. */
export const INK_DARK = '#F7F5F4'
