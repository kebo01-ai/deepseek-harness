/** The cc-session board: one card per session the workbench board reports. */

import { useCallback, useEffect, useRef, useState } from 'react'
import { IconRefreshOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { CcRosterView, CcSessionRow } from '@deepseek-ai/dsh-experimental-cc-sessions/client'
import { CcSessionCard } from './CcSessionCard.tsx'
import { targetKey, thrownReason } from './face.ts'
import type { CcBoardInjected, CcBoardTranslate, CcPaneOutcome } from './face.ts'
import type { NS } from './locales.ts'
import css from './CcBoardPanel.module.css'

/** Full props of the board panel: root runtime seat, injected operations, copy seat. */
export type CcBoardPanelProps =
  PropsRuntime<'main'> & CcBoardInjected & { t: CcBoardTranslate; locale?: typeof NS }

/** How the latest screen read of each session ended, keyed by {@link targetKey}. */
type Screens = Readonly<Record<string, CcPaneOutcome>>

/**
 * How often a page retries while it knows no cadence. The host serves its
 * cadence inside every answer it gives, including one reporting a board it
 * could not read, so a page lacking one has failed to reach its own host and
 * its retry never reaches the shared board.
 */
const RECOVERY_INTERVAL_MS = 5_000

/**
 * Whole seconds since a moment, for the freshness line.
 * @param since - epoch milliseconds of the read.
 * @returns elapsed whole seconds, never negative.
 */
function agoSeconds(since: number): number {
  return Math.max(0, Math.round((Date.now() - since) / 1000))
}

/**
 * Render the board page and drive its polling.
 *
 * The driver belongs to this component: both tickers are started by effects
 * and cleared on unmount, so leaving the page — by navigating away, closing
 * it, or reloading — ends every read it was making. A hidden tab is treated
 * as left: the board is a shared service and an unwatched page must not keep
 * sweeping it.
 * @param props - injected operations and the copy seat.
 * @returns the page element.
 */
export function CcBoardPanel({ loadRoster, loadPane, send, t }: CcBoardPanelProps) {
  const [view, setView] = useState<CcRosterView | undefined>(undefined)
  const [failure, setFailure] = useState('')
  const [readAt, setReadAt] = useState(0)
  const [paused, setPaused] = useState(false)
  const [hidden, setHidden] = useState(() => document.visibilityState === 'hidden')
  const [screens, setScreens] = useState<Screens>({})
  const rosterBusy = useRef(false)
  const paneBusy = useRef(false)
  const live = useRef(true)
  const rows: readonly CcSessionRow[] = view?.sessions ?? []
  const cadence = view?.cadence
  const running = !paused && !hidden
  // Every roster read hands back a fresh array, so the screen ticker keys off
  // who is on the board rather than off that array's identity: it restarts
  // when the membership changes and keeps ticking when only state moved.
  const roll = rows.map(targetKey).join(' ')
  const held = useRef(rows)
  held.current = rows

  useEffect(() => {
    live.current = true
    return () => { live.current = false }
  }, [])

  const readRoster = useCallback(async (): Promise<void> => {
    if (rosterBusy.current) return
    rosterBusy.current = true
    // A read that threw is stated like any other failure, and the guard is
    // released either way: an escaping rejection would leave the page latched
    // shut for as long as it stays open.
    const outcome = await loadRoster()
      .catch((cause: unknown) => ({ view: undefined, failure: thrownReason(cause) }))
      .finally(() => { rosterBusy.current = false })
    if (!live.current) return
    setFailure(outcome.failure)
    setReadAt(Date.now())
    if (outcome.view !== undefined) setView(outcome.view)
  }, [loadRoster])

  // One roster read per tick, and one immediately so the page is never blank
  // while the first interval elapses. The ticker starts without waiting for a
  // first answer, because a page that only polls once it has read the board
  // never recovers from failing to read it.
  useEffect(() => {
    if (!running) return
    void readRoster()
    const every = cadence?.rosterIntervalMs ?? RECOVERY_INTERVAL_MS
    const timer = window.setInterval(() => { void readRoster() }, every)
    return () => { window.clearInterval(timer) }
  }, [running, readRoster, cadence?.rosterIntervalMs])

  // Screen reads cover exactly the sessions this page is showing, one batch at
  // a time: a slow board delays the next batch instead of accumulating them.
  useEffect(() => {
    const every = cadence?.paneIntervalMs
    if (!running || every === undefined || roll === '') return
    const readPanes = async (): Promise<void> => {
      if (paneBusy.current) return
      paneBusy.current = true
      const targets = held.current.map(row => ({ nodeIp: row.nodeIp, name: row.name }))
      const answers = await Promise.all(targets.map(async target => [
        targetKey(target),
        await loadPane(target).catch((cause: unknown) => ({ text: '', failure: thrownReason(cause) })),
      ] as const)).finally(() => { paneBusy.current = false })
      if (!live.current) return
      setScreens((previous) => {
        const next: Record<string, CcPaneOutcome> = {}
        for (const [key, outcome] of answers) {
          const last = previous[key]
          // A failed read keeps the screen it last got, with the reason stated
          // beside it: a reader needs both the picture that stopped moving and
          // why it stopped. Keys come from this batch alone, so a session the
          // board no longer reports leaves with its screen.
          next[key] = outcome.failure === '' || last === undefined
            ? outcome
            : { text: last.text, failure: outcome.failure }
        }
        return next
      })
    }
    void readPanes()
    const timer = window.setInterval(() => { void readPanes() }, every)
    return () => { window.clearInterval(timer) }
  }, [running, loadPane, cadence?.paneIntervalMs, roll])

  useEffect(() => {
    const onVisibility = (): void => { setHidden(document.visibilityState === 'hidden') }
    document.addEventListener('visibilitychange', onVisibility)
    return () => { document.removeEventListener('visibilitychange', onVisibility) }
  }, [])

  return (
    <div className={css.page} data-cc-board>
      <header className={css.head}>
        <h1 className={css.title}>{t('panel')}</h1>
        <div className={css.facts}>
          {view !== undefined && view.boardUrl !== '' && (
            <span className={css.mono}>{view.boardUrl}</span>
          )}
          {view !== undefined && <span>{rows.length} {t('sessions')}</span>}
          {view !== undefined && view.nodes.length > 0 && (
            <span>{view.nodes.length} {t('nodes')}</span>
          )}
          {view !== undefined && view.scan !== '' && <span>{t('scan')}: {view.scan}</span>}
          {readAt > 0 && <span>{t('freshness', { age: agoSeconds(readAt) })}</span>}
          {paused && <span>{t('paused')}</span>}
        </div>
        <div className={css.controls}>
          <button
            type="button"
            className={css.button}
            onClick={() => { setPaused(previous => !previous) }}
          >
            {paused ? t('resume') : t('pause')}
          </button>
          <button type="button" className={css.button} onClick={() => { void readRoster() }}>
            <IconRefreshOutlineRegular size={12} />
            {t('refresh')}
          </button>
        </div>
      </header>
      {failure !== '' && <p className={`${css.notice} ${css.failure}`}>{t('failed', { reason: failure })}</p>}
      {view?.stale === true && (
        <p className={css.notice}>
          {t('stale')}
          {view.staleAgeS !== undefined && ` · ${t('staleAge', { age: Math.round(view.staleAgeS) })}`}
        </p>
      )}
      {view !== undefined && view.unreachableNodes.length > 0 && (
        <p className={css.notice}>
          {t('unreachable')}: <span className={css.mono}>{view.unreachableNodes.join(' ')}</span>
        </p>
      )}
      {view === undefined && failure === '' && <p className={css.empty}>{t('loading')}</p>}
      {/* A board that answered with no sessions reports an empty board; one
          that could not be read reports nothing, and the stated reason above
          is what the reader needs instead. */}
      {view?.ok === true && rows.length === 0 && <p className={css.empty}>{t('empty')}</p>}
      {rows.length > 0 && (
        <div className={css.grid}>
          {rows.map(row => (
            <CcSessionCard
              key={targetKey(row)}
              row={row}
              screen={screens[targetKey(row)]}
              send={send}
              t={t}
            />
          ))}
        </div>
      )}
    </div>
  )
}
