/** Source-safe agent-organization browser registration and Remote mount lifecycle. */

import type { OrgListView } from '@deepseek-ai/dsh-experimental-agent-org/client'
import type {} from '@deepseek-ai/dsh-experimental-agent-org/remote'
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type {} from '@deepseek-ai/dsh-api-session-controller/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-workspace/client'
import type { TypertRemoteContribution } from '@deepseek-ai/dsh-typert-protocol'
import {
  OrgAction, type OrgActionInjected, type OrgActionResult, type OrgMemberNavigation,
} from './OrgAction.tsx'
import { en, NS, zh, type OrgKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Agent-organization roster copy. */
    'agent-org': OrgKey
  }
}

/** Required browser services for RPC, navigation, slots, and localized copy. */
export const inject = ['sessions', 'uiWorkspace', 'remote', 'slots', 'locale']

function registerUi(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'client-ui-agent-org: dictionaries')
  const sessions = ctx.sessions

  const actions: OrgActionInjected = {
    async load(): Promise<OrgActionResult<OrgListView>> {
      return await ctx.remote.agentOrgs.list()
    },
    openMember(request: OrgMemberNavigation): void {
      const { viewingSessionId, memberSessionId } = request
      // Navigation replaces the main view, so abandon a click whose own
      // conversation no longer holds that seat.
      if ((sessions.retainInfo(viewingSessionId).getSnapshot().retainedBy.mainView ?? 0) === 0) return
      if (sessions.list.getSnapshot().byId[memberSessionId] === undefined) return
      // A member row resolves its own direct-parent address during navigation,
      // so a known Session id is the complete target.
      ctx.uiWorkspace.openSession(memberSessionId)
    },
  }

  ctx.slots.inject(
    'conversation.session.header.actions',
    () => ctx.slots.register({
      name: 'conversation.session.header.actions',
      id: 'agent-org',
      order: 21,
      locale: NS,
      inject: () => actions,
    }, OrgAction),
  )
}

/**
 * Mount one generated organization Remote contribution, then register its browser UI.
 * @param ctx - Client Context carrying navigation, locale, slot, and Remote services.
 * @param contribution - generated organization descriptors selected by the browser entry.
 * @returns disposer for both the UI registrations and the Remote namespace.
 */
export async function mountAgentOrgUi(
  ctx: ClientContext,
  contribution: TypertRemoteContribution,
): Promise<() => Promise<void>> {
  const disposeRemote = await ctx.remote.$mount(contribution)
  const ui = ctx.inject(['sessions', 'uiWorkspace', 'remote.agentOrgs', 'slots', 'locale'], registerUi)
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
