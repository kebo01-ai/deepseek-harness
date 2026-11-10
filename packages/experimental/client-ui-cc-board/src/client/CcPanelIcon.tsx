/** The sidebar glyph for the cc-session board: a board of panes. */

import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'

/**
 * Draw the board glyph.
 *
 * The sidebar owns the row — its button, label, tooltip and selected
 * styling — and hands this component only the requested edge and whether the
 * board is the panel on screen. Selection is drawn by filling the pane that
 * would be reading: the outline alone reads as the same icon in both states
 * at 16px.
 * @param props - requested square edge and current selection.
 * @returns the glyph element.
 */
export function CcPanelIcon({ size, active }: PropsRuntime<'sidebar.panellist'>) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect x="1.4" y="2.1" width="5.6" height="5" rx="1.2" stroke="currentColor" strokeWidth="1.2" />
      <rect x="9" y="2.1" width="5.6" height="5" rx="1.2" stroke="currentColor" strokeWidth="1.2" />
      <rect x="1.4" y="8.9" width="5.6" height="5" rx="1.2" stroke="currentColor" strokeWidth="1.2" />
      <rect
        x="9"
        y="8.9"
        width="5.6"
        height="5"
        rx="1.2"
        stroke="currentColor"
        strokeWidth="1.2"
        fill={active ? 'currentColor' : 'none'}
      />
    </svg>
  )
}
