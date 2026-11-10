/** One board session: its live screen, its facts, and the box to type into it. */

import { useCallback, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { StateDot } from '@deepseek-ai/dsh-client-ui-primitives'
import type { StateDotState } from '@deepseek-ai/dsh-client-ui-primitives'
import type { CcSessionRow } from '@deepseek-ai/dsh-experimental-cc-sessions/client'
import { targetKey, thrownReason } from './face.ts'
import type { CcBoardSend, CcBoardTranslate, CcPaneOutcome, CcSendOutcome } from './face.ts'
import css from './CcBoardPanel.module.css'

/** Props of one session card. */
export interface CcSessionCardProps {
  /** The board row this card shows. */
  row: CcSessionRow
  /**
   * How the latest per-session read ended, or undefined before the first one
   * lands. A read that failed carries its reason, so a card states why a
   * screen is not moving instead of showing an empty box.
   */
  screen: CcPaneOutcome | undefined
  /** Deliver one keystroke batch to this session. */
  send: CcBoardSend
  /** Localized copy. */
  t: CcBoardTranslate
}

/**
 * The dot state for one board activity word. Only the two words the board is
 * known to emit are styled; anything else stays neutral rather than being
 * guessed into a color.
 * @param state - activity word verbatim from the board.
 * @returns the dot state to render.
 */
function dotOf(state: string): StateDotState {
  switch (state) {
    case 'busy': return 'ongoing'
    case 'idle': return 'idle'
    default: return 'warning'
  }
}

/**
 * Render one session card.
 * @param props - the row, its latest screen, the send operation, and copy.
 * @returns the card element.
 */
export function CcSessionCard({ row, screen, send, t }: CcSessionCardProps) {
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [delivered, setDelivered] = useState(false)
  const [failure, setFailure] = useState('')
  const input = useRef<HTMLTextAreaElement>(null)
  const text = screen?.text ?? ''
  // A read that failed states its reason where the screen would be, and beside
  // a screen it did get earlier, so the reader is never shown a still picture
  // without being told it stopped.
  const unreadable = screen === undefined || screen.failure === ''
    ? ''
    : t('paneFailed', { reason: screen.failure })
  const writable = row.writable && !row.isSelf

  const deliver = useCallback(async (): Promise<void> => {
    if (busy || draft === '') return
    setBusy(true)
    setDelivered(false)
    setFailure('')
    // The button is released however the delivery ends, and a delivery that
    // threw is stated like a refusal: an escaping rejection would leave this
    // card unable to type again.
    const outcome = await send(row, draft)
      .catch((cause: unknown): CcSendOutcome => ({ kind: 'failed', reason: thrownReason(cause) }))
      .finally(() => { setBusy(false) })
    if (outcome.kind === 'sent') {
      setDraft('')
      setDelivered(true)
      input.current?.focus()
      return
    }
    setFailure(outcome.kind === 'refused'
      ? t('refused', { reason: outcome.reason })
      : t('failed', { reason: outcome.reason }))
  }, [busy, draft, row, send, t])

  const onKeyDown = useCallback((event: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return
    event.preventDefault()
    void deliver()
  }, [deliver])

  return (
    <section className={css.card} data-cc-card={targetKey(row)}>
      <header className={css.cardHead}>
        <StateDot state={dotOf(row.state)} size={10} />
        <span className={`${css.name} ${css.mono}`} title={String(row.name)}>{row.name}</span>
        {row.state !== '' && <span className={css.chip}>{row.state}</span>}
        <span className={css.spacer} />
        <span className={`${css.chip} ${css.mono}`}>{row.where === '' ? row.nodeIp : row.where}</span>
        {row.isSelf && <span className={css.chip}>{t('self')}</span>}
      </header>
      {(row.cwd !== '' || row.role !== '') && (
        <div className={css.meta}>
          {row.role !== '' && <span>{t('role')}: {row.role}</span>}
          {row.cwd !== '' && (
            <span className={`${css.metaValue} ${css.mono}`} title={`${t('cwd')}: ${row.cwd}`}>{row.cwd}</span>
          )}
        </div>
      )}
      {/* The capture is bounded at the board, and the stylesheet scrolls what
          arrives, so a long screen cannot push the composer off the card. */}
      <pre className={`${css.screen} ${css.mono} ${text === '' ? css.screenEmpty : ''}`}>
        {text !== '' ? text : (unreadable !== ''
          ? unreadable
          : (screen === undefined ? t('screenWaiting') : t('screenEmpty')))}
      </pre>
      <div className={css.composer}>
        <textarea
          ref={input}
          className={css.input}
          rows={1}
          value={draft}
          disabled={!writable || busy}
          aria-label={t('composerFor', { name: String(row.name) })}
          placeholder={writable ? t('composer') : t('readonly')}
          onChange={(event) => {
            setDelivered(false)
            setDraft(event.target.value)
          }}
          onKeyDown={onKeyDown}
        />
        <button
          type="button"
          className={css.button}
          disabled={!writable || busy || draft === ''}
          onClick={() => { void deliver() }}
        >
          {busy ? t('sending') : t('send')}
        </button>
      </div>
      <p className={css.hint}>
        {delivered
          ? t('sent')
          : (writable ? t('sendHint') : (row.writeBlock === '' ? t('readonly') : row.writeBlock))}
      </p>
      {text !== '' && unreadable !== '' && <p className={css.cardError}>{unreadable}</p>}
      {failure !== '' && <p className={css.cardError}>{failure}</p>}
    </section>
  )
}
