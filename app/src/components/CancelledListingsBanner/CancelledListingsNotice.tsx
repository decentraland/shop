import { useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useCancelledTrades } from '~/hooks/useCancelledTrades'
import { cancelledTradesKind } from '~/lib/cancelled-trades'
import { CANCELLED_LISTINGS_PROMPT, dismissPrompt, isPromptDismissed } from '~/lib/dismissed-prompts'
import { useWallet } from '~/store/wallet'
import { CancelledListingsBanner } from './CancelledListingsBanner'
import * as S from './CancelledListingsBanner.styles'

/** Mounts the banner for a signed-in account with taken-down listings, until it is dismissed. */
export function CancelledListingsNotice() {
  const address = useWallet(s => s.session?.address)
  const { trades, count } = useCancelledTrades()
  const { pathname, search } = useLocation()
  // Keyed by address so switching accounts re-reads that account's choice.
  const [dismissedFor, setDismissedFor] = useState<string | null>(null)

  if (!address || !count) return null
  if (dismissedFor === address || isPromptDismissed(CANCELLED_LISTINGS_PROMPT, address)) return null
  // Already looking at the list the banner points to.
  if (pathname === '/activity' && new URLSearchParams(search).get('section') === 'listings') return null

  function dismiss() {
    dismissPrompt(CANCELLED_LISTINGS_PROMPT, address)
    setDismissedFor(address ?? null)
  }

  return (
    <S.Frame data-route={pathname}>
      <CancelledListingsBanner count={count} kind={cancelledTradesKind(trades)} onDismiss={dismiss} />
    </S.Frame>
  )
}
