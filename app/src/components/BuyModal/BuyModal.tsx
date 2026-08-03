import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CircularProgress } from 'decentraland-ui2'
import { useQueryClient } from '@tanstack/react-query'
import { TradeAssetType, type Trade } from '@dcl/schemas'
import { useWallet } from '~/store/wallet'
import { useBalance } from '~/hooks/useBalance'
import { useManaBalance } from '~/hooks/useManaBalance'
import { resolveLiveTrade, type CatalogItem } from '~/lib/api'
import { formatCredits, usdCentsToCredits } from '~/lib/currency'
import { readTradeManaPriceWei } from '~/lib/mana'
import { lineUsdCents } from '~/lib/cart-checkout'
import { readManaUsdRate, type ManaRate } from '~/lib/mana-rate'
import { config } from '~/config'
import { PaymentMethodStep } from '~/components/PaymentMethodStep'
import { PaymentCtas } from '~/components/PaymentCtas'
import { invalidateAfterPurchase } from '~/lib/after-purchase'
import { AuthorizeStep } from '~/components/AuthorizeStep'
import { ContractName, getContract, getContractName } from 'decentraland-transactions'
import manaLight from '~/assets/mana-matic-light.svg'
import {
  getAuthorizationStatus,
  getManaSpendingAuthorization,
  needsApprovalStep,
  type ShopAuthorization
} from '~/lib/authorizations'
import { computePaymentOptions, findOption, type PaymentMethod } from '~/lib/payment-options'
import { track, errorCode, isUserRejection, purchaseItemsProps } from '~/lib/analytics'
import { captureError } from '~/lib/monitoring'
import { authorizeUsdCredit, cancelUsdIntents } from '~/lib/credits'
import { buyWithCredits } from '~/lib/buy'
import { buyWithMana, buyWithCreditsAndMana } from '~/lib/buy-mana'
import { buyGasless, waitForSettlement, GaslessUnavailableError, SettlementPendingError } from '~/lib/buy-gasless'
import { gaslessEnabled } from '~/lib/gasless-config'
import { isOwnTrade } from '~/lib/ownership'
import { createPackCheckout, MAX_OFFER_PACKS } from '~/lib/payments'
import { useCreditPacks } from '~/hooks/useCreditPacks'
import { RESUME_BUY_KEY } from '~/lib/resume-buy'
import { t } from '~/intl/i18n'
import { friendlyError, isInsufficient } from '~/lib/errors'
import { ErrorNotice } from '~/components/ErrorNotice'
import { CloseIcon } from '~/components/Icons/CloseIcon'
import { WarningTriangleIcon } from '~/components/Icons/WarningTriangleIcon'
import { SuccessCheckIcon } from '~/components/Icons/SuccessCheckIcon'
import { ArrowRightIcon } from '~/components/Icons/ArrowRightIcon'
import * as M from './modal.styles'
import loaderLogo from '~/assets/credits/loader-logo.svg'

type Phase = 'loading' | 'ready' | 'nofunds' | 'processing' | 'complete' | 'error'

/**
 * Buy Now modal for the item detail page — the pixel-perfect purchase flow (Figma "Buy Asset directly
 * from PDP"). Owns the whole flow so the PDP just opens it:
 *   1. resolve the item's live trade + authorize the credit (LOCK the price)
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
   * The MANA/USD rate, but only for a LEGACY trade — a native (USD-pegged) one prices from its own amount
   * and needs no oracle at all. Awaited through the react-query cache, so it is the same read the grid
   * already made rather than a second oracle round-trip. An unreachable/stale oracle resolves to undefined,
   * which makes lineUsdCents return 0 and surfaces as "price unavailable" instead of a guessed price.
   *
   * Cart.tsx has a same-named function with a DIFFERENT signature: parameterless, because a mixed basket
   * needs the rate resolved before it can tell whether any line requires it. This one takes the trade and
   * can skip the read outright. Don't copy one into the other's place — they answer different questions.
   */
  async function ensureManaRate(trade: Trade): Promise<ManaRate | undefined> {
    const priceAsset = trade.received?.[0] as { assetType?: number } | undefined
    if (priceAsset?.assetType === Number(TradeAssetType.USD_PEGGED_MANA)) return undefined
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
  const [selectedPack, setSelectedPack] = useState<string>('')
  const [itemCredits, setItemCredits] = useState(item.priceCredits)
  // The MANA (wei) this trade costs, read from the oracle once the price locks — null until read (or
  // if the read fails, in which case MANA simply isn't offered and the credits path is unaffected).
  const [manaPriceWei, setManaPriceWei] = useState<bigint | null>(null)
  // The live trade + its USD price, kept even when the credits balance falls short. The MANA rails need
  // them in the 'nofunds' phase too — that's exactly where paying with MANA (alone or mixed) rescues a
  // purchase the credits alone can't cover, so we must not throw the trade away like the old flow did.
  const [resolvedTrade, setResolvedTrade] = useState<Trade | null>(null)
  const [priceCents, setPriceCents] = useState(0)
  const [locked, setLocked] = useState<{
    trade: Trade
    credit: Awaited<ReturnType<typeof authorizeUsdCredit>>['credit']
    maxCreditedValue: string
    credits: number
    usdCents: number
  } | null>(null)
  const reservedCreditIdRef = useRef<string | null>(null)
  /**
   * Whether this purchase's transaction was BROADCAST — i.e. whether its credits may already be consumed
   * on-chain. Once true, NOTHING may release them.
   *
   * Releasing a consumed credit hands the buyer back money they have already spent: the balance rises, the
   * reconciler debits it again once the squid indexes the consumption, and anything bought in that gap drives
   * the balance negative. A ref rather than state because the release paths are callbacks and effect cleanups
   * that would close over a stale value.
   *
   * Reset to false on a definitive REVERT: a reverted call rolls back, so the credit was not consumed and
   * releasing it is both safe and necessary — otherwise that much of the balance is stranded until the TTL.
   */
  const broadcastRef = useRef(false)

  const priceCredits = locked?.credits ?? itemCredits
  const balanceCredits = balance?.credits ?? 0

  // Step 1+2 on open: resolve the live trade, authorize, reserve the dollars → LOCK the price, then
  // branch on whether the balance covers it.
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
        const trade = await resolveLiveTrade(item)
        if (!trade) throw new Error('not for sale')
        if (isOwnTrade(trade, session.address)) throw new Error("You can't buy your own listing.")
        // A native trade prices from its own USD amount; a LEGACY (plain-ERC20) one is denominated in
        // MANA and needs the oracle. The rate is AWAITED rather than read from a possibly-unresolved
        // query — mirrors Cart.basketTotals, and deciding off a missing rate would report
        // "price unavailable" for a perfectly buyable item on a slow oracle read. Resolves through the
        // react-query cache, so it is the same read the grid already made.
        const usdCents = lineUsdCents(trade, await ensureManaRate(trade))
        if (!Number.isFinite(usdCents) || usdCents <= 0) throw new Error('price unavailable')
        const credits = usdCentsToCredits(usdCents)
        if (cancelled) return
        setItemCredits(credits)
        // Keep the trade + exact price around for the MANA rails, whichever branch we take next.
        setResolvedTrade(trade)
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
          } = await authorizeUsdCredit(session.identity, usdCents, trade.id)
          if (cancelled) {
            releaseReservation([credit.id])
            return
          }
          reservedCreditIdRef.current = credit.id
          const lockedCredits = usdCentsToCredits(lockedCents)
          setItemCredits(lockedCredits)
          const lockedObj = { trade, credit, maxCreditedValue, usdCents: lockedCents, credits: lockedCredits }
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
        releaseReservation([reservedCreditIdRef.current])
        reservedCreditIdRef.current = null
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Once the price is locked AND the buyer holds MANA, read the trade's MANA price so we can offer the
  // "pay with MANA" step. Runs off the loading path so it never blocks/gates the default credits flow;
  // a failed oracle read just leaves manaPriceWei null (MANA not offered).
  useEffect(() => {
    const trade = locked?.trade ?? resolvedTrade
    if (!trade) return
    if (phase !== 'ready' && phase !== 'nofunds') return
    if (manaBalanceWei == null || manaBalanceWei <= 0n) return
    if (manaPriceWei !== null) return
    let cancelled = false
    void readTradeManaPriceWei(trade)
      .then(wei => {
        if (!cancelled) setManaPriceWei(wei)
      })
      .catch(err => {
        if (import.meta.env.DEV) console.warn('[buyModal] mana price read failed', err)
      })
    return () => {
      cancelled = true
    }
  }, [phase, locked, resolvedTrade, manaBalanceWei, manaPriceWei])

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
        trade: lk.trade,
        buyer: session.address,
        signer: session.signer,
        credits: [lk.credit],
        maxCreditedValue: lk.maxCreditedValue,
        // The transaction is on its way: from here on the credit may be consumed on-chain, so no failure
        // may release it. A revert is the one exception — it rolled back, so the credit is untouched.
        onBroadcast: () => {
          broadcastRef.current = true
        },
        onReverted: () => {
          broadcastRef.current = false
        }
      }
      if (gaslessEnabled()) {
        try {
          txHash = await buyGasless(buyArgs)
          // Relayed, so it is broadcast the moment buyGasless resolves.
          broadcastRef.current = true
          await waitForSettlement(txHash)
          usedGasless = true
        } catch (gaslessErr) {
          if (gaslessErr instanceof SettlementPendingError) {
            usedGasless = true
          } else if (gaslessErr instanceof GaslessUnavailableError) {
            // Nothing was relayed, so the credit is still untouched and the direct rail starts clean.
            broadcastRef.current = false
            txHash = await buyWithCredits(buyArgs)
          } else {
            // waitForSettlement throws a plain Error only for a status-0 receipt: the credit was NOT
            // consumed, so it must be released rather than stranded until the TTL.
            broadcastRef.current = false
            throw gaslessErr
          }
        }
      } else {
        txHash = await buyWithCredits(buyArgs)
      }
    } catch (e) {
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
    reservedCreditIdRef.current = null // consumed by the buy
    try {
      track('Shop Completed Purchase', {
        ...purchaseItemsProps([item]),
        payment_type: 'credits',
        no_crypto_step: usedGasless,
        transaction_hash: txHash ?? null
      })
      invalidateAfterPurchase(qc, item)
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
   * Every release used to be a bare `cancelUsdIntents` call, and three of the six could run after the
   * transaction had gone out: the credits catch, the combined catch, and the effect cleanup on unmount (the
   * ref is only cleared once the await resolves, so closing the modal mid-flight reaches it). Funnelling them
   * through one guarded helper is what makes "never release spent credits" a property of the component rather
   * than something each call site has to remember.
   */
  function releaseReservation(ids: string[]) {
    if (!session || ids.length === 0) return
    if (broadcastRef.current) return
    void cancelUsdIntents(session.identity, ids).catch(() => {})
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
    // don't cover it, so MANA is the only way) — hence the fallback to the plain resolved trade.
    const trade = locked?.trade ?? resolvedTrade
    if (!session || !trade) return
    if (reservedCreditIdRef.current) {
      releaseReservation([reservedCreditIdRef.current])
      reservedCreditIdRef.current = null
    }
    setPhase('processing')
    setError(null)
    try {
      const txHash = await buyWithMana({
        trade,
        buyer: session.address,
        signer: session.signer
      })
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
    const trade = locked?.trade ?? resolvedTrade
    const combined = findOption(paymentOptions, 'combined')
    if (!session || !trade || !combined) return
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
      const { credit } = await authorizeUsdCredit(session.identity, combined.creditsCents, trade.id)
      partialCreditId = credit.id
      txHash = await buyWithCreditsAndMana({
        trade,
        buyer: session.address,
        signer: session.signer,
        credits: [credit],
        manaGapWei: combined.manaWei,
        // Same rule as the credits-only rail: this spends the credit through useCredits, so once it is out
        // the reservation is untouchable — unless the call reverted, which consumed nothing.
        onBroadcast: () => {
          broadcastRef.current = true
        },
        onReverted: () => {
          broadcastRef.current = false
        }
      })
    } catch (e) {
      // The partial reservation never settled → release the dollars instead of stranding them.
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
    try {
      track('Shop Completed Purchase', {
        ...purchaseItemsProps([item]),
        payment_type: 'credits_and_mana',
        transaction_hash: txHash ?? null
      })
      refreshAfterPurchase()
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

  /** The MANA allowance a rail needs: the marketplace moves it for MANA-only, the CreditsManager for mixed. */
  function manaAuthFor(rail: 'mana' | 'combined', trade: Trade): ShopAuthorization {
    const spender =
      rail === 'mana'
        ? getContract(getContractName(trade.contract), trade.chainId).address
        : getContract(ContractName.CreditsManager, trade.chainId).address
    return getManaSpendingAuthorization(trade.chainId, spender)
  }

  function runRail(rail: PaymentMethod) {
    if (rail === 'mana') void confirmMana()
    else if (rail === 'combined') void confirmCombined()
    else void confirm()
  }

  async function startPurchase(rail: PaymentMethod) {
    const trade = locked?.trade ?? resolvedTrade
    if (rail === 'credits' || !trade || !session) {
      runRail(rail)
      return
    }
    const auth = manaAuthFor(rail, trade)
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

  const busy = phase === 'processing'
  const title =
    phase === 'complete'
      ? t('buyModal.titleComplete')
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

            {/* Error */}
            {phase === 'error' && (
              <M.Body>
                <ErrorNotice message={error} />
                <M.Ctas>
                  <M.Btn data-variant="gradient" onClick={onClose}>
                    {t('buyModal.close')}
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
                <M.Packs data-testid="credit-packs">
                  {OFFER_PACKS.map(p => {
                    const packCredits = p.credits
                    const on = p.id === selectedPack
                    return (
                      <M.Pack key={p.id} data-on={on || undefined} onClick={() => setSelectedPack(p.id)}>
                        <M.PackIco />
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
                <M.Ctas>
                  <M.Btn data-variant="outline" onClick={onClose}>
                    {t('buyModal.cancel')}
                  </M.Btn>
                  <M.Btn data-variant="gradient" onClick={() => void buyCreditsAndItem()}>
                    {t('buyModal.buy')}
                  </M.Btn>
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
                <M.Success>
                  <SuccessCheckIcon />
                  <M.SuccessText>
                    <b>{t('getCredits.successTitle')}</b> {t('buyModal.successBody')}
                  </M.SuccessText>
                </M.Success>
                <M.Ctas>
                  <M.Btn data-variant="outline" onClick={() => navigate('/assets?tab=mine')}>
                    {t('buyModal.myAssets')}
                  </M.Btn>
                  <M.Btn data-variant="ruby" onClick={onClose}>
                    {t('buyModal.tryInWorld')}
                    <ArrowRightIcon />
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
