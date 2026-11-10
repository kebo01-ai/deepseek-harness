/** Agent-organization roster popover for the conversation header. */

import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { OrgListView, OrgMember } from '@deepseek-ai/dsh-experimental-agent-org/client'
import type { RemoteResult } from '@deepseek-ai/dsh-api-remotes/client'
import {
  IconCloseOutlineRegular, IconRefreshOutlineRegular, IconUserOutlineRegular, StateDot,
  useDismissOnOutsidePointer,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { StateDotState } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import { NS, type OrgKey } from './locales.ts'
import css from './OrgAction.module.css'

/** Carrier result of one organization Remote read. */
export type OrgActionResult<T> = RemoteResult<T>

/** What one member-navigation click knows. */
export interface OrgMemberNavigation {
  /** The conversation the click came from; navigation is abandoned when it no longer holds the main view. */
  readonly viewingSessionId: SessionId
  /** The member Session to open. */
  readonly memberSessionId: SessionId
}

/** Operations the plugin hands this component; the component declares its own call surface. */
export interface OrgActionInjected {
  /** Read the whole registry; an organization is not scoped to a Session, so the read is global. */
  load: () => Promise<OrgActionResult<OrgListView>>
  /** Navigate to one member Session this browser already holds a row for. */
  openMember: (request: OrgMemberNavigation) => void
}

/** Full props of the header entry: runtime seat, injected operations, and the locale seat. */
export type OrgActionProps =
  PropsRuntime<'conversation.session.header.actions'> & OrgActionInjected & PropsLocale<typeof NS>

/** How this browser currently observes one member Session's activity. */
type MemberActivity = 'running' | 'inactive' | 'unobserved'

/** Locale key for one observed activity. */
function activityKey(activity: MemberActivity): OrgKey {
  switch (activity) {
    case 'running': return 'status.running'
    case 'inactive': return 'status.inactive'
    case 'unobserved': return 'status.unobserved'
  }
}

/** Dot state for one observed activity; an unobserved member is idle, never done. */
function activityDot(activity: MemberActivity): StateDotState {
  switch (activity) {
    case 'running': return 'ongoing'
    case 'inactive': return 'done'
    case 'unobserved': return 'idle'
  }
}

/** Short member label: the trailing id segment stays readable at roster width. */
function memberLabel(sessionId: SessionId): string {
  const text = String(sessionId)
  return text.length <= 12 ? text : `…${text.slice(-11)}`
}

/** One roster row: observed activity, role, member label, and its navigation affordance. */
interface MemberRowProps {
  readonly member: OrgMember
  readonly activity: MemberActivity
  readonly isSelf: boolean
  readonly openable: boolean
  readonly onOpen: () => void
  readonly t: OrgActionProps['t']
}

/**
 * Render one membership row.
 * @param props - the row's member, its observed activity, and its affordances.
 * @returns the roster list item.
 */
function MemberRow({ member, activity, isSelf, openable, onOpen, t }: MemberRowProps) {
  const label = (
    <>
      <StateDot state={activityDot(activity)} size={8} />
      <span className={css.role} data-role={member.role}>{t(member.role)}</span>
      <span className={css.memberId} title={`${t('joined')} ${member.joinedAt}`}>
        {memberLabel(member.sessionId)}
      </span>
      <span
        className={css.memberStatus}
        {...activity === 'unobserved' ? { title: t('status.unobserved.hint') } : {}}
      >
        {t(activityKey(activity))}
      </span>
    </>
  )
  return (
    <li className={css.member} data-self={isSelf}>
      {openable
        ? (
          <button type="button" className={css.memberOpen} aria-label={t('open')} onClick={onOpen}>
            {label}
          </button>
        )
        : <span className={css.memberStatic}>{label}{isSelf && <small>{t('self')}</small>}</span>}
    </li>
  )
}

/** Transport or business failure rendered as the registry reported it. */
function failureText(error: { readonly code: string; readonly message: string }): string {
  return `${error.message} (${error.code})`
}

/** One square control of the popover toolbar, named for screen readers by its localized label. */
function ToolbarButton(
  { label, onPress, children }: {
    readonly label: string
    readonly onPress: () => void
    readonly children: ReactNode
  },
) {
  return (
    <button type="button" className={css.iconButton} aria-label={label} onClick={onPress}>
      {children}
    </button>
  )
}

/**
 * Header entry listing the organizations the viewed Session belongs to.
 *
 * Membership comes from the registry's global Remote read, filtered to the
 * viewed Session; activity comes from this browser's own session stores. The
 * registry never reconciles its rows against live Sessions, so a row with no
 * readable observation reports `unobserved` rather than claiming inactivity.
 * @param props - runtime seat, injected operations, and the locale seat.
 * @returns the trigger button and, while open, the roster popover.
 */
export function OrgAction(props: OrgActionProps) {
  const { sessionId, useSessions, load, openMember, t } = props
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [view, setView] = useState<OrgListView | null>(null)
  const [error, setError] = useState<string | null>(null)
  const root = useRef<HTMLDivElement>(null)
  const sessionRef = useRef(sessionId)
  const refreshGeneration = useRef(0)

  const summaries = useSessions(state => state.byId)

  useEffect(() => {
    sessionRef.current = sessionId
    refreshGeneration.current += 1
    setOpen(false)
    setLoading(false)
    setView(null)
    setError(null)
  }, [sessionId])

  useDismissOnOutsidePointer(root, open, setOpen)

  const refresh = useCallback(async (): Promise<void> => {
    const requested = sessionId
    const generation = ++refreshGeneration.current
    setLoading(true)
    const result = await load()
    if (sessionRef.current !== requested || refreshGeneration.current !== generation) return
    setLoading(false)
    if (!result.ok) {
      setError(failureText(result.error))
      return
    }
    setError(null)
    setView(result.value)
  }, [load, sessionId])

  const orgs = (view?.orgs ?? []).filter(org => org.members.some(member => member.sessionId === sessionId))

  /**
   * Activity this browser can currently observe for one member. The Session
   * list carries Host catalog rows plus retained subagent fallbacks, so a
   * member absent from it has no readable observation at all.
   */
  const activityOf = (member: OrgMember): MemberActivity => {
    const summary = summaries[member.sessionId]
    if (summary === undefined) return 'unobserved'
    return summary.running ? 'running' : 'inactive'
  }

  /** Whether this browser holds an address that can open one member's conversation. */
  const openableOf = (member: OrgMember): boolean =>
    member.sessionId !== sessionId && summaries[member.sessionId] !== undefined

  /** Toggle the popover, reading the registry whenever it opens. */
  const toggle = (): void => {
    const next = !open
    setOpen(next)
    if (next) void refresh()
  }

  return (
    <div className={css.root} ref={root} data-org-action>
      <button type="button" className={css.trigger} aria-expanded={open} onClick={toggle}>
        <IconUserOutlineRegular size={14} />
        <span>{t('trigger')}</span>
        {orgs.length > 0 && <span className={css.count}>{orgs.length}</span>}
      </button>
      {open && (
        <div className={css.panel} role="dialog" aria-label={t('trigger')}>
          <div className={css.toolbar}>
            <span className={css.sectionTitle}>{t('trigger')}</span>
            <span className={css.spacer} />
            <ToolbarButton label={t('refresh')} onPress={() => { void refresh() }}>
              <IconRefreshOutlineRegular size={14} />
            </ToolbarButton>
            <ToolbarButton label={t('close')} onPress={() => { setOpen(false) }}>
              <IconCloseOutlineRegular size={14} />
            </ToolbarButton>
          </div>
          {error !== null && <p className={css.error}>{error}</p>}
          {loading && view === null && <p className={css.notice}>{t('loading')}</p>}
          {!loading && error === null && view !== null && orgs.length === 0
            && <p className={css.notice}>{t('empty')}</p>}
          {orgs.map(org => (
            <section className={css.org} key={org.id}>
              <header className={css.orgHead}>
                <span className={css.orgName}>{org.name}</span>
                <span className={css.orgMeta}>{t('roster')}: {org.members.length}</span>
              </header>
              <ul className={css.roster}>
                {org.members.map(member => (
                  <MemberRow
                    key={member.sessionId}
                    member={member}
                    activity={activityOf(member)}
                    isSelf={member.sessionId === sessionId}
                    openable={openableOf(member)}
                    onOpen={() => {
                      openMember({ viewingSessionId: sessionId, memberSessionId: member.sessionId })
                    }}
                    t={t}
                  />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}
