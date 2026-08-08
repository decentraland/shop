import { useEffect, useRef, useState } from 'react'
import { t } from '~/intl/i18n'
import { CURRENCY } from '~/lib/currency'
import type { HeldCredits as Held } from '~/lib/credits'
import * as S from './HeldCredits.styles'

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
 * What it must never do is promise a time. `releasesAtSeconds` is the EARLIEST the money can return, not
 * a commitment: a reservation the credits squid cannot yet vouch for is deliberately held past it rather
 * than handed back while a debit is still in flight. So the countdown runs to that figure, and on
 * reaching zero it says "any moment now" rather than claiming the credits are back. What actually makes
 * the badge disappear is a fresh balance, which `useBalance` polls for while anything is held.
 */
export function HeldCredits({ held }: { held: Held | undefined }) {
  const [open, setOpen] = useState(false)
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000))
  const rootRef = useRef<HTMLDivElement>(null)

  const releasesAt = held?.releasesAtSeconds
  const remaining = releasesAt == null ? 0 : releasesAt - now
  const due = remaining <= 0

  // One ticker, alive only while something is actually held.
  useEffect(() => {
    if (!held) return
    const id = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000)
    return () => clearInterval(id)
  }, [held])

  // Close on an outside click, the same way the other sub-nav popovers behave.
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  // The absence of the block is the "nothing held" signal — see the server's `held` field.
  if (!held || held.credits <= 0) return null

  return (
    <S.Root ref={rootRef} data-testid="held-credits">
      <S.Trigger type="button" aria-expanded={open} data-testid="held-credits-trigger" onClick={() => setOpen(o => !o)}>
        {t('heldCredits.badge', { credits: held.credits })}
      </S.Trigger>

      {open ? (
        <S.Panel role="dialog" data-testid="held-credits-panel">
          <S.Title>{t('heldCredits.title', { credits: held.credits, currency: CURRENCY.name })}</S.Title>
          <S.Body>
            {t('heldCredits.body', { count: held.purchases.length })}{' '}
            {due ? (
              <S.Countdown data-testid="held-credits-due">{t('heldCredits.dueNow')}</S.Countdown>
            ) : (
              <span>
                {t('heldCredits.backIn')}{' '}
                <S.Countdown data-testid="held-credits-countdown">{formatRemaining(remaining)}</S.Countdown>
              </span>
            )}
          </S.Body>
          {/* The only honest guarantee in the whole panel, so it is stated rather than implied. */}
          <S.Caveat>{t('heldCredits.caveat')}</S.Caveat>
        </S.Panel>
      ) : null}
    </S.Root>
  )
}
