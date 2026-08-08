import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import type { Trade } from '@dcl/schemas'
import { useWallet } from '~/store/wallet'
import { useBalance, balanceLabel } from '~/hooks/useBalance'
import { fetchTrade, type CatalogItem, type LegacyListing } from '~/lib/api'
import { manaWeiToUsdCents, type ManaRate } from '~/lib/mana-rate'
import { CurrencyIcon } from '~/components/CurrencyIcon'
import { CURRENCY, formatAmount, usdCentsToCredits } from '~/lib/currency'
import { isIapMode } from '~/lib/iap'
import { track, errorCode, isUserRejection } from '~/lib/analytics'
import { authorizeUsdCredit, cancelUsdIntents } from '~/lib/credits'
import { buyWithCredits } from '~/lib/buy'
import { buyGasless, waitForSettlement, GaslessUnavailableError, SettlementPendingError } from '~/lib/buy-gasless'
import { canPayGasItself } from '~/lib/wallet-kind'
import { gaslessEnabled } from '~/lib/gasless-config'
import { isOwnTrade } from '~/lib/ownership'
import { t } from '~/intl/i18n'
import { isRejection } from '~/lib/errors'
import { captureError } from '~/lib/monitoring'
import { createSpendGuard } from '~/lib/spend-guard'
import * as S from './MarketCheckout.styles'
import type { SuccessNavState } from '~/pages/Success'

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
  /**
   * Tracks, per credit and per transaction hash, whether the reservation may already be consumed on-chain.
   *
   * NOT a boolean: the Confirm CTA stays enabled on the error phase, so the same reservation can back a second
   * transaction — and a revert on the retry says nothing about a first attempt whose outcome was never
   * observed. See lib/spend-guard for the scenario that breaks a single flag.
   */
  const guardRef = useRef(createSpendGuard())

  // Indicative (pre-authorize) price to show while we lock the real one.
  const approxCredits = usdCentsToCredits(manaWeiToUsdCents(listing.manaWei, rate))

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
          releaseReservation([credit.id])
          return
        }
        reservedCreditIdRef.current = credit.id
        setLocked({ trade, credit, maxCreditedValue, usdCents: lockedCents, credits: usdCentsToCredits(lockedCents) })
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
        releaseIfNotInFlight([reservedCreditIdRef.current])
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
      releaseReservation([locked.credit.id])
      reservedCreditIdRef.current = null
      navigate('/credits')
      return
    }
    setPhase('working')
    setError(null)
    // Declared out here: the catch reads `usedGasless`, and the post-success block runs AFTER the try so a
    // failure in analytics, a cache refresh or the navigation can never reach the release path.
    let usedGasless = false
    let txHash: string | undefined
    try {
      setStatus(t('marketCheckout.confirming'))
      const buyArgs = {
        trade: locked.trade,
        buyer: session.address,
        signer: session.signer,
        credits: [locked.credit],
        maxCreditedValue: locked.maxCreditedValue,
        onBroadcast: ({ txHash: h }: { txHash: string }) => guardRef.current.broadcast(locked.credit.id, h),
        onReverted: ({ txHash: h }: { txHash: string | null }) => {
          // No hash means the attempt is unresolved, so it must keep the credit untouchable rather than clear
          // it — the pessimistic reading is the only safe one.
          if (h) guardRef.current.reverted(h)
        }
      }
      guardRef.current.submitStarted(locked.credit.id)
      if (gaslessEnabled()) {
        try {
          txHash = await buyGasless(buyArgs) // buyer confirms off-chain; relayer covers the fee
          guardRef.current.broadcast(locked.credit.id, txHash) // relayed → out of our hands
          await waitForSettlement(txHash)
          usedGasless = true
        } catch (gaslessErr) {
          if (gaslessErr instanceof SettlementPendingError) {
            // Broadcast but not yet confirmed — keep the reservation; the reconciler settles it.
            usedGasless = true
          } else if (gaslessErr instanceof GaslessUnavailableError) {
            /**
             * Only a REJECTION proves nothing was relayed. `relayer-unreachable` means there is no usable
             * response — a proxy 502, a reset connection — and the relayer may have submitted before it died.
             * Re-submitting the same credit then estimates gas against a consumed credit, which reverts with no
             * receipt and looks exactly like a pre-broadcast failure. So that case is recorded as unobservable
             * (the credit can never be released) and the fallback is not attempted.
             */
            if (gaslessErr.reason === 'relayer-unreachable') {
              guardRef.current.unobservable(locked.credit.id)
              throw gaslessErr
            }
            /**
             * The gas-paying rail is only a route for a SELF-CUSTODY wallet. A managed (web2) wallet holds no
             * POL, so it would revert with INSUFFICIENT_FUNDS after a prompt the buyer cannot act on — and gas
             * or network wording is exactly what these users must never see (CONVENTIONS.md).
             */
            if (!canPayGasItself(session.providerType)) throw gaslessErr
            txHash = await buyWithCredits(buyArgs) // fallback: buyer submits + pays gas
          } else {
            /**
             * Everything else the inner try can throw lands here, and the hash is what tells them apart.
             *
             * With a hash, buyGasless resolved and this came from waitForSettlement, whose plain Error means a
             * status-0 receipt: the credit was NOT consumed, so record the revert or the release below stays
             * blocked and the balance is stranded until the TTL. Without one, nothing was relayed at all (a
             * dismissed signature prompt, a failed nonce read) and there is nothing to record.
             */
            if (txHash) guardRef.current.reverted(txHash)
            throw gaslessErr
          }
        }
      } else {
        txHash = await buyWithCredits(buyArgs)
      }
    } catch (e) {
      // The submit is over: from here on the decision rests on what was actually reported.
      guardRef.current.submitFinished(locked.credit.id)
      console.error('[market] buy now failed', e)
      // Release the reserved dollars so the balance isn't stuck until the TTL — unless the transaction went
      // out, in which case they may already be spent (releaseReservation is what enforces that).
      releaseReservation([locked.credit.id])
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
      return
    }
    guardRef.current.submitFinished(locked.credit.id)
    // BOUGHT. Bookkeeping and navigation only, deliberately outside the try above — and with its own catch,
    // so a Segment or query-cache fault can neither reach the release path nor cost the buyer the success
    // screen for a purchase that actually happened.
    reservedCreditIdRef.current = null // consumed by the buy
    try {
      // The balance and the money queries FIRST — a Segment throw must not be able to skip them, or the buyer
      // lands on the success screen with a stale, too-high balance and a PDP still offering the item.
      void qc.invalidateQueries({ queryKey: ['usd-balance'] })
      track('Shop Completed Purchase', {
        items: [
          {
            item_id: listing.itemId ?? null,
            contract_address: listing.contractAddress,
            token_id: null,
            price_usd: locked.usdCents / 100,
            category: listing.category,
            is_smart: false
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
      // The legacy listing was consumed — refresh the browse grids, the PDP money queries, My Assets
      // and Activity so the bought item stops showing as buyable and appears as owned/purchased without
      // a manual reload (mirrors the shop BuyModal success path).
      void qc.invalidateQueries({ queryKey: ['detail-trade'] })
      void qc.invalidateQueries({ queryKey: ['shop-item'] })
      void qc.invalidateQueries({ queryKey: ['item-resales', listing.contractAddress, listing.itemId] })
      void qc.invalidateQueries({ queryKey: ['shop-items'] })
      void qc.invalidateQueries({ queryKey: ['catalog-items'] })
      void qc.invalidateQueries({ queryKey: ['my-assets'] })
      void qc.invalidateQueries({ queryKey: ['purchases'] })
    } catch (bookErr) {
      captureError(bookErr, { flow: 'market_buy_now', step: 'post_purchase' })
    }
    const successState: SuccessNavState = { items: [toCatalogItem(listing)], txHash }
    navigate('/success', { state: successState })
  }

  /**
   * The ONLY way this component releases a reservation — guarded, because two of its call sites can run after
   * the transaction has gone out: the catch below, and the effect cleanup on unmount (the ref is cleared only
   * once the await resolves, so navigating away mid-flight reaches it).
   */
  function releaseReservation(ids: string[]) {
    if (!session || ids.length === 0) return
    const safe = ids.filter(id => !guardRef.current.mayBeConsumed(id))
    if (safe.length === 0) return
    void cancelUsdIntents(session.identity, safe).catch(() => {})
  }

  /**
   * The unmount path, which needs a STRICTER rule than the buy's own catch.
   *
   * The catch runs after the submit settles, so it knows whether a transaction went out. This runs whenever the
   * component goes away — including while the wallet prompt is open, or while the relayer is mid-round-trip.
   * Nothing has been reported yet in that window, so releasing on "nothing broadcast" would hand back a credit
   * the buyer is about to spend. An abandoned modal that never submitted still releases, which is the case this
   * cleanup exists for.
   */
  function releaseIfNotInFlight(ids: string[]) {
    releaseReservation(ids.filter(id => !guardRef.current.isInFlight(id)))
  }

  function cancel() {
    // Release any reservation we made before the user backed out.
    if (session && locked) releaseReservation([locked.credit.id])
    reservedCreditIdRef.current = null
    onClose()
  }

  const busy = phase === 'working'

  return (
    <S.Modal role="dialog" aria-modal="true" aria-label={t('buyModal.dialogAria', { name: listing.name })}>
      <S.Scrim onClick={busy ? undefined : cancel} aria-hidden />
      <S.Card>
        <S.Head>
          <S.Thumb>{listing.thumbnail ? <img src={listing.thumbnail} alt="" /> : null}</S.Thumb>
          <div>
            <S.Name title={listing.name}>{listing.name || t('buyModal.itemFallback')}</S.Name>
            <S.Chip data-variant="rarity">{listing.rarity}</S.Chip>
          </div>
        </S.Head>

        <S.Price>
          {locked ? (
            <>
              <S.PriceLabel>{t('marketCheckout.finalPrice')}</S.PriceLabel>
              <S.PriceValue>
                <S.Diamond />
                {formatAmount(locked.credits)}
              </S.PriceValue>
              <S.PriceSub className="muted">
                {t('marketCheckout.lockedForPurchase')} · ${(locked.usdCents / 100).toFixed(2)}
              </S.PriceSub>
            </>
          ) : (
            <>
              <S.PriceLabel>{t('marketCheckout.todaysPrice')}</S.PriceLabel>
              <S.PriceValue data-approx>
                <S.Approx aria-hidden>≈</S.Approx>
                <S.Diamond />
                {formatAmount(approxCredits)}
              </S.PriceValue>
              <S.PriceSub className="muted">{status || t('marketCheckout.lockingPrice')}</S.PriceSub>
            </>
          )}
        </S.Price>

        {session ? (
          <S.Balance className="muted">
            {t('marketCheckout.yourBalance')} <CurrencyIcon className="ccy-mark" />{' '}
            {balanceLabel(balance, balanceError)}
          </S.Balance>
        ) : null}
        {needsMoreCredits ? (
          <S.Note className="muted">{t('marketCheckout.needMore', { currency: CURRENCY.name })}</S.Note>
        ) : null}
        {status && phase === 'working' ? <S.Note className="muted">{status}</S.Note> : null}
        <S.NoteNotice message={error} />

        <S.Actions>
          <S.ActionBtn variant="ghost" onClick={cancel} disabled={busy}>
            {t('buyModal.cancel')}
          </S.ActionBtn>
          {/* In the iOS web view the shortfall CTA is removed rather than relabelled: it routed to
              /credits, which is the one thing the Shop must not offer there (the app sells credits through
              In-App Purchase). The `needMore` note above still says what is missing, so this is an
              explained dead end rather than a silent one — and the button stops promising a way out it
              cannot deliver. */}
          <S.ActionBtn
            variant="purple"
            onClick={() => void confirm()}
            disabled={busy || !locked || (needsMoreCredits && isIapMode())}
          >
            {busy
              ? t('marketCheckout.buying')
              : needsMoreCredits && !isIapMode()
                ? t('nav.getCredits', { currency: CURRENCY.name })
                : t('marketCheckout.confirmPurchase')}
          </S.ActionBtn>
        </S.Actions>
      </S.Card>
    </S.Modal>
  )
}

export default MarketCheckout
