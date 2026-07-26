import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CircularProgress } from 'decentraland-ui2'
import { useQueryClient } from '@tanstack/react-query'
import type { Trade } from '@dcl/schemas'
import { useWallet } from '~/store/wallet'
import { useBalance } from '~/hooks/useBalance'
import { useManaBalance } from '~/hooks/useManaBalance'
import { resolveLiveTrade, usdWeiToCents, type CatalogItem } from '~/lib/api'
import { CurrencyIcon } from '~/components/CurrencyIcon'
import { formatCredits } from '~/lib/currency'
import { readTradeManaPriceWei } from '~/lib/mana'
import { PaymentMethodStep } from '~/components/PaymentMethodStep'
import { computePaymentOptions, findOption } from '~/lib/payment-options'
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
import { CreatorName } from '~/components/CreatorName'
import { WarningIcon } from '~/components/WarningIcon'
import { RESUME_BUY_KEY } from '~/lib/resume-buy'
import { t } from '~/intl/i18n'
import { friendlyError, isInsufficient } from '~/lib/errors'
import { ErrorNotice } from '~/components/ErrorNotice'
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
        const usdCents = usdWeiToCents((trade.received?.[0] as { amount?: string } | undefined)?.amount)
        if (!Number.isFinite(usdCents) || usdCents <= 0) throw new Error('price unavailable')
        const credits = Math.ceil(usdCents / 10)
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
            void cancelUsdIntents(session.identity, [credit.id]).catch(() => {})
            return
          }
          reservedCreditIdRef.current = credit.id
          const lockedCredits = Math.ceil(lockedCents / 10)
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
        void cancelUsdIntents(session.identity, [reservedCreditIdRef.current]).catch(() => {})
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
    let usedGasless = false
    try {
      const buyArgs = {
        trade: lk.trade,
        buyer: session.address,
        signer: session.signer,
        credits: [lk.credit],
        maxCreditedValue: lk.maxCreditedValue
      }
      let txHash: string | undefined
      if (gaslessEnabled()) {
        try {
          txHash = await buyGasless(buyArgs)
          await waitForSettlement(txHash)
          usedGasless = true
        } catch (gaslessErr) {
          if (gaslessErr instanceof SettlementPendingError) {
            usedGasless = true
          } else if (gaslessErr instanceof GaslessUnavailableError) {
            txHash = await buyWithCredits(buyArgs)
          } else {
            throw gaslessErr
          }
        }
      } else {
        txHash = await buyWithCredits(buyArgs)
      }
      reservedCreditIdRef.current = null // consumed by the buy
      track('Shop Completed Purchase', {
        ...purchaseItemsProps([item]),
        payment_type: 'credits',
        no_crypto_step: usedGasless,
        transaction_hash: txHash ?? null
      })
      void qc.invalidateQueries({ queryKey: ['usd-balance'] })
      // A successful buy changes the item's listing/availability and the buyer's holdings, so refresh
      // the PDP money queries, the browse grids, My Assets and Activity — otherwise the PDP keeps
      // showing a Buy CTA for the token just bought and it's absent from My Assets/Activity until the
      // 30s staleTime lapses. Mirrors ItemDetail.refreshManage's key set.
      void qc.invalidateQueries({ queryKey: ['detail-trade'] })
      void qc.invalidateQueries({ queryKey: ['shop-item'] })
      void qc.invalidateQueries({ queryKey: ['owned-token', item.contractAddress, item.tokenId] })
      void qc.invalidateQueries({ queryKey: ['public-token', item.contractAddress, item.tokenId] })
      void qc.invalidateQueries({ queryKey: ['item-resales', item.contractAddress, item.itemId] })
      void qc.invalidateQueries({ queryKey: ['shop-items'] })
      void qc.invalidateQueries({ queryKey: ['catalog-items'] })
      void qc.invalidateQueries({ queryKey: ['my-assets'] })
      void qc.invalidateQueries({ queryKey: ['purchases'] })
      // The PDP's "You own N of this" note is keyed 'owned-item-count' — bump it so it reflects the copy
      // just bought. The homepage featured row ('overview-listings') and cart cross-sell ('upsell-listings')
      // should drop a just-sold last copy rather than keep offering it.
      void qc.invalidateQueries({ queryKey: ['owned-item-count'] })
      void qc.invalidateQueries({ queryKey: ['overview-listings'] })
      void qc.invalidateQueries({ queryKey: ['upsell-listings'] })
      setPhase('complete')
    } catch (e) {
      if (!isUserRejection(e)) captureError(e, { flow: 'buy', step: 'submit', gasless: usedGasless })
      void cancelUsdIntents(session.identity, [lk.credit.id]).catch(() => {})
      reservedCreditIdRef.current = null
      track(isUserRejection(e) ? 'Shop Purchase Cancelled' : 'Shop Purchase Failed', {
        step: 'submit',
        error_code: errorCode(e)
      })
      void qc.invalidateQueries({ queryKey: ['usd-balance'] })
      setError(friendlyError(e, t('buyModal.error.generic'), { sale: true }))
      setPhase('error')
    }
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
      void cancelUsdIntents(session.identity, [reservedCreditIdRef.current]).catch(() => {})
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
      void cancelUsdIntents(session.identity, [reservedCreditIdRef.current]).catch(() => {})
      reservedCreditIdRef.current = null
    }
    let partialCreditId: string | null = null
    try {
      const { credit } = await authorizeUsdCredit(session.identity, combined.creditsCents, trade.id)
      partialCreditId = credit.id
      const txHash = await buyWithCreditsAndMana({
        trade,
        buyer: session.address,
        signer: session.signer,
        credits: [credit],
        manaGapWei: combined.manaWei
      })
      partialCreditId = null // consumed on-chain
      track('Shop Completed Purchase', {
        ...purchaseItemsProps([item]),
        payment_type: 'credits_and_mana',
        transaction_hash: txHash ?? null
      })
      refreshAfterPurchase()
      setPhase('complete')
    } catch (e) {
      // The partial reservation never settled → release the dollars instead of stranding them.
      if (partialCreditId) void cancelUsdIntents(session.identity, [partialCreditId]).catch(() => {})
      if (!isUserRejection(e)) captureError(e, { flow: 'buy_credits_and_mana', step: 'submit' })
      track(isUserRejection(e) ? 'Shop Purchase Cancelled' : 'Shop Purchase Failed', {
        step: 'submit',
        error_code: errorCode(e)
      })
      void qc.invalidateQueries({ queryKey: ['usd-balance'] })
      setError(friendlyError(e, t('buyModal.error.generic'), { sale: true }))
      setPhase('error')
    }
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
    if (locked) void cancelUsdIntents(session.identity, [locked.credit.id]).catch(() => {})
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
  const hasManaRail = paymentOptions.options.some(o => o.method === 'mana' || o.method === 'combined')
  const methodMode = (phase === 'ready' || phase === 'nofunds') && hasManaRail

  const busy = phase === 'processing'
  const title =
    phase === 'complete'
      ? t('buyModal.titleComplete')
      : phase === 'nofunds'
        ? t('buyModal.titleNoFunds')
        : t('buyModal.titleBuy')

  return (
    <div
      className="buy-modal"
      role="dialog"
      aria-modal="true"
      aria-label={t('buyModal.dialogAria', { name: item.name })}
    >
      <div className="buy-modal__scrim" onClick={busy ? undefined : onClose} aria-hidden />
      <div
        className={`buy-modal__card${phase === 'processing' || phase === 'loading' ? ' buy-modal__card--tall' : ''}`}
      >
        {methodMode ? (
          <PaymentMethodStep
            item={item}
            priceCredits={priceCredits}
            priceCents={priceCents}
            options={paymentOptions.options}
            priceManaWei={manaPriceWei ?? 0n}
            onBuy={method =>
              void (method === 'mana' ? confirmMana() : method === 'combined' ? confirmCombined() : confirm())
            }
            onClose={onClose}
            busy={busy}
          />
        ) : (
          <>
            {/* Header: title + balance + divider */}
            <div className="buy-modal__head">
              <div className="buy-modal__head-row">
                <h2 className="buy-modal__title">{title}</h2>
                {!busy && (
                  <button className="buy-modal__x" onClick={onClose} aria-label={t('buyModal.close')}>
                    <svg viewBox="0 0 18 18" width="18" height="18" aria-hidden>
                      <path d="M4 4l10 10M14 4L4 14" stroke="#161518" strokeWidth="1.8" strokeLinecap="round" />
                    </svg>
                  </button>
                )}
              </div>
              <div className="buy-modal__balance">
                <span className="buy-modal__balance-label">
                  {phase === 'nofunds' ? t('buyModal.dclBalance') : t('buyModal.myCreditsBalance')}
                </span>
                <CurrencyIcon className="buy-modal__balance-ico" />
                <span className="buy-modal__balance-value">{formatCredits(balanceCredits)}</span>
              </div>
            </div>

            {/* Loading (resolving + authorizing) */}
            {phase === 'loading' && (
              <div className="buy-modal__body buy-modal__processing">
                <CircularProgress size={44} />
              </div>
            )}

            {/* Error */}
            {phase === 'error' && (
              <div className="buy-modal__body">
                <ErrorNotice message={error} />
                <div className="buy-modal__ctas">
                  <button className="buy-modal__btn buy-modal__btn--gradient" onClick={onClose}>
                    {t('buyModal.close')}
                  </button>
                </div>
              </div>
            )}

            {/* Not enough credits — insufficient warning + pack picker */}
            {phase === 'nofunds' && (
              <div className="buy-modal__body">
                <div className="buy-modal__warning">
                  <WarningIcon className="buy-modal__warning-ico" />
                  <p className="buy-modal__warning-text">
                    <b>{t('buyModal.insufficientFunds')}</b> {t('buyModal.warningNeedToBuy')}{' '}
                    <b>{t('buyModal.warningCreditsAmount', { count: Math.max(0, priceCredits - balanceCredits) })}</b>{' '}
                    {t('buyModal.warningToPurchase', { count: 1 })}
                  </p>
                </div>
                <AssetRow item={item} priceCredits={priceCredits} />
                <div className="buy-modal__packs">
                  {OFFER_PACKS.map(p => {
                    const packCredits = p.credits
                    const on = p.id === selectedPack
                    return (
                      <button
                        key={p.id}
                        className={`buy-modal__pack${on ? ' buy-modal__pack--on' : ''}`}
                        onClick={() => setSelectedPack(p.id)}
                      >
                        <CurrencyIcon className="buy-modal__pack-ico" />
                        <span className="buy-modal__pack-amount">{formatCredits(packCredits)}</span>
                        <span className="buy-modal__pack-usd">(${p.usd.toFixed(2)})</span>
                      </button>
                    )
                  })}
                </div>
                <div className="buy-modal__total">
                  <div className="buy-modal__total-credits">
                    <CurrencyIcon className="buy-modal__total-ico" />
                    <span>{formatCredits(OFFER_PACKS.find(p => p.id === selectedPack)?.credits ?? 0)}</span>
                  </div>
                  <span className="buy-modal__total-usd">
                    ${(OFFER_PACKS.find(p => p.id === selectedPack)?.usd ?? 0).toFixed(2)}
                  </span>
                </div>
                <div className="buy-modal__ctas">
                  <button className="buy-modal__btn buy-modal__btn--outline" onClick={onClose}>
                    {t('buyModal.cancel')}
                  </button>
                  <button className="buy-modal__btn buy-modal__btn--gradient" onClick={() => void buyCreditsAndItem()}>
                    {t('buyModal.buy')}
                  </button>
                </div>
              </div>
            )}

            {/* Enough credits — Buy Asset */}
            {phase === 'ready' && (
              <div className="buy-modal__body">
                <AssetRow item={item} priceCredits={priceCredits} />
                <div className="buy-modal__ctas">
                  <button
                    className="buy-modal__btn buy-modal__btn--gradient buy-modal__btn--full"
                    onClick={() => void confirm()}
                  >
                    {t('buyModal.buy')}
                  </button>
                </div>
              </div>
            )}

            {/* Processing — completing transaction */}
            {phase === 'processing' && (
              <div className="buy-modal__body buy-modal__processing">
                <img className="buy-modal__logo" src={loaderLogo} alt="" width={61} height={61} />
                <div className="buy-modal__processing-text">
                  {resume ? t('buyModal.completingPurchase') : t('buyModal.completingTransaction')}
                </div>
                <div className="buy-modal__progress" aria-hidden>
                  <span className="buy-modal__progress-fill" />
                </div>
              </div>
            )}

            {/* Complete */}
            {phase === 'complete' && (
              <div className="buy-modal__body">
                <div className="buy-modal__success">
                  <svg viewBox="0 0 64 64" width="64" height="64" aria-hidden>
                    <circle cx="32" cy="32" r="32" fill="#34ce74" />
                    <path
                      d="M20 33l8 8 16-18"
                      fill="none"
                      stroke="#fff"
                      strokeWidth="5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                  <p className="buy-modal__success-text">
                    <b>{t('getCredits.successTitle')}</b> {t('buyModal.successBody')}
                  </p>
                </div>
                <div className="buy-modal__ctas">
                  <button
                    className="buy-modal__btn buy-modal__btn--outline"
                    onClick={() => navigate('/assets?tab=mine')}
                  >
                    {t('buyModal.myAssets')}
                  </button>
                  <button className="buy-modal__btn buy-modal__btn--ruby" onClick={onClose}>
                    {t('buyModal.tryInWorld')}
                    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden>
                      <path
                        d="M5 12h12M13 7l5 5-5 5"
                        fill="none"
                        stroke="#fcfcfc"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

// The asset card row (thumbnail + name + creator + price) shared by the ready + nofunds states.
function AssetRow({ item, priceCredits }: { item: CatalogItem; priceCredits: number }) {
  return (
    <div className="buy-modal__asset">
      <div className="buy-modal__asset-thumb">{item.thumbnail ? <img src={item.thumbnail} alt="" /> : null}</div>
      <div className="buy-modal__asset-info">
        <div>
          <div className="buy-modal__asset-name" title={item.name}>
            {item.name || t('buyModal.itemFallback')}
          </div>
          {item.creator ? <CreatorName address={item.creator} className="buy-modal__asset-creator" /> : null}
        </div>
        <div className="buy-modal__asset-price">
          <CurrencyIcon className="buy-modal__asset-price-ico" />
          <span>{formatCredits(priceCredits)}</span>
        </div>
      </div>
    </div>
  )
}

export default BuyModal
