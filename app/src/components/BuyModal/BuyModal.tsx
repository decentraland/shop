import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CircularProgress } from 'decentraland-ui2'
import { useQueryClient } from '@tanstack/react-query'
import { useWallet } from '~/store/wallet'
import { useBalance } from '~/hooks/useBalance'
import { useManaBalance } from '~/hooks/useManaBalance'
import { fetchStoreMintState, resolveLiveTrade, type CatalogItem } from '~/lib/api'
import { formatCredits, usdCentsToCredits } from '~/lib/currency'
import { isIapMode } from '~/lib/iap'
import { readTradeManaPriceWei } from '~/lib/mana'
import { purchaseTargetFor, resolveLine, type StoreResolver } from '~/lib/cart-checkout'
import { hrefFor, myItemsRouteFor } from '~/lib/routes'
import { readManaUsdRate, type ManaRate } from '~/lib/mana-rate'
import { config } from '~/config'
import { PaymentMethodStep } from '~/components/PaymentMethodStep'
import { PaymentCtas } from '~/components/PaymentCtas'
import { invalidateAfterPurchase } from '~/lib/after-purchase'
import { AuthorizeStep } from '~/components/AuthorizeStep'
import manaLight from '~/assets/mana-matic-light.svg'
import packCoin from '~/assets/credits/pack-coin.webp'
import buyErrorAvatar from '~/assets/error/buy-error.png'
import {
  getAuthorizationStatus,
  getManaSpendingAuthorization,
  needsApprovalStep,
  type ShopAuthorization
} from '~/lib/authorizations'
import { computePaymentOptions, findOption, type PaymentMethod } from '~/lib/payment-options'
import { track, errorCode, isUserRejection, purchaseItemsProps } from '~/lib/analytics'
import { captureError } from '~/lib/monitoring'
import { createSpendGuard } from '~/lib/spend-guard'
import { authorizeUsdCredit, cancelUsdIntents } from '~/lib/credits'
import { buyOneWithCredits } from '~/lib/buy'
import {
  buyMintWithCreditsAndMana,
  buyMintWithMana,
  buyWithCreditsAndMana,
  buyWithMana,
  manaSpenderFor,
  purchaseFor,
  type PurchaseTarget
} from '~/lib/buy-mana'
import { buyOneGasless, waitForSettlement, GaslessUnavailableError, SettlementPendingError } from '~/lib/buy-gasless'
import { canPayGasItself } from '~/lib/wallet-kind'
import { gaslessEnabled } from '~/lib/gasless-config'
import { createPackCheckout, MAX_OFFER_PACKS } from '~/lib/payments'
import { useCreditPacks } from '~/hooks/useCreditPacks'
import { RESUME_BUY_KEY } from '~/lib/resume-buy'
import { t } from '~/intl/i18n'
import { friendlyError, isInsufficient } from '~/lib/errors'
import { Confetti } from '~/components/Confetti'
import { CloseIcon } from '~/components/Icons/CloseIcon'
import { WarningTriangleIcon } from '~/components/Icons/WarningTriangleIcon'
import { SuccessCheckIcon } from '~/components/Icons/SuccessCheckIcon'
import { JumpInIcon } from '~/components/Icons/JumpInIcon'
import * as M from './modal.styles'
import loaderLogo from '~/assets/credits/loader-logo.svg'

type Phase = 'loading' | 'ready' | 'nofunds' | 'processing' | 'complete' | 'error'

/** A mint's live price + remaining supply, re-read at checkout exactly as the cart re-reads it. */
const resolveStore: StoreResolver = item => fetchStoreMintState(item.contractAddress, String(item.itemId))

/** The trade a purchase is against, for the fields that only a trade-backed one has. */
function tradeIdOf(sale: PurchaseTarget): string | undefined {
  return sale.kind === 'trade' ? sale.trade.id : undefined
}

/**
 * What the purchase intent RECORDS as bought, as opposed to how it settles.
 *
 * A mint has no tradeId, so this is the only identity its purchase carries — without it the buyer's Activity
 * feed can only render the line as a nameless "Item". Sent for every purchase, mint or trade (the cart does
 * the same): it is the item's identity, not the settlement's.
 */
function purchasedItem(item: CatalogItem): { contractAddress: string; itemId: string } | undefined {
  return item.contractAddress && item.itemId != null
    ? { contractAddress: item.contractAddress, itemId: String(item.itemId) }
    : undefined
}

/**
 * Buy Now modal for the item detail page — the pixel-perfect purchase flow (Figma "Buy Asset directly
 * from PDP"). Owns the whole flow so the PDP just opens it:
 *   1. resolve the item's live listing (or live mint) + authorize the credit (LOCK the price)
 *   2. enough credits → "Buy Asset" · not enough → "Buy Credits and Item" (pack picker)
 *   3. confirm → "Completing transaction…" (gasless signs for OTP, prompts for MetaMask)
 *   4. settled/indexed → "Purchase complete!"
 * On any exit before buying, the reserved dollars are released.
 */
export function BuyModal({
  item,
  onClose,
  resume = false
}: {
  item: CatalogItem
  onClose: () => void
  // Resuming an item buy right after topping up on Stripe: skip the "Buy" click and auto-confirm
  // (Figma "Completing Purchase…" → success), since the buyer already committed on the PDP.
  resume?: boolean
}) {
  const { session } = useWallet()
  const { data: balance } = useBalance(session)
  // The buyer's on-chain MANA balance — drives whether we OFFER the "pay with MANA" step at all.
  const { data: manaBalanceWei } = useManaBalance(session)
  const qc = useQueryClient()
  const navigate = useNavigate()

  /**
   * The live MANA/USD rate, read through the react-query cache (the same read the grid already made, not a
   * second oracle round-trip).
   *
   * Read BEFORE the purchase is resolved, and therefore for every kind of purchase: a legacy trade is priced in
   * MANA, and a mint's price lives on-chain in MANA too, so neither can be quoted in credits without it. Only a
   * native (USD-pegged) trade could skip it, and that is not known until the resolve has happened.
   *
   * An unreachable/stale oracle resolves to undefined, which prices a native trade exactly as before and makes
   * the other two resolve as unavailable rather than off a guessed rate.
   */
  async function ensureManaRate(): Promise<ManaRate | undefined> {
    try {
      return await qc.fetchQuery({
        queryKey: ['mana-rate', config.chainId],
        queryFn: () => readManaUsdRate(config.chainId),
        staleTime: 60_000
      })
    } catch {
      return undefined
    }
  }
  // The top-up packs offered when the buyer is short on credits (all four the credits-server returns —
  // the modal is widened to fit them in one row, Figma 1179-182656). Sourced from the credits-server
  // catalogue (single source of truth); falls back to the bundled packs so this critical picker always
  // renders. The cheapest pack that still clears the shortfall is pre-selected.
  const OFFER_PACKS = useCreditPacks().packs.slice(0, MAX_OFFER_PACKS)

  const [phase, setPhase] = useState<Phase>('loading')
  const [error, setError] = useState<string | null>(null)
  // Bumped by the error state's TRY AGAIN to re-run the open sequence from scratch.
  const [attempt, setAttempt] = useState(0)
  const [selectedPack, setSelectedPack] = useState<string>('')
  const [itemCredits, setItemCredits] = useState(item.priceCredits)
  // The MANA (wei) this purchase costs — from the oracle for a trade, from the store's own on-chain price
  // for a mint. Null until read (or if the read fails, in which case MANA simply isn't offered and the
  // credits path is unaffected).
  const [manaPriceWei, setManaPriceWei] = useState<bigint | null>(null)
  // The resolved purchase + its USD price, kept even when the credits balance falls short. The MANA rails need
  // them in the 'nofunds' phase too — that's exactly where paying with MANA (alone or mixed) rescues a
  // purchase the credits alone can't cover, so we must not throw it away like the old flow did.
  const [resolvedSale, setResolvedSale] = useState<PurchaseTarget | null>(null)
  const [priceCents, setPriceCents] = useState(0)
  const [locked, setLocked] = useState<{
    sale: PurchaseTarget
    credit: Awaited<ReturnType<typeof authorizeUsdCredit>>['credit']
    maxCreditedValue: string
    credits: number
    usdCents: number
  } | null>(null)
  const reservedCreditIdRef = useRef<string | null>(null)
  /**
   * Tracks, per credit and per transaction hash, whether a reservation may already be consumed on-chain.
   *
   * NOT a boolean. The error phase leaves the Buy CTA enabled, so one reservation can back a second
   * transaction, and `confirmCombined` reserves a different credit from the price lock — so "was there a
   * broadcast" and "did something revert" are questions about a specific attempt, not about the component.
   * lib/spend-guard documents the scenario a single flag gets wrong. A ref rather than state because every
   * reader is a callback or an effect cleanup that would close over a stale value.
   */
  const guardRef = useRef(createSpendGuard())

  const priceCredits = locked?.credits ?? itemCredits
  const balanceCredits = balance?.credits ?? 0

  // Step 1+2 on open: resolve the live purchase, authorize, reserve the dollars → LOCK the price, then
  // branch on whether the balance covers it. Re-runs on `attempt`, which is what the error state's
  // TRY AGAIN bumps: whether the failure came from the price lock or from the submit, the honest retry
  // is a fresh resolve + a fresh reservation, never a replay of the stale one.
  useEffect(() => {
    let cancelled = false
    if (!session) {
      setPhase('error')
      setError(t('buyModal.signInToCheckout'))
      return
    }
    // Route to the no-funds (pack picker) state: reserve nothing, prompt a top-up.
    const goNoFunds = (credits: number) => {
      const shortfall = credits - (balance?.credits ?? 0)
      const cover = OFFER_PACKS.find(p => p.credits >= shortfall) ?? OFFER_PACKS[OFFER_PACKS.length - 1]
      setSelectedPack(cover.id)
      track('Shop Buy Credits Prompted', {
        from: 'item_checkout',
        credits_needed: credits,
        credits_balance: balance?.credits ?? 0,
        shortfall: Math.max(0, shortfall)
      })
      setPhase('nofunds')
    }
    void (async () => {
      try {
        /**
         * Resolved through lib/cart-checkout's resolveLine — the SAME rules the cart charges by, deliberately.
         * A listing is re-resolved to its live trade and a mint has its on-chain price and remaining supply
         * re-read; either way the buyer is charged what is live now, not what the page was showing. Reusing it
         * is what keeps a mint buyable from here on the same terms it is buyable from the cart.
         *
         * The rate is AWAITED rather than read from a possibly-unresolved query — deciding off a missing rate
         * would report a perfectly buyable item as unavailable on a slow oracle read.
         */
        const outcome = await resolveLine(item, session.address, resolveLiveTrade, await ensureManaRate(), resolveStore)
        // The three outcomes read differently to a buyer, so they are not collapsed: gone means the sale ended,
        // own means they are the seller, and no-price means we could not quote it — see lib/errors.
        if (outcome.status === 'own') throw new Error("You can't buy your own listing.")
        if (outcome.status === 'no-price') throw new Error('price unavailable')
        if (outcome.status !== 'buyable') throw new Error('not for sale')
        const sale = purchaseTargetFor(outcome.line)
        const usdCents = outcome.line.usdCents
        const credits = usdCentsToCredits(usdCents)
        if (cancelled) return
        setItemCredits(credits)
        // Keep the purchase + exact price around for the MANA rails, whichever branch we take next.
        setResolvedSale(sale)
        setPriceCents(usdCents)
        // Known-and-short → straight to the pack picker; don't reserve dollars we can't spend.
        if (balance != null && balance.credits < credits) {
          goNoFunds(credits)
          return
        }
        // Enough (or balance unknown) → LOCK the price by authorizing the credit.
        try {
          const {
            credit,
            maxCreditedValue,
            usdCents: lockedCents
          } = await authorizeUsdCredit(session.identity, usdCents, tradeIdOf(sale), purchasedItem(item))
          if (cancelled) {
            releaseReservation([credit.id])
            return
          }
          reservedCreditIdRef.current = credit.id
          const lockedCredits = usdCentsToCredits(lockedCents)
          setItemCredits(lockedCredits)
          const lockedObj = { sale, credit, maxCreditedValue, usdCents: lockedCents, credits: lockedCredits }
          setLocked(lockedObj)
          // Resuming after a Stripe top-up: the buyer already committed, so finish automatically.
          if (resume) void confirm(lockedObj)
          else setPhase('ready')
        } catch (authErr) {
          if (cancelled) return
          // Server said not enough credits → show the pack picker, not a bare error.
          if (isInsufficient(authErr)) {
            goNoFunds(credits)
            return
          }
          throw authErr
        }
      } catch (e) {
        if (cancelled) return
        track(isUserRejection(e) ? 'Shop Purchase Cancelled' : 'Shop Purchase Failed', {
          step: 'authorize',
          error_code: errorCode(e)
        })
        setPhase('error')
        setError(friendlyError(e, t('buyModal.error.generic'), { sale: true }))
      }
    })()
    return () => {
      cancelled = true
      if (reservedCreditIdRef.current && session) {
        releaseIfNotInFlight([reservedCreditIdRef.current])
        reservedCreditIdRef.current = null
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt])

  // Once the price is locked AND the buyer holds MANA, establish what this purchase costs in MANA so we can
  // offer the "pay with MANA" step. Runs off the loading path so it never blocks/gates the default credits
  // flow; a failed oracle read just leaves manaPriceWei null (MANA not offered).
  useEffect(() => {
    const sale = locked?.sale ?? resolvedSale
    if (!sale) return
    if (phase !== 'ready' && phase !== 'nofunds') return
    if (manaBalanceWei == null || manaBalanceWei <= 0n) return
    if (manaPriceWei !== null) return
    // A mint is PRICED in MANA on-chain and the resolve already read it — that exact figure is what the store
    // will verify, so there is nothing to ask the oracle and no failure mode to degrade through.
    if (sale.kind === 'store') {
      setManaPriceWei(BigInt(sale.mint.item.priceWei))
      return
    }
    let cancelled = false
    void readTradeManaPriceWei(sale.trade)
      .then(wei => {
        if (!cancelled) setManaPriceWei(wei)
      })
      .catch(err => {
        if (import.meta.env.DEV) console.warn('[buyModal] mana price read failed', err)
      })
    return () => {
      cancelled = true
    }
  }, [phase, locked, resolvedSale, manaBalanceWei, manaPriceWei])

  // Which rails the buyer's balances actually support (pure — see lib/payment-options). MANA rails
  // appear only once both the MANA balance and the MANA price are known; until then this is just the
  // credits rail (or nothing), which keeps the default flow untouched.
  const paymentOptions = computePaymentOptions({
    priceCents,
    priceManaWei: manaPriceWei ?? 0n,
    balanceCents: balance?.balanceCents ?? 0,
    manaBalanceWei: manaBalanceWei ?? 0n
  })

  async function confirm(lk = locked) {
    if (!session || !lk) return
    setPhase('processing')
    setError(null)
    // Declared out here, not inside the try: the catch reads them, and the post-success block below runs
    // AFTER the try so that a failure in analytics or a cache refresh can never reach the release path.
    let usedGasless = false
    let txHash: string | undefined
    try {
      const buyArgs = {
        // Either rail, built by the same code the cart's batches go through: accept([trade]) for a listing,
        // buy([item]) for a mint, both inside one useCredits().
        purchase: purchaseFor(lk.sale, [lk.credit], lk.maxCreditedValue),
        buyer: session.address,
        signer: session.signer,
        // The transaction is on its way: from here on the credit may be consumed on-chain, so no failure may
        // release it. A revert clears the ATTEMPT it names — not the credit, which an earlier attempt may
        // already have spent.
        onBroadcast: ({ txHash: h }: { txHash: string }) => guardRef.current.broadcast(lk.credit.id, h),
        onReverted: ({ txHash: h }: { txHash: string | null }) => {
          // No hash means the attempt is unresolved: keep the credit untouchable rather than clear it.
          if (h) guardRef.current.reverted(h)
        }
      }
      guardRef.current.submitStarted(lk.credit.id)
      if (gaslessEnabled()) {
        try {
          txHash = await buyOneGasless(buyArgs)
          // Relayed, so it is broadcast the moment buyGasless resolves.
          guardRef.current.broadcast(lk.credit.id, txHash)
          await waitForSettlement(txHash)
          usedGasless = true
        } catch (gaslessErr) {
          if (gaslessErr instanceof SettlementPendingError) {
            usedGasless = true
          } else if (gaslessErr instanceof GaslessUnavailableError) {
            /**
             * Only a REJECTION proves nothing was relayed. `relayer-unreachable` means there is no usable
             * response — a proxy 502, a reset connection — and the relayer may have submitted before it died.
             * Re-submitting the same credit then estimates gas against a consumed credit, which reverts with no
             * receipt and is indistinguishable from a pre-broadcast failure. So that case is recorded as
             * unobservable (the credit can never be released) and the fallback is not attempted.
             */
            if (gaslessErr.reason === 'relayer-unreachable') {
              guardRef.current.unobservable(lk.credit.id)
              throw gaslessErr
            }
            /**
             * The gas-paying rail is only a route for a SELF-CUSTODY wallet. A managed (web2) wallet holds no
             * POL, so it would revert with INSUFFICIENT_FUNDS after a prompt the buyer cannot act on — and gas
             * or network wording is exactly what these users must never see (CONVENTIONS.md).
             */
            if (!canPayGasItself(session.providerType)) throw gaslessErr
            txHash = await buyOneWithCredits(buyArgs)
          } else {
            /**
             * Everything else the inner try can throw lands here, and the hash tells them apart. With a hash,
             * buyGasless resolved and this came from waitForSettlement, whose plain Error means a status-0
             * receipt: nothing consumed, so record the revert or the release stays blocked. Without one,
             * nothing was relayed (a dismissed signature prompt, a failed nonce read).
             */
            if (txHash) guardRef.current.reverted(txHash)
            throw gaslessErr
          }
        }
      } else {
        txHash = await buyOneWithCredits(buyArgs)
      }
    } catch (e) {
      // The submit is over: the decision now rests on what was actually reported.
      guardRef.current.submitFinished(lk.credit.id)
      if (!isUserRejection(e)) captureError(e, { flow: 'buy', step: 'submit', gasless: usedGasless })
      releaseReservation([lk.credit.id])
      reservedCreditIdRef.current = null
      track(isUserRejection(e) ? 'Shop Purchase Cancelled' : 'Shop Purchase Failed', {
        step: 'submit',
        error_code: errorCode(e)
      })
      void qc.invalidateQueries({ queryKey: ['usd-balance'] })
      setError(friendlyError(e, t('buyModal.error.generic'), { sale: true }))
      setPhase('error')
      return
    }
    /**
     * BOUGHT. Everything below is bookkeeping, and it is OUTSIDE the try on purpose.
     *
     * It used to sit inside it, so a throw from `track` or `invalidateAfterPurchase` — a Segment failure, a
     * bad query key — landed in the catch above and released a credit that had been consumed seconds earlier.
     * That path needed no race to hit: any exception in these three lines was enough.
     */
    guardRef.current.submitFinished(lk.credit.id)
    reservedCreditIdRef.current = null // consumed by the buy
    try {
      // Invalidations FIRST: they are what refresh the buyer's balance and drop the item from the PDP, and a
      // Segment fault must not be able to skip them (analytics is the part most likely to throw).
      invalidateAfterPurchase(qc, item)
      track('Shop Completed Purchase', {
        ...purchaseItemsProps([item]),
        payment_type: 'credits',
        no_crypto_step: usedGasless,
        transaction_hash: txHash ?? null
      })
    } catch (bookErr) {
      // Reported, never surfaced: the purchase happened. Swallowing it here is what keeps a Segment or
      // query-cache fault from turning a completed sale into an error screen.
      captureError(bookErr, { flow: 'buy', step: 'post_purchase' })
    }
    setPhase('complete')
  }

  /**
   * The ONLY way this component releases a reservation.
   *
   * Every release used to be a bare `cancelUsdIntents` call, and three of the SEVEN could run after the
   * transaction had gone out: the credits catch, the combined catch, and the effect cleanup on unmount (the
   * ref is only cleared once the await resolves, so closing the modal mid-flight reaches it). Funnelling them
   * through one guarded helper is what makes "never release spent credits" a property of the component rather
   * than something each call site has to remember.
   */
  function releaseReservation(ids: string[]) {
    if (!session || ids.length === 0) return
    const safe = ids.filter(id => !guardRef.current.mayBeConsumed(id))
    if (safe.length === 0) return
    void cancelUsdIntents(session.identity, safe).catch(() => {})
  }

  /**
   * The unmount path, which needs a STRICTER rule than a buy's own catch.
   *
   * A catch runs after its submit settles, so it knows whether a transaction went out. This runs whenever the
   * component goes away — including while the wallet prompt is open, or while the relayer is mid-round-trip,
   * when nothing has been reported yet. Releasing on "nothing broadcast" there hands back a credit the buyer
   * is about to spend. A modal abandoned before any submit still releases, which is the case it exists for.
   */
  function releaseIfNotInFlight(ids: string[]) {
    releaseReservation(ids.filter(id => !guardRef.current.isInFlight(id)))
  }

  // Post-purchase cache refresh shared by the MANA rails (mirrors confirm()'s invalidations so the PDP,
  // grids, My Assets and Activity all reflect the sale). Also bumps the MANA balance, which both rails
  // spend, and the USD balance, which the combined rail spends.
  function refreshAfterPurchase() {
    void qc.invalidateQueries({ queryKey: ['mana-balance'] })
    void qc.invalidateQueries({ queryKey: ['usd-balance'] })
    void qc.invalidateQueries({ queryKey: ['detail-trade'] })
    void qc.invalidateQueries({ queryKey: ['shop-item'] })
    void qc.invalidateQueries({ queryKey: ['owned-token', item.contractAddress, item.tokenId] })
    void qc.invalidateQueries({ queryKey: ['public-token', item.contractAddress, item.tokenId] })
    void qc.invalidateQueries({ queryKey: ['item-resales', item.contractAddress, item.itemId] })
    void qc.invalidateQueries({ queryKey: ['shop-items'] })
    void qc.invalidateQueries({ queryKey: ['catalog-items'] })
    void qc.invalidateQueries({ queryKey: ['my-assets'] })
    void qc.invalidateQueries({ queryKey: ['purchases'] })
    void qc.invalidateQueries({ queryKey: ['owned-item-count'] })
    void qc.invalidateQueries({ queryKey: ['overview-listings'] })
    void qc.invalidateQueries({ queryKey: ['upsell-listings'] })
  }

  // Pay directly in MANA (the alternative rail chosen in the payment-method step). We're NOT spending
  // credits, so release the reserved credit intent that locked the price, then settle on-chain via the
  // marketplace (buyWithMana). Same post-purchase cache refresh + analytics as the credits path.
  async function confirmMana() {
    // Works from BOTH phases: 'ready' (price locked, buyer chose MANA anyway) and 'nofunds' (credits
    // don't cover it, so MANA is the only way) — hence the fallback to the plain resolved purchase.
    const sale = locked?.sale ?? resolvedSale
    if (!session || !sale) return
    if (reservedCreditIdRef.current) {
      releaseReservation([reservedCreditIdRef.current])
      reservedCreditIdRef.current = null
    }
    setPhase('processing')
    setError(null)
    try {
      // A listing settles against the marketplace, a mint against the CollectionStore. Same rail from the
      // buyer's side: no credits are spent either way, and lib/buy-mana relays both so a managed wallet
      // (which holds no POL) can take it.
      const txHash =
        sale.kind === 'trade'
          ? await buyWithMana({ trade: sale.trade, buyer: session.address, signer: session.signer })
          : await buyMintWithMana({ mint: sale.mint, buyer: session.address, signer: session.signer })
      track('Shop Completed Purchase', {
        ...purchaseItemsProps([item]),
        payment_type: 'mana',
        transaction_hash: txHash ?? null
      })
      refreshAfterPurchase()
      setPhase('complete')
    } catch (e) {
      if (!isUserRejection(e)) captureError(e, { flow: 'buy_mana', step: 'submit' })
      track(isUserRejection(e) ? 'Shop Purchase Cancelled' : 'Shop Purchase Failed', {
        step: 'submit',
        error_code: errorCode(e)
      })
      setError(friendlyError(e, t('buyModal.error.generic'), { sale: true }))
      setPhase('error')
    }
  }

  // Pay with CREDITS FIRST + MANA for the remainder — one signature via CreditsManager.useCredits (see
  // lib/buy-mana buyWithCreditsAndMana). The credit must be sized to the buyer's BALANCE, not the item
  // price, so we authorize it here rather than reusing the price-lock (which is either absent in
  // 'nofunds' or sized to the full price in 'ready'): the credits-server signs a credit worth the
  // balance, and the contract's uncredited leg is the MANA gap.
  async function confirmCombined() {
    const sale = locked?.sale ?? resolvedSale
    const combined = findOption(paymentOptions, 'combined')
    if (!session || !sale || !combined) return
    setPhase('processing')
    setError(null)
    // Release the full-price reservation (if the 'ready' path made one) before reserving the partial.
    if (reservedCreditIdRef.current) {
      releaseReservation([reservedCreditIdRef.current])
      reservedCreditIdRef.current = null
    }
    let partialCreditId: string | null = null
    let txHash: string | undefined
    try {
      const { credit } = await authorizeUsdCredit(
        session.identity,
        combined.creditsCents,
        tradeIdOf(sale),
        purchasedItem(item)
      )
      partialCreditId = credit.id
      guardRef.current.submitStarted(credit.id)
      const gapArgs = {
        buyer: session.address,
        signer: session.signer,
        credits: [credit],
        manaGapWei: combined.manaWei,
        // Same rule as the credits-only rail, against THIS reservation: the partial credit, not the price lock
        // that was released above.
        onBroadcast: ({ txHash: h }: { txHash: string }) => guardRef.current.broadcast(credit.id, h),
        onReverted: ({ txHash: h }: { txHash: string | null }) => {
          if (h) guardRef.current.reverted(h)
        }
      }
      // Both kinds ride the CreditsManager's own mixed-payment rail — only the external call inside it differs.
      txHash =
        sale.kind === 'trade'
          ? await buyWithCreditsAndMana({ trade: sale.trade, ...gapArgs })
          : await buyMintWithCreditsAndMana({ mint: sale.mint, ...gapArgs })
    } catch (e) {
      if (partialCreditId) guardRef.current.submitFinished(partialCreditId)
      // The partial reservation never settled → release the dollars instead of stranding them. Guarded, so a
      // broadcast whose outcome is unknown is left alone.
      if (partialCreditId) releaseReservation([partialCreditId])
      if (!isUserRejection(e)) captureError(e, { flow: 'buy_credits_and_mana', step: 'submit' })
      track(isUserRejection(e) ? 'Shop Purchase Cancelled' : 'Shop Purchase Failed', {
        step: 'submit',
        error_code: errorCode(e)
      })
      void qc.invalidateQueries({ queryKey: ['usd-balance'] })
      setError(friendlyError(e, t('buyModal.error.generic'), { sale: true }))
      setPhase('error')
      return
    }
    // Bought — bookkeeping only, and outside the try for the same reason as confirm() above. The old
    // `partialCreditId = null` that used to guard the release from here is gone: the catch returns, so this
    // point is unreachable from it, and the release itself is now guarded by broadcastRef.
    if (partialCreditId) guardRef.current.submitFinished(partialCreditId)
    try {
      // Refresh first, analytics second — see confirm().
      refreshAfterPurchase()
      track('Shop Completed Purchase', {
        ...purchaseItemsProps([item]),
        payment_type: 'credits_and_mana',
        transaction_hash: txHash ?? null
      })
    } catch (bookErr) {
      captureError(bookErr, { flow: 'buy_credits_and_mana', step: 'post_purchase' })
    }
    setPhase('complete')
  }

  // No funds → buy the selected pack on Stripe directly, then resume THIS item purchase with the new
  // credits. Stash the item so the /credits return handler picks it up and re-opens this modal in
  // resume mode; then send the buyer straight to the Stripe hosted checkout (never the /credits page).
  async function buyCreditsAndItem() {
    if (!selectedPack || !session) return
    try {
      sessionStorage.setItem(RESUME_BUY_KEY, JSON.stringify(item))
    } catch {
      /* private mode: resume just won't auto-trigger; the credits still land */
    }
    // Release the (unaffordable) item reservation; we re-authorize after topping up.
    if (locked) releaseReservation([locked.credit.id])
    reservedCreditIdRef.current = null
    setPhase('loading')
    try {
      const cs = await createPackCheckout(selectedPack, { address: session.address, identity: session.identity })
      if (cs.url) {
        window.location.href = cs.url // Stripe hosted checkout with the pack pre-selected
        return
      }
      // No hosted URL (mock/dev, Stripe off): the credits page grants then resumes.
      navigate('/credits')
    } catch (e) {
      captureError(e, { flow: 'buy_credits_and_item' })
      try {
        sessionStorage.removeItem(RESUME_BUY_KEY)
      } catch {
        /* ignore */
      }
      setError(t('buyModal.error.creditsCheckout'))
      setPhase('error')
    }
  }

  // Show the payment-method step only when a MANA rail is actually on the table (paying in MANA, or
  // credits + MANA). Without one there's nothing to choose: a credits-only buyer keeps the conventional
  // single-CTA flow, and a buyer who can't cover it at all keeps the top-up pack picker.
  //
  // It replaces BOTH end states, which is the point: in 'ready' it adds "pay in MANA instead", and in
  // 'nofunds' it turns a dead end into a purchase the buyer can complete with the MANA they already
  // hold (alone, or mixed with the credits they have).
  // A MANA rail needs the buyer's permission to move their MANA. Self-custody wallets are TOLD about it
  // first, through the same approval step the sell and top-up flows use, so the extra wallet prompt is
  // explained instead of arriving unannounced next to the purchase prompt. Managed (web2) wallets never
  // see approval wording — lib/buy-mana grants it silently for them (CONVENTIONS.md).
  const [authStep, setAuthStep] = useState<{ auth: ShopAuthorization; rail: 'mana' | 'combined' } | null>(null)

  /**
   * The MANA allowance a rail needs. Which contract that is depends on the rail AND on what is being bought
   * (the store, not the marketplace, sells a mint), so the answer comes from lib/buy-mana — the same module the
   * rail's own ensureAuthorization asks, so this step can never announce an approval the purchase won't use.
   */
  function manaAuthFor(rail: 'mana' | 'combined', sale: PurchaseTarget): ShopAuthorization {
    const { spender, chainId } = manaSpenderFor(rail, sale)
    return getManaSpendingAuthorization(chainId, spender)
  }

  function runRail(rail: PaymentMethod) {
    if (rail === 'mana') void confirmMana()
    else if (rail === 'combined') void confirmCombined()
    else void confirm()
  }

  async function startPurchase(rail: PaymentMethod) {
    const sale = locked?.sale ?? resolvedSale
    if (rail === 'credits' || !sale || !session) {
      runRail(rail)
      return
    }
    const auth = manaAuthFor(rail, sale)
    // On a failed status read, assume approved and let the lib's ensureAuthorization handle it: that is
    // the pre-existing behaviour, so a flaky RPC degrades to "unannounced prompt", never to a blocked buy.
    const authorized = await getAuthorizationStatus(auth, session.address).catch(() => true)
    if (needsApprovalStep(session.providerType, authorized)) {
      setAuthStep({ auth, rail })
      return
    }
    runRail(rail)
  }

  const hasManaRail = paymentOptions.options.some(o => o.method === 'mana' || o.method === 'combined')
  // A buyer holding MANA that can't cover the item still gets the CTA step in 'ready': it renders the
  // credits button plus the MANA one disabled, with what their balance is worth. 'nofunds' is excluded on
  // purpose — with no payable rail at all, the pack picker is the only way forward, so the disabled button
  // is rendered inside that state instead (below) rather than replacing it.
  const methodMode =
    (phase === 'ready' && (hasManaRail || paymentOptions.manaShortfall != null)) || (phase === 'nofunds' && hasManaRail)

  function retry() {
    setError(null)
    setPhase('loading')
    setAttempt(a => a + 1)
  }

  const busy = phase === 'processing'
  const title =
    phase === 'complete'
      ? t('buyModal.titleComplete')
      : phase === 'error'
        ? t('cartCheckout.errorTitle')
        : phase === 'nofunds'
          ? t('buyModal.titleNoFunds')
          : t('buyModal.titleBuy')

  if (authStep && session) {
    return (
      <AuthorizeStep
        auth={authStep.auth}
        signer={session.signer}
        title={t(authStep.rail === 'mana' ? 'authorizeStep.manaTitle' : 'authorizeStep.buyTitle')}
        name={t(authStep.rail === 'mana' ? 'authorizeStep.manaName' : 'authorizeStep.buyName')}
        reason={t(authStep.rail === 'mana' ? 'authorizeStep.manaReason' : 'authorizeStep.buyReason')}
        icon={<img src={manaLight} width={24} height={24} alt="" aria-hidden />}
        onAuthorized={() => {
          const { rail } = authStep
          setAuthStep(null)
          runRail(rail)
        }}
        onCancel={() => setAuthStep(null)}
        onClose={() => {
          setAuthStep(null)
          onClose()
        }}
      />
    )
  }

  return (
    <M.Modal
      role="dialog"
      aria-modal="true"
      aria-label={t('buyModal.dialogAria', { name: item.name })}
      data-testid="buy-modal"
    >
      <M.Scrim onClick={busy ? undefined : onClose} aria-hidden />
      <M.Card data-tall={phase === 'processing' || phase === 'loading' || undefined}>
        {methodMode ? (
          <PaymentMethodStep
            item={item}
            priceCredits={priceCredits}
            priceCents={priceCents}
            options={paymentOptions.options}
            priceManaWei={manaPriceWei ?? 0n}
            balanceCredits={balanceCredits}
            manaBalanceWei={manaBalanceWei ?? 0n}
            onBuy={method => void startPurchase(method)}
            onClose={onClose}
            busy={busy}
            shortfall={paymentOptions.manaShortfall}
          />
        ) : (
          <>
            {/* Header: title + balance + divider */}
            <M.Head>
              <M.HeadRow>
                <M.Title>{title}</M.Title>
                {!busy && (
                  <M.X onClick={onClose} aria-label={t('buyModal.close')}>
                    <CloseIcon />
                  </M.X>
                )}
              </M.HeadRow>
              <M.Balance>
                <M.BalanceLabel>
                  {phase === 'nofunds' ? t('buyModal.dclBalance') : t('buyModal.myCreditsBalance')}
                </M.BalanceLabel>
                <M.BalanceIco />
                <M.BalanceValue>{formatCredits(balanceCredits)}</M.BalanceValue>
              </M.Balance>
            </M.Head>

            {/* Loading (resolving + authorizing) */}
            {phase === 'loading' && (
              <M.Body data-processing>
                <CircularProgress size={44} />
              </M.Body>
            )}

            {/* Error — the same panel the cart's checkout shows, so both ends of the buy flow fail alike. */}
            {phase === 'error' && (
              <M.Body>
                <M.BuyError data-testid="buy-error">
                  <M.BuyErrorArt src={buyErrorAvatar} alt="" width={64} height={80} />
                  <M.BuyErrorText>
                    <b>{t('cartCheckout.errorHeadline')}</b> {error ?? t('cartCheckout.errorBody')}
                  </M.BuyErrorText>
                </M.BuyError>
                <M.Ctas>
                  <M.Btn data-variant="outline" onClick={onClose}>
                    {t('buyModal.cancel')}
                  </M.Btn>
                  <M.Btn data-variant="purple" onClick={retry}>
                    {t('cartCheckout.tryAgain')}
                  </M.Btn>
                </M.Ctas>
              </M.Body>
            )}

            {/* Not enough credits — insufficient warning + pack picker */}
            {phase === 'nofunds' && (
              <M.Body>
                <M.Warning>
                  <WarningTriangleIcon />
                  <M.WarningText>
                    <b>{t('buyModal.insufficientFunds')}</b> {t('buyModal.warningNeedToBuy')}{' '}
                    <b>{t('buyModal.warningCreditsAmount', { count: Math.max(0, priceCredits - balanceCredits) })}</b>{' '}
                    {t('buyModal.warningToPurchase', { count: 1 })}
                    {/* The link opens the pack picker, so it is an offer to sell credits like any other and
                        goes with them in the iOS web view. The sentence above still states the shortfall. */}
                    {isIapMode() ? null : (
                      <>
                        {' '}
                        <M.WarningLink href={hrefFor('/credits')} target="_blank" rel="noopener noreferrer">
                          {t('buyModal.warningLearnMore')}
                        </M.WarningLink>
                      </>
                    )}
                  </M.WarningText>
                </M.Warning>
                <AssetRow item={item} priceCredits={priceCredits} />
                {paymentOptions.manaShortfall ? (
                  <PaymentCtas
                    options={[]}
                    totalCents={priceCents}
                    onPay={() => undefined}
                    shortfall={paymentOptions.manaShortfall}
                  />
                ) : null}
                {/* The pack picker, its running total and the Buy button are the actual sale of credits, so
                    inside the iOS web view none of them render — the app sells credits through In-App
                    Purchase. The warning and the item row stay, so the buyer is told what they are short by
                    and can close; they top up in the app and come back. */}
                {isIapMode() ? null : (
                  <>
                    <M.Packs data-testid="credit-packs">
                      {OFFER_PACKS.map(p => {
                        const packCredits = p.credits
                        const on = p.id === selectedPack
                        return (
                          <M.Pack key={p.id} data-on={on || undefined} onClick={() => setSelectedPack(p.id)}>
                            <M.PackIco src={packCoin} alt="" />
                            <M.PackAmount>{formatCredits(packCredits)}</M.PackAmount>
                            <M.PackUsd>(${p.usd.toFixed(2)})</M.PackUsd>
                          </M.Pack>
                        )
                      })}
                    </M.Packs>
                    <M.Total>
                      <M.TotalCredits>
                        <M.TotalIco />
                        <span>{formatCredits(OFFER_PACKS.find(p => p.id === selectedPack)?.credits ?? 0)}</span>
                      </M.TotalCredits>
                      <M.TotalUsd>${(OFFER_PACKS.find(p => p.id === selectedPack)?.usd ?? 0).toFixed(2)}</M.TotalUsd>
                    </M.Total>
                  </>
                )}
                <M.Ctas>
                  <M.Btn data-variant="outline" onClick={onClose}>
                    {t('buyModal.cancel')}
                  </M.Btn>
                  {isIapMode() ? null : (
                    <M.Btn data-variant="gradient" onClick={() => void buyCreditsAndItem()}>
                      {t('buyModal.buy')}
                    </M.Btn>
                  )}
                </M.Ctas>
              </M.Body>
            )}

            {/* Enough credits — Buy Asset */}
            {phase === 'ready' && (
              <M.Body>
                <AssetRow item={item} priceCredits={priceCredits} />
                <M.Ctas>
                  <M.Btn data-variant="gradient" data-full onClick={() => void confirm()}>
                    {t('buyModal.buy')}
                  </M.Btn>
                </M.Ctas>
              </M.Body>
            )}

            {/* Processing — completing transaction */}
            {phase === 'processing' && (
              <M.Body data-processing>
                <M.Logo src={loaderLogo} alt="" width={61} height={61} />
                <M.ProcessingText>
                  {resume ? t('buyModal.completingPurchase') : t('buyModal.completingTransaction')}
                </M.ProcessingText>
                <M.Progress aria-hidden>
                  <M.ProgressFill />
                </M.Progress>
              </M.Body>
            )}

            {/* Complete */}
            {phase === 'complete' && (
              <M.Body>
                {/* Same celebration as the /success page — the item is really the buyer's by here. */}
                <Confetti />
                <M.Success>
                  <SuccessCheckIcon />
                  <M.SuccessText>
                    <b>{t('getCredits.successTitle')}</b> {t('buyModal.successBody')}
                  </M.SuccessText>
                </M.Success>
                <M.Ctas>
                  <M.Btn data-variant="outline" onClick={() => navigate(myItemsRouteFor([item.category]))}>
                    {t('buyModal.myAssets')}
                  </M.Btn>
                  <M.Btn data-variant="ruby" onClick={onClose}>
                    {t('buyModal.tryInWorld')}
                    <JumpInIcon />
                  </M.Btn>
                </M.Ctas>
              </M.Body>
            )}
          </>
        )}
      </M.Card>
    </M.Modal>
  )
}

// The asset card row (thumbnail + name + creator + price) shared by the ready + nofunds states.
function AssetRow({ item, priceCredits }: { item: CatalogItem; priceCredits: number }) {
  return (
    <M.Asset>
      <M.AssetThumb>{item.thumbnail ? <img src={item.thumbnail} alt="" /> : null}</M.AssetThumb>
      <M.AssetInfo>
        <div>
          <M.AssetName title={item.name}>{item.name || t('buyModal.itemFallback')}</M.AssetName>
          {item.creator ? <M.AssetCreator address={item.creator} /> : null}
        </div>
        <M.AssetPrice>
          <M.AssetPriceIco />
          <span>{formatCredits(priceCredits)}</span>
        </M.AssetPrice>
      </M.AssetInfo>
    </M.Asset>
  )
}

export default BuyModal
