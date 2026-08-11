import { useEffect, useRef, useState, type FocusEvent } from 'react'
import { Icon } from '~/components/Icon'
import { t } from '~/intl/i18n'
import { CURRENCY } from '~/lib/currency'
import type { HeldCredits as Held } from '~/lib/credits'
import { CurrencyIcon } from '~/components/CurrencyIcon'
import { Price } from '~/components/Price'
import * as S from './HeldCredits.styles'

// Ties the trigger to the panel for assistive tech; there is only ever one of these on screen.
const PANEL_ID = 'held-credits-panel'

/** mm:ss, never negative. */
function formatRemaining(seconds: number): string {
  const safe = Math.max(0, seconds)
  const mins = Math.floor(safe / 60)
  const secs = safe % 60
  return `${mins}:${String(secs).padStart(2, '0')}`
}

/**
 * The buyer's credits that a purchase has committed but not yet spent.
 *
 * A signed credit cannot be revoked, so the dollars behind one stay committed until it can be proven
 * dead. Until now the only visible consequence was a balance that had quietly shrunk, which is exactly
 * what got reported to us as the Shop taking someone's credits. This is that missing explanation.
 *
 * What it must never do is promise a time.
 *
 * Releasing is gated on the credits squid having processed past the credit's expiry — evidence, not a
 * clock — so there are exactly two honest states. A reservation still inside its TTL has a date and gets
 * a countdown. One that is already expired and STILL held is waiting on chain processing, and there is no
 * date for that: `releasesAtSeconds` is null and the panel says so plainly instead of inventing a time or
 * showing a timer that has run out. What makes the badge disappear is a fresh balance, which `useBalance`
 * polls for while anything is held.
 */
export function HeldCredits({ held }: { held: Held | undefined }) {
  const [open, setOpen] = useState(false)
  // Hover OR keyboard focus: a panel that only opens on hover is a panel a keyboard user cannot reach, and
  // this one is the buyer's only explanation for money missing from their balance.
  const show = () => setOpen(true)
  const hide = () => setOpen(false)
  // Focus moving from the trigger INTO the panel is not leaving. The panel is informational today, so this
  // changes nothing yet — it is what stops a link added to it later from closing the thing it sits in.
  const hideUnlessFocusMovedInside = (e: FocusEvent<HTMLElement>) => {
    if (!rootRef.current?.contains(e.relatedTarget)) hide()
  }
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000))
  const rootRef = useRef<HTMLDivElement>(null)

  const releasesAt = held?.releasesAtSeconds ?? null
  const remaining = releasesAt === null ? 0 : releasesAt - now
  // No date at all, or a date that has already passed while the money is still held: both mean the same
  // thing to the buyer — it is coming back, and we cannot say when.
  const unknown = releasesAt === null || remaining <= 0

  // One ticker, alive only while something is actually held.
  useEffect(() => {
    if (!held) return
    const id = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000)
    return () => clearInterval(id)
  }, [held])

  // Escape closes it, for a keyboard user who opened it by tabbing on. There is no outside-click handler
  // any more: it opens on hover, so leaving is what closes it.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  // The absence of the block is the "nothing held" signal — see the server's `held` field.
  if (!held || held.credits <= 0) return null

  return (
    <S.Root ref={rootRef} data-testid="held-credits" onMouseEnter={show} onMouseLeave={hide}>
      {/* The unit belongs beside the figure: "20 on hold" reads as twenty of something unstated, next to a
          balance counted in credits. */}
      <S.Trigger
        type="button"
        aria-describedby={open ? PANEL_ID : undefined}
        data-testid="held-credits-trigger"
        onFocus={show}
        onBlur={hideUnlessFocusMovedInside}
      >
        <Icon name="clock" size={15} data-held-clock aria-hidden />
        <Price credits={held.credits} />
        <CurrencyIcon size={14} />
        {t('heldCredits.onHoldLabel')}
      </S.Trigger>

      {open ? (
        <S.Panel id={PANEL_ID} role="tooltip" data-testid="held-credits-panel">
          <S.Title>{t('heldCredits.title', { credits: held.credits, currency: CURRENCY.name })}</S.Title>
          <S.Body>
            {t('heldCredits.body', { count: held.purchases.length })}{' '}
            {unknown ? (
              <S.Countdown data-testid="held-credits-unknown">{t('heldCredits.noEstimate')}</S.Countdown>
            ) : (
              <span>
                {t('heldCredits.backIn')}{' '}
                <S.Countdown data-testid="held-credits-countdown">{formatRemaining(remaining)}</S.Countdown>
              </span>
            )}
          </S.Body>
          {/* The reassurance is the point: nothing is lost and there is nothing for them to do. */}
          <S.Caveat>{unknown ? t('heldCredits.caveatWaiting') : t('heldCredits.caveat')}</S.Caveat>
        </S.Panel>
      ) : null}
    </S.Root>
  )
}
