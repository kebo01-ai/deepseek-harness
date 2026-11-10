/**
 * The attributes the appended skin stylesheet reaches its own elements by.
 *
 * Attributes rather than class names: this package ships no CSS Module, so it
 * has no hashed class to match, and an attribute selector states in one place
 * which elements the sheet owns.
 */

/** Attribute on the sidebar wordmark. */
export const WORDMARK_ATTRIBUTE = 'data-dsh-skin-wordmark'

/**
 * Attribute on the rendered mark.
 *
 * The mark carries its own ink and geometry through this attribute rather than
 * the host class the hero slot offers: that class also carries the stock
 * whale's hover sway, a rotation that reads as a nudge on a bracket pair.
 */
export const MARK_ATTRIBUTE = 'data-dsh-skin-mark'
