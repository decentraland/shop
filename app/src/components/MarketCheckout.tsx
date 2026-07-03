import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import type { Trade } from '@dcl/schemas'
import { useWallet } from '~/store/wallet'
import { useBalance } from '~/hooks/useBalance'
import { fetchTrade, type CatalogItem, type LegacyListing } from '~/lib/api'
import { manaWeiToUsdCents, type ManaRate } from '~/lib/mana-rate'
import { authorizeUsdCredit, cancelUsdIntents } from '~/lib/credits'
import { buyWithCredits } from '~/lib/buy'
import { buyGasless, waitForSettlement, GaslessUnavailableError } from '~/lib/buy-gasless'
import { gaslessEnabled } from '~/lib/gasless-config'

function friendlyError(e: unknown): string {
  const err = e as { code?: number; message?: string }
  const msg = (err.message ?? '').toLowerCase()
  if (err.code === 4001 || msg.includes('reject') || msg.includes('denied') || msg.includes('cancel')) {
    return 'You cancelled the request.'
  }
  if (msg.includes('insufficient')) return 'Not enough credits — get more first.'
  if (msg.includes('not found') || msg.includes('no active listing') || msg.includes('404')) {
    return 'This item was just sold or removed. Refreshing the market…'
  }
  return "Couldn't complete checkout — please try again."
}

// The legacy listing rendered as the CatalogItem shape the Success page + preview expect.
function toCatalogItem(l: LegacyListing): CatalogItem {
  return {
    id: l.tradeId,
    tradeId: l.tradeId,
    name: l.name,
    creator: l.creator,
    contractAddress: l.contractAddress,
    itemId: l.itemId,
    category: l.category,
    wearableCategory: l.wearableCategory ?? undefined,
    rarity: l.rarity,
    network: l.network,
    chainId: l.chainId,
    thumbnail: l.thumbnail,
    priceCredits: 0,
    gender: null
  }
}

type Phase = 'confirm' | 'working' | 'error'

/**
 * Buy Now checkout for a legacy (MANA-priced) listing — a small modal, NOT the cart.
 *
 * The rate is LOCKED at authorize (step 2): the credits-server sizes the MANA at its own oracle read
 * and signs an ephemeral credit with a fixed maxCreditedValue, so settlement can't fail from the rate
 * drifting between browse and buy. Flow:
 *   1) fetch the full signed trade (fetchTrade)
 *   2) authorize the USD amount → signed credit + locked price (usdCents / credits)
 *   3) show the final locked price + Confirm
 *   4) buyWithCredits (or buyGasless when enabled) with the legacy trade + the authorized credit
 *   5) navigate to /success
 * On failure any reserved dollars are released so the balance isn't stuck until the TTL.
 */
export function MarketCheckout({
  listing,
  rate,
  onClose,
  onSold
}: {
  listing: LegacyListing
  rate: ManaRate
  onClose: () => void
  onSold: () => void
}) {
  const { session } = useWallet()
  const { data: balance } = useBalance(session)
  const qc = useQueryClient()
  const navigate = useNavigate()

  const [phase, setPhase] = useState<Phase>('confirm')
  const [status, setStatus] = useState<string>('Locking today’s price…')
  const [error, setError] = useState<string | null>(null)
  // The authorized (LOCKED) purchase: the signed trade, the one-time credit, the MANA cap + the price.
  const [locked, setLocked] = useState<{
    trade: Trade
    credit: Awaited<ReturnType<typeof authorizeUsdCredit>>['credit']
    maxCreditedValue: string
    credits: number
    usdCents: number
  } | null>(null)

  // Indicative (pre-authorize) price to show while we lock the real one.
  const approxCredits = Math.ceil(manaWeiToUsdCents(listing.manaWei, rate) / 10)

  // Step 1 + 2 on open: resolve the trade, authorize, and reserve the dollars → LOCK the price.
  useEffect(() => {
    let cancelled = false
    if (!session) {
      setPhase('error')
      setError('Log in to check out.')
      return
    }
    ;(async () => {
      try {
        const trade = await fetchTrade(listing.tradeId)
        if (!trade) throw new Error('not found')
        const usdCents = manaWeiToUsdCents(listing.manaWei, rate)
        const { credit, maxCreditedValue, usdCents: lockedCents } = await authorizeUsdCredit(
          session.identity,
          usdCents,
          listing.tradeId
        )
        if (cancelled) {
          // Component unmounted before we could show the price — release the reservation.
          void cancelUsdIntents(session.identity, [credit.id]).catch(() => {})
          return
        }
        setLocked({ trade, credit, maxCreditedValue, usdCents: lockedCents, credits: Math.ceil(lockedCents / 10) })
        setStatus('')
      } catch (e) {
        if (cancelled) return
        console.error('[market] authorize failed', e)
        setPhase('error')
        setError(friendlyError(e))
      }
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const needsMoreCredits = !!locked && (balance?.credits ?? 0) < locked.credits

  async function confirm() {
    if (!session || !locked) return
    // Not enough balance for the locked amount → send them to top up (Get credits).
    if (needsMoreCredits) {
      void cancelUsdIntents(session.identity, [locked.credit.id]).catch(() => {})
      navigate('/credits')
      return
    }
    setPhase('working')
    setError(null)
    try {
      setStatus('Confirming your purchase…')
      const buyArgs = {
        trade: locked.trade,
        buyer: session.address,
        signer: session.signer,
        credits: [locked.credit],
        maxCreditedValue: locked.maxCreditedValue
      }
      let txHash: string | undefined
      if (gaslessEnabled()) {
        try {
          txHash = await buyGasless(buyArgs) // buyer confirms off-chain; relayer covers the fee
          await waitForSettlement(txHash)
        } catch (gaslessErr) {
          if (!(gaslessErr instanceof GaslessUnavailableError)) throw gaslessErr
          txHash = await buyWithCredits(buyArgs) // fallback: buyer submits + pays gas
        }
      } else {
        txHash = await buyWithCredits(buyArgs)
      }
      void qc.invalidateQueries({ queryKey: ['usd-balance'] })
      navigate('/success', { state: { items: [toCatalogItem(listing)], txHash } })
    } catch (e) {
      console.error('[market] buy now failed', e)
      // Release the reserved dollars so the balance isn't stuck until the TTL.
      void cancelUsdIntents(session.identity, [locked.credit.id]).catch(() => {})
      void qc.invalidateQueries({ queryKey: ['usd-balance'] })
      const msg = friendlyError(e)
      setError(msg)
      setPhase('error')
      if (/sold or removed/i.test(msg)) onSold()
    }
  }

  function cancel() {
    // Release any reservation we made before the user backed out.
    if (session && locked) void cancelUsdIntents(session.identity, [locked.credit.id]).catch(() => {})
    onClose()
  }

  const busy = phase === 'working'

  return (
    <div className="mkt-modal" role="dialog" aria-modal="true" aria-label={`Buy ${listing.name}`}>
      <div className="mkt-modal__scrim" onClick={busy ? undefined : cancel} aria-hidden />
      <div className="mkt-modal__card">
        <div className="mkt-modal__head">
          <div className="mkt-modal__thumb">{listing.thumbnail ? <img src={listing.thumbnail} alt="" /> : null}</div>
          <div>
            <div className="mkt-modal__name" title={listing.name}>{listing.name || 'Item'}</div>
            <span className="chip chip--rarity">{listing.rarity}</span>
          </div>
        </div>

        <div className="mkt-modal__price">
          {locked ? (
            <>
              <div className="mkt-modal__price-label">Final price</div>
              <div className="mkt-modal__price-value">
                <span className="ico ico-credits mkt-modal__diamond" aria-hidden />
                {locked.credits} credits
              </div>
              <div className="mkt-modal__price-sub muted">Locked for this purchase · ${(locked.usdCents / 100).toFixed(2)}</div>
            </>
          ) : (
            <>
              <div className="mkt-modal__price-label">Today&rsquo;s price</div>
              <div className="mkt-modal__price-value mkt-modal__price-value--approx">
                <span className="mkt-modal__approx" aria-hidden>≈</span>
                <span className="ico ico-credits mkt-modal__diamond" aria-hidden />
                {approxCredits} credits
              </div>
              <div className="mkt-modal__price-sub muted">{status || 'Locking today’s price…'}</div>
            </>
          )}
        </div>

        {session ? <div className="mkt-modal__balance muted">Your balance: ◈ {balance?.credits ?? 0}</div> : null}
        {needsMoreCredits ? <p className="muted mkt-modal__note">You&rsquo;ll need a few more credits to buy this.</p> : null}
        {status && phase === 'working' ? <p className="muted mkt-modal__note">{status}</p> : null}
        {error ? <p className="error mkt-modal__note">{error}</p> : null}

        <div className="mkt-modal__actions">
          <button className="btn btn--ghost" onClick={cancel} disabled={busy}>Cancel</button>
          <button className="btn btn--purple" onClick={confirm} disabled={busy || !locked}>
            {busy ? 'Working…' : needsMoreCredits ? 'Get credits' : 'Confirm purchase'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default MarketCheckout
