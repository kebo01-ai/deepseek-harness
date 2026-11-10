import type { HeroBrandMarkOwnerProps } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { SidebarBrandMarkOwnerProps } from '@deepseek-ai/dsh-client-ui-sidebar/client'
import { BRAND_NAME } from '../brand.ts'
import {
  MARK_BRACKETS, MARK_CURSOR, MARK_STROKE_WIDTH, MARK_VIEWBOX,
} from '../mark-geometry.ts'
import { MARK_ATTRIBUTE, WORDMARK_ATTRIBUTE } from './attributes.ts'

/**
 * The mark: a bracket pair holding a block cursor.
 *
 * Drawn rather than imported so it scales to any requested edge without an
 * asset request, and so the brackets inherit `currentColor` from whichever
 * surface hosts them while the cursor keeps the accent.
 * @param props - requested square edge.
 * @returns the deployment mark at the requested size.
 */
function Mark({ size }: { size: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox={MARK_VIEWBOX}
      fill="none"
      {...{ [MARK_ATTRIBUTE]: '' }}
      aria-hidden="true"
      focusable="false"
    >
      {MARK_BRACKETS.map(bracket => (
        <path
          key={bracket}
          d={bracket}
          stroke="currentColor"
          strokeWidth={MARK_STROKE_WIDTH}
          strokeLinecap="round"
        />
      ))}
      <rect {...MARK_CURSOR} fill="var(--dsw-static-deepseek-500)" />
    </svg>
  )
}

/**
 * Occupy the sidebar brand mark.
 * @param props - host-supplied mark geometry.
 * @returns the deployment mark.
 */
export function SkinBrandMark({ size }: SidebarBrandMarkOwnerProps) {
  return <Mark size={size} />
}

/**
 * Occupy the blank-session hero mark.
 *
 * The host offers its own geometry class; {@link MARK_ATTRIBUTE} replaces it,
 * for the reason recorded there.
 * @param props - host-supplied mark geometry.
 * @returns the deployment mark.
 */
export function SkinHeroMark({ size }: HeroBrandMarkOwnerProps) {
  return <Mark size={size} />
}

/**
 * Occupy the sidebar brand name.
 *
 * The occupant replaces the stock fallback outright, which is what retires the
 * local-build label and the version tag that rode along with it. Typography
 * lives in the appended skin stylesheet, reached through
 * {@link WORDMARK_ATTRIBUTE}, so this package ships no stylesheet of its own.
 * @returns the deployment wordmark.
 */
export function SkinBrandName() {
  return <span {...{ [WORDMARK_ATTRIBUTE]: '' }}>{BRAND_NAME}</span>
}
