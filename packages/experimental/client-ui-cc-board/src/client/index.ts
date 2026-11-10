/** Browser entry binding the generated cc-session Remote artifact to the board page. */

import ccSessionsRemote from '@deepseek-ai/dsh-experimental-cc-sessions/remote'
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import { mountCcBoardUi } from './mount.ts'

export { inject } from './mount.ts'
export type { CcBoardPanelProps } from './CcBoardPanel.tsx'
export type { CcSessionCardProps } from './CcSessionCard.tsx'
export type {
  CcBoardInjected, CcBoardLoadPane, CcBoardLoadRoster, CcBoardSend, CcBoardTranslate,
  CcPaneOutcome, CcRosterOutcome, CcSendOutcome,
} from './face.ts'
export type { CcBoardKey } from './locales.ts'

/** Mount the generated cc-session Remote contribution and the board page. */
export async function apply(ctx: ClientContext): Promise<() => Promise<void>> {
  return await mountCcBoardUi(ctx, ccSessionsRemote)
}
