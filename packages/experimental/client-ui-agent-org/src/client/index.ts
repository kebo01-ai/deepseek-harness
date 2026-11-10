/** Browser entry binding the generated organization Remote artifact to its Client UI. */

import agentOrgsRemote from '@deepseek-ai/dsh-experimental-agent-org/remote'
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import { mountAgentOrgUi } from './mount.ts'

export { inject } from './mount.ts'
export type {
  OrgActionInjected, OrgActionProps, OrgActionResult, OrgMemberNavigation,
} from './OrgAction.tsx'
export type { OrgKey } from './locales.ts'

/** Mount the generated organization Remote contribution and its browser UI. */
export async function apply(ctx: ClientContext): Promise<() => Promise<void>> {
  return await mountAgentOrgUi(ctx, agentOrgsRemote)
}
