/** Source-safe board-page registration and Remote mount lifecycle. */

import type { Context as ClientContext } from '@deepseek-ai/cordis'
import { brandString } from '@deepseek-ai/dsh-brand'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type { MainPanelId } from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type { TypertRemoteContribution } from '@deepseek-ai/dsh-typert-protocol'
import type { CcSessionTarget } from '@deepseek-ai/dsh-experimental-cc-sessions/client'
import type {} from '@deepseek-ai/dsh-experimental-cc-sessions/remote'
import { CcBoardPanel } from './CcBoardPanel.tsx'
import { CcPanelIcon } from './CcPanelIcon.tsx'
import type { CcBoardInjected, CcPaneOutcome, CcRosterOutcome, CcSendOutcome } from './face.ts'
import { en, NS, zh, type CcBoardKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** cc-session board copy. */
    'cc-board': CcBoardKey
  }
}

/**
 * The nav id and the main-panel key, which are deliberately one string: the
 * sidebar addresses the page it opens by the id of the row that was clicked.
 */
const PANEL_ID: MainPanelId = brandString<MainPanelId>('cc-sessions')

/** Row position among global panels; the shipped composition registers none. */
const PANEL_ORDER = 20

/** Required browser services for RPC, slots, and localized copy. */
export const inject = ['remote', 'slots', 'locale']

/**
 * Render one transport failure as the sentence a page can show.
 * @param result - the failed Remote answer.
 * @returns the error code and message, which never carry the board token.
 */
function stated(result: { readonly error: { code: string; message: string } }): string {
  return `${result.error.code}: ${result.error.message}`
}

function registerUi(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'client-ui-cc-board: dictionaries')
  const t = ctx.locale.bind(NS)
  const board = ctx.remote.ccSessions

  const operations: CcBoardInjected = {
    async loadRoster(): Promise<CcRosterOutcome> {
      const answered = await board.roster()
      if (!answered.ok) return { view: undefined, failure: stated(answered) }
      // The host reports an unreadable board as data: keep its stated reason
      // beside the last list it managed to read instead of blanking the page.
      return { view: answered.value, failure: answered.value.ok ? '' : answered.value.error }
    },
    async loadPane(target: CcSessionTarget): Promise<CcPaneOutcome> {
      const answered = await board.pane(target)
      // A failed transport, a board that refused the read, and a session whose
      // screen is blank are three different answers; collapsing them into an
      // empty string is what leaves a card silently blank.
      if (!answered.ok) return { text: '', failure: stated(answered) }
      const pane = answered.value
      if (!pane.ok) return { text: '', failure: pane.error }
      return { text: pane.text, failure: '' }
    },
    async send(target: CcSessionTarget, text: string): Promise<CcSendOutcome> {
      const answered = await board.send(target, text, true)
      if (!answered.ok) return { kind: 'failed', reason: stated(answered) }
      const outcome = answered.value
      if (outcome.refused !== '') return { kind: 'refused', reason: outcome.refused }
      if (!outcome.ok) return { kind: 'failed', reason: outcome.error }
      return { kind: 'sent', reason: '' }
    },
  }

  ctx.slots.inject(
    'sidebar.panellist',
    () => ctx.slots.register({
      name: 'sidebar.panellist',
      id: PANEL_ID,
      order: PANEL_ORDER,
      label: () => t('panel'),
    }, CcPanelIcon),
  )
  ctx.slots.inject(
    'main',
    () => ctx.slots.register({
      name: 'main',
      key: PANEL_ID,
      locale: NS,
      inject: () => operations,
    }, CcBoardPanel),
  )
}

/**
 * Mount the generated cc-session Remote contribution, then register the board page.
 * @param ctx - Client Context carrying Remote, slot, and locale services.
 * @param contribution - generated cc-session descriptors selected by the browser entry.
 * @returns disposer for both the page registrations and the Remote namespace.
 */
export async function mountCcBoardUi(
  ctx: ClientContext,
  contribution: TypertRemoteContribution,
): Promise<() => Promise<void>> {
  const disposeRemote = await ctx.remote.$mount(contribution)
  const ui = ctx.inject(['remote.ccSessions', 'slots', 'locale'], registerUi)
  try {
    await ui
  } catch (error) {
    await ui.dispose()
    await disposeRemote()
    throw error
  }
  return async () => {
    await ui.dispose()
    await disposeRemote()
  }
}
