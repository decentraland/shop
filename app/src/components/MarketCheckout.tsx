import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import type { Trade } from '@dcl/schemas'
import { useWallet } from '~/store/wallet'
import { useBalance, balanceLabel } from '~/hooks/useBalance'
import { fetchTrade, type CatalogItem, type LegacyListing } from '~/lib/api'
import { manaWeiToUsdCents, type ManaRate } from '~/lib/mana-rate'
import { CurrencyIcon } from '~/components/CurrencyIcon'
import { CURRENCY, formatAmount } from '~/lib/currency'
import { track, errorCode, isUserRejection } from '~/lib/analytics'
import { authorizeUsdCredit, cancelUsdIntents } from '~/lib/credits'
import { buyWithCredits } from '~/lib/buy'
import { buyGasless, waitForSettlement, GaslessUnavailableError, SettlementPendingError } from '~/lib/buy-gasless'
import { gaslessEnabled } from '~/lib/gasless-config'
import { isOwnTrade } from '~/lib/ownership'
import { t } from '~/intl/i18n'
import { isRejection } from '~/lib/errors'
import { ErrorNotice } from '~/components/ErrorNotice'

// Market-specific mapping: keeps the "…Refreshing the market…" sold-out copy (the market view
// refetches live prices on this failure), so it maps locally rather than via the shared soldOrRemoved.
function friendlyError(e: unknown): string {
  if (isRejection(e)) return t('errors.rejected')
  const msg = ((e as { message?: string }).message ?? '').toLowerCase()
  if (msg.includes('insufficient')) return t('marketCheckout.error.insufficient', { currency: CURRENCY.name })
  if (msg.includes('not found') || msg.includes('no active listing') || msg.includes('404')) {
    return t('marketCheckout.error.soldOrRemoved')
  }
  if (msg.includes('your own listing')) return t('errors.cantBuyOwn')
  return t('marketCheckout.error.generic')
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
    gender: null,
    isSmart: false // TODO: legacy listings don't have the isSmart flag, but we should add it to the API or retrieve it somehow.
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
  const { data: balance, isError: balanceError } = useBalance(session)
  const qc = useQueryClient()
  const navigate = useNavigate()

  const [phase, setPhase] = useState<Phase>('confirm')
  const [status, setStatus] = useState<string>(t('marketCheckout.lockingPrice'))
  const [error, setError] = useState<string | null>(null)
  // The authorized (LOCKED) purchase: the signed trade, the one-time credit, the MANA cap + the price.
  const [locked, setLocked] = useState<{
    trade: Trade
    credit: Awaited<ReturnType<typeof authorizeUsdCredit>>['credit']
    maxCreditedValue: string
    credits: number
    usdCents: number
  } | null>(null)
  // The reserved USD intent that still needs releasing if we leave without buying. Set on lock,
  // cleared when released (cancel/error/insufficient) or consumed (buy). The unmount cleanup releases
  // it so navigating away after the price locks doesn't orphan the reservation until the TTL.
  const reservedCreditIdRef = useRef<string | null>(null)

  // Indicative (pre-authorize) price to show while we lock the real one.
  const approxCredits = Math.ceil(manaWeiToUsdCents(listing.manaWei, rate) / 10)

  // Step 1 + 2 on open: resolve the trade, authorize, and reserve the dollars → LOCK the price.
  useEffect(() => {
    let cancelled = false
    if (!session) {
      setPhase('error')
      setError(t('buyModal.signInToCheckout'))
      return
    }

    const lockPrice = async () => {
      try {
        const trade = await fetchTrade(listing.tradeId)
        if (!trade) throw new Error('not found')
        if (isOwnTrade(trade, session.address)) throw new Error("You can't buy your own listing.")
        const usdCents = manaWeiToUsdCents(listing.manaWei, rate)
        // Guard against a malformed manaWei / bad rate sizing a $0 authorize (manaWeiToUsdCents
        // returns 0 on parse failure) — never lock a free purchase.
        if (!Number.isFinite(usdCents) || usdCents <= 0) throw new Error('price unavailable')
        const {
          credit,
          maxCreditedValue,
          usdCents: lockedCents
        } = await authorizeUsdCredit(session.identity, usdCents, listing.tradeId)
        if (cancelled) {
          // Component unmounted before we could show the price — release the reservation.
          void cancelUsdIntents(session.identity, [credit.id]).catch(() => {})
          return
        }
        reservedCreditIdRef.current = credit.id
        setLocked({ trade, credit, maxCreditedValue, usdCents: lockedCents, credits: Math.ceil(lockedCents / 10) })
        setStatus('')
      } catch (e) {
        if (cancelled) return
        console.error('[market] authorize failed', e)
        track(isUserRejection(e) ? 'Shop Purchase Cancelled' : 'Shop Purchase Failed', {
          step: 'authorize',
          error_code: errorCode(e),
          value_usd: Math.round(manaWeiToUsdCents(listing.manaWei, rate)) / 100
        })
        setPhase('error')
        setError(friendlyError(e))
      }
    }

    void lockPrice()

    return () => {
      cancelled = true
      // Release a locked-but-unspent reservation if the user navigates away without buying/cancelling.
      if (reservedCreditIdRef.current && session) {
        void cancelUsdIntents(session.identity, [reservedCreditIdRef.current]).catch(() => {})
        reservedCreditIdRef.current = null
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Only assert "needs more credits" when the balance is actually KNOWN — a failed/loading fetch must
  // not falsely gate the buy (undefined would read as 0). If unknown, let them proceed; the on-chain buy guards.
  const needsMoreCredits = !!locked && balance != null && balance.credits < locked.credits

  async function confirm() {
    if (!session || !locked) return
    // Not enough balance for the locked amount → send them to top up (Get credits).
    if (needsMoreCredits) {
      // Funnel bridge: a purchase blocked by low balance that routes to Get Credits. Lets us join the
      // purchase funnel to the buy-credits funnel and see how many low-balance buyers go on to top up.
      track('Shop Buy Credits Prompted', {
        from: 'item_checkout',
        credits_needed: locked.credits,
        credits_balance: balance?.credits ?? 0,
        shortfall: Math.max(0, locked.credits - (balance?.credits ?? 0))
      })
      void cancelUsdIntents(session.identity, [locked.credit.id]).catch(() => {})
      reservedCreditIdRef.current = null
      navigate('/credits')
      return
    }
    setPhase('working')
    setError(null)
    let usedGasless = false
    try {
      setStatus(t('marketCheckout.confirming'))
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
          usedGasless = true
        } catch (gaslessErr) {
          if (gaslessErr instanceof SettlementPendingError) {
            // Broadcast but not yet confirmed — keep the reservation; the reconciler settles it.
            usedGasless = true
          } else if (gaslessErr instanceof GaslessUnavailableError) {
            txHash = await buyWithCredits(buyArgs) // fallback: buyer submits + pays gas
          } else {
            throw gaslessErr
          }
        }
      } else {
        txHash = await buyWithCredits(buyArgs)
      }
      reservedCreditIdRef.current = null // consumed by the buy
      track('Shop Completed Purchase', {
        items: [
          {
            item_id: listing.itemId ?? null,
            contract_address: listing.contractAddress,
            token_id: null,
            price_usd: locked.usdCents / 100
          }
        ],
        value_credits: locked.credits,
        value_usd: locked.usdCents / 100,
        purchase_type: 'item', // legacy Market = primary public_item_order liquidity
        is_primary: true,
        payment_type: 'credits',
        no_crypto_step: usedGasless,
        transaction_hash: txHash ?? null
      })
      void qc.invalidateQueries({ queryKey: ['usd-balance'] })
      navigate('/success', { state: { items: [toCatalogItem(listing)], txHash } })
    } catch (e) {
      console.error('[market] buy now failed', e)
      // Release the reserved dollars so the balance isn't stuck until the TTL.
      void cancelUsdIntents(session.identity, [locked.credit.id]).catch(() => {})
      reservedCreditIdRef.current = null
      track(isUserRejection(e) ? 'Shop Purchase Cancelled' : 'Shop Purchase Failed', {
        step: 'submit',
        error_code: errorCode(e),
        value_usd: locked.usdCents / 100
      })
      void qc.invalidateQueries({ queryKey: ['usd-balance'] })
      setError(friendlyError(e))
      setPhase('error')
      const raw = ((e as { message?: string }).message ?? '').toLowerCase()
      if (raw.includes('not found') || raw.includes('no active listing') || raw.includes('404')) onSold()
    }
  }

  function cancel() {
    // Release any reservation we made before the user backed out.
    if (session && locked) void cancelUsdIntents(session.identity, [locked.credit.id]).catch(() => {})
    reservedCreditIdRef.current = null
    onClose()
  }

  const busy = phase === 'working'

  return (
    <div
      className="mkt-modal"
      role="dialog"
      aria-modal="true"
      aria-label={t('buyModal.dialogAria', { name: listing.name })}
    >
      <div className="mkt-modal__scrim" onClick={busy ? undefined : cancel} aria-hidden />
      <div className="mkt-modal__card">
        <div className="mkt-modal__head">
          <div className="mkt-modal__thumb">{listing.thumbnail ? <img src={listing.thumbnail} alt="" /> : null}</div>
          <div>
            <div className="mkt-modal__name" title={listing.name}>
              {listing.name || t('buyModal.itemFallback')}
            </div>
            <span className="chip chip--rarity">{listing.rarity}</span>
          </div>
        </div>

        <div className="mkt-modal__price">
          {locked ? (
            <>
              <div className="mkt-modal__price-label">{t('marketCheckout.finalPrice')}</div>
              <div className="mkt-modal__price-value">
                <CurrencyIcon className="mkt-modal__diamond" />
                {formatAmount(locked.credits)}
              </div>
              <div className="mkt-modal__price-sub muted">
                {t('marketCheckout.lockedForPurchase')} · ${(locked.usdCents / 100).toFixed(2)}
              </div>
            </>
          ) : (
            <>
              <div className="mkt-modal__price-label">{t('marketCheckout.todaysPrice')}</div>
              <div className="mkt-modal__price-value mkt-modal__price-value--approx">
                <span className="mkt-modal__approx" aria-hidden>
                  ≈
                </span>
                <CurrencyIcon className="mkt-modal__diamond" />
                {formatAmount(approxCredits)}
              </div>
              <div className="mkt-modal__price-sub muted">{status || t('marketCheckout.lockingPrice')}</div>
            </>
          )}
        </div>

        {session ? (
          <div className="mkt-modal__balance muted">
            {t('marketCheckout.yourBalance')} <CurrencyIcon className="ccy-mark" />{' '}
            {balanceLabel(balance, balanceError)}
          </div>
        ) : null}
        {needsMoreCredits ? (
          <p className="muted mkt-modal__note">{t('marketCheckout.needMore', { currency: CURRENCY.name })}</p>
        ) : null}
        {status && phase === 'working' ? <p className="muted mkt-modal__note">{status}</p> : null}
        <ErrorNotice message={error} className="mkt-modal__note" />

        <div className="mkt-modal__actions">
          <button className="btn btn--ghost" onClick={cancel} disabled={busy}>
            {t('buyModal.cancel')}
          </button>
          <button className="btn btn--purple" onClick={() => void confirm()} disabled={busy || !locked}>
            {busy
              ? t('marketCheckout.buying')
              : needsMoreCredits
                ? t('nav.getCredits', { currency: CURRENCY.name })
                : t('marketCheckout.confirmPurchase')}
          </button>
        </div>
      </div>
    </div>
  )
}

export default MarketCheckout
