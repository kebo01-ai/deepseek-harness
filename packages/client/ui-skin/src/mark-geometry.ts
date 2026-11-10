/**
 * The mark's geometry, shared by the two surfaces that draw it.
 *
 * The browser half renders these as React elements inheriting `currentColor`;
 * the host half renders the same numbers into a standalone document for the
 * tab icon, where nothing is inherited and the ink has to be stated. One copy
 * of the numbers keeps the two from drifting.
 */

/** Coordinate system both renderings draw in. */
export const MARK_VIEWBOX = '0 0 24 24'

/** Bracket stroke width, in viewBox units. */
export const MARK_STROKE_WIDTH = 1.9

/** The two bracket strokes, left then right. */
export const MARK_BRACKETS = [
  'M9.2 3.2H6a2.8 2.8 0 0 0-2.8 2.8v12a2.8 2.8 0 0 0 2.8 2.8h3.2',
  'M14.8 3.2H18a2.8 2.8 0 0 1 2.8 2.8v12a2.8 2.8 0 0 1-2.8 2.8h-3.2',
] as const

/** The block cursor the brackets hold. */
export const MARK_CURSOR = { x: 10.6, y: 7.2, width: 2.8, height: 9.6, rx: 0.6 } as const
