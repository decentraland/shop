import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CircularProgress } from 'decentraland-ui2'
import { useQueryClient } from '@tanstack/react-query'
import type { Trade } from '@dcl/schemas'
import { useWallet } from '~/store/wallet'
import { useBalance } from '~/hooks/useBalance'
import { resolveLiveTrade, usdWeiToCents, type CatalogItem } from '~/lib/api'
import { formatCredits } from '~/lib/currency'
import { track, errorCode, isUserRejection, purchaseItemsProps } from '~/lib/analytics'
import { captureError } from '~/lib/monitoring'
import { authorizeUsdCredit, cancelUsdIntents } from '~/lib/credits'
import { buyWithCredits } from '~/lib/buy'
import { buyGasless, waitForSettlement, GaslessUnavailableError, SettlementPendingError } from '~/lib/buy-gasless'
import { gaslessEnabled } from '~/lib/gasless-config'
import { isOwnTrade } from '~/lib/ownership'
import { CREDIT_PACKS, createPackCheckout } from '~/lib/payments'
import { RESUME_BUY_KEY } from '~/lib/resume-buy'
import { t } from '~/intl/i18n'
import { friendlyError, isInsufficient } from '~/lib/errors'
import { ErrorNotice } from '~/components/ErrorNotice'
import { CloseIcon } from '~/components/Icons/CloseIcon'
import { WarningTriangleIcon } from '~/components/Icons/WarningTriangleIcon'
import { SuccessCheckIcon } from '~/components/Icons/SuccessCheckIcon'
import { ArrowRightIcon } from '~/components/Icons/ArrowRightIcon'
import * as M from './modal.styles'

// The three top-up packs offered when the buyer is short on credits. The cheapest one that still
// clears the shortfall is pre-selected. Packs come from the canonical shop catalogue.
const OFFER_PACKS = CREDIT_PACKS.slice(0, 3)

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
  const qc = useQueryClient()
  const navigate = useNavigate()

  const [phase, setPhase] = useState<Phase>('loading')
  const [error, setError] = useState<string | null>(null)
  const [selectedPack, setSelectedPack] = useState<string>('')
  const [itemCredits, setItemCredits] = useState(item.priceCredits)
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

  const busy = phase === 'processing'
  const title =
    phase === 'complete'
      ? t('buyModal.titleComplete')
      : phase === 'nofunds'
        ? t('buyModal.titleNoFunds')
        : t('buyModal.titleBuy')

  return (
    <M.Modal role="dialog" aria-modal="true" aria-label={t('buyModal.dialogAria', { name: item.name })}>
      <M.Scrim onClick={busy ? undefined : onClose} aria-hidden />
      <M.Card data-tall={phase === 'processing' || phase === 'loading' || undefined}>
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
            <M.Packs>
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
            <M.Logo src="/icon-192.png" alt="" width={61} height={61} />
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
          {item.creator ? <M.AssetCreator>{t('search.byCreator', { name: item.creator })}</M.AssetCreator> : null}
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
