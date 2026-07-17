import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import type { Trade } from '@dcl/schemas'
import { useWallet } from '~/store/wallet'
import { useBalance } from '~/hooks/useBalance'
import { resolveLiveTrade, usdWeiToCents, type CatalogItem } from '~/lib/api'
import { CurrencyIcon } from '~/components/CurrencyIcon'
import { formatAmount } from '~/lib/currency'
import { track, errorCode, isUserRejection, purchaseItemsProps } from '~/lib/analytics'
import { captureError } from '~/lib/monitoring'
import { authorizeUsdCredit, cancelUsdIntents } from '~/lib/credits'
import { buyWithCredits } from '~/lib/buy'
import { buyGasless, waitForSettlement, GaslessUnavailableError, SettlementPendingError } from '~/lib/buy-gasless'
import { gaslessEnabled } from '~/lib/gasless-config'
import { isOwnTrade } from '~/lib/ownership'
import { CREDIT_PACKS } from '~/lib/payments'

function friendlyError(e: unknown): string {
  const err = e as { code?: number; message?: string }
  const msg = (err.message ?? '').toLowerCase()
  if (err.code === 4001 || msg.includes('reject') || msg.includes('denied') || msg.includes('cancel')) {
    return 'You cancelled the request.'
  }
  if (msg.includes('not for sale') || msg.includes('not found') || msg.includes('404')) {
    return 'This item was just sold or removed.'
  }
  if (msg.includes('your own listing')) return "You can't buy your own listing."
  return "Couldn't complete the purchase — please try again."
}

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
export function BuyModal({ item, onClose }: { item: CatalogItem; onClose: () => void }) {
  const { session } = useWallet()
  const { data: balance } = useBalance(session)
  const qc = useQueryClient()
  const navigate = useNavigate()

  const [phase, setPhase] = useState<Phase>('loading')
  const [error, setError] = useState<string | null>(null)
  const [selectedPack, setSelectedPack] = useState<string>('')
  const [locked, setLocked] = useState<{
    trade: Trade
    credit: Awaited<ReturnType<typeof authorizeUsdCredit>>['credit']
    maxCreditedValue: string
    credits: number
    usdCents: number
  } | null>(null)
  const reservedCreditIdRef = useRef<string | null>(null)

  const priceCredits = locked?.credits ?? item.priceCredits
  const balanceCredits = balance?.credits ?? 0

  // Step 1+2 on open: resolve the live trade, authorize, reserve the dollars → LOCK the price, then
  // branch on whether the balance covers it.
  useEffect(() => {
    let cancelled = false
    if (!session) {
      setPhase('error')
      setError('Sign in to check out.')
      return
    }
    ;(async () => {
      try {
        const trade = await resolveLiveTrade(item)
        if (!trade) throw new Error('not for sale')
        if (isOwnTrade(trade, session.address)) throw new Error("You can't buy your own listing.")
        const usdCents = usdWeiToCents((trade.received?.[0] as { amount?: string } | undefined)?.amount)
        if (!Number.isFinite(usdCents) || usdCents <= 0) throw new Error('price unavailable')
        const { credit, maxCreditedValue, usdCents: lockedCents } = await authorizeUsdCredit(
          session.identity,
          usdCents,
          trade.id
        )
        if (cancelled) {
          void cancelUsdIntents(session.identity, [credit.id]).catch(() => {})
          return
        }
        reservedCreditIdRef.current = credit.id
        const credits = Math.ceil(lockedCents / 10)
        setLocked({ trade, credit, maxCreditedValue, usdCents: lockedCents, credits })
        const enough = (balance?.credits ?? 0) >= credits
        if (!enough) {
          const shortfall = credits - (balance?.credits ?? 0)
          const cover = OFFER_PACKS.find(p => p.credits >= shortfall) ?? OFFER_PACKS[OFFER_PACKS.length - 1]
          setSelectedPack(cover.id)
          track('Shop Buy Credits Prompted', {
            from: 'item_checkout',
            credits_needed: credits,
            credits_balance: balance?.credits ?? 0,
            shortfall: Math.max(0, shortfall),
          })
        }
        setPhase(enough ? 'ready' : 'nofunds')
      } catch (e) {
        if (cancelled) return
        track(isUserRejection(e) ? 'Shop Purchase Cancelled' : 'Shop Purchase Failed', {
          step: 'authorize',
          error_code: errorCode(e),
        })
        setPhase('error')
        setError(friendlyError(e))
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

  async function confirm() {
    if (!session || !locked) return
    setPhase('processing')
    setError(null)
    let usedGasless = false
    try {
      const buyArgs = {
        trade: locked.trade,
        buyer: session.address,
        signer: session.signer,
        credits: [locked.credit],
        maxCreditedValue: locked.maxCreditedValue,
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
        transaction_hash: txHash ?? null,
      })
      void qc.invalidateQueries({ queryKey: ['usd-balance'] })
      setPhase('complete')
    } catch (e) {
      if (!isUserRejection(e)) captureError(e, { flow: 'buy', step: 'submit', gasless: usedGasless })
      void cancelUsdIntents(session.identity, [locked.credit.id]).catch(() => {})
      reservedCreditIdRef.current = null
      track(isUserRejection(e) ? 'Shop Purchase Cancelled' : 'Shop Purchase Failed', {
        step: 'submit',
        error_code: errorCode(e),
      })
      void qc.invalidateQueries({ queryKey: ['usd-balance'] })
      setError(friendlyError(e))
      setPhase('error')
    }
  }

  function goToCredits() {
    // Release the item reservation and route to the top-up flow with the chosen pack pre-selected.
    if (session && locked) void cancelUsdIntents(session.identity, [locked.credit.id]).catch(() => {})
    reservedCreditIdRef.current = null
    navigate(`/credits${selectedPack ? `?pack=${selectedPack}` : ''}`)
  }

  const busy = phase === 'processing'
  const title =
    phase === 'complete' ? 'Purchase complete!' : phase === 'nofunds' ? 'Buy Credits and Item' : 'Buy Asset'

  return (
    <div className="buy-modal" role="dialog" aria-modal="true" aria-label={`Buy ${item.name}`}>
      <div className="buy-modal__scrim" onClick={busy ? undefined : onClose} aria-hidden />
      <div className={`buy-modal__card${phase === 'processing' ? ' buy-modal__card--tall' : ''}`}>
        {/* Header: title + balance + divider */}
        <div className="buy-modal__head">
          <div className="buy-modal__head-row">
            <h2 className="buy-modal__title">{title}</h2>
            {!busy && (
              <button className="buy-modal__x" onClick={onClose} aria-label="Close">
                <svg viewBox="0 0 18 18" width="18" height="18" aria-hidden>
                  <path d="M4 4l10 10M14 4L4 14" stroke="#161518" strokeWidth="1.8" strokeLinecap="round" />
                </svg>
              </button>
            )}
          </div>
          <div className="buy-modal__balance">
            <span className="buy-modal__balance-label">
              {phase === 'nofunds' ? 'DCL Balance:' : 'My Credits Balance:'}
            </span>
            <CurrencyIcon className="buy-modal__balance-ico" />
            <span className="buy-modal__balance-value">{formatAmount(balanceCredits)}</span>
          </div>
        </div>

        {/* Loading (resolving + authorizing) */}
        {phase === 'loading' && <div className="buy-modal__body buy-modal__loading">Locking price…</div>}

        {/* Error */}
        {phase === 'error' && (
          <div className="buy-modal__body">
            <p className="buy-modal__error">{error}</p>
            <div className="buy-modal__ctas">
              <button className="buy-modal__btn buy-modal__btn--gradient" onClick={onClose}>
                Close
              </button>
            </div>
          </div>
        )}

        {/* Not enough credits — insufficient warning + pack picker */}
        {phase === 'nofunds' && (
          <div className="buy-modal__body">
            <div className="buy-modal__warning">
              <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden className="buy-modal__warning-ico">
                <path
                  d="M12 3L2 20h20L12 3z"
                  fill="none"
                  stroke="#691fa9"
                  strokeWidth="1.8"
                  strokeLinejoin="round"
                />
                <path d="M12 9v5" stroke="#691fa9" strokeWidth="1.8" strokeLinecap="round" />
                <circle cx="12" cy="17" r="1.1" fill="#691fa9" />
              </svg>
              <p className="buy-modal__warning-text">
                <b>Insufficient Funds.</b> You will need to buy{' '}
                <b>{Math.max(0, priceCredits - balanceCredits)} Credits</b> to purchase this item.
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
                    <span className="buy-modal__pack-amount">{formatAmount(packCredits)}</span>
                    <span className="buy-modal__pack-usd">(${p.usd.toFixed(2)})</span>
                  </button>
                )
              })}
            </div>
            <div className="buy-modal__total">
              <div className="buy-modal__total-credits">
                <CurrencyIcon className="buy-modal__total-ico" />
                <span>{formatAmount(OFFER_PACKS.find(p => p.id === selectedPack)?.credits ?? 0)}</span>
              </div>
              <span className="buy-modal__total-usd">
                ${(OFFER_PACKS.find(p => p.id === selectedPack)?.usd ?? 0).toFixed(2)}
              </span>
            </div>
            <div className="buy-modal__ctas">
              <button className="buy-modal__btn buy-modal__btn--outline" onClick={onClose}>
                Cancel
              </button>
              <button className="buy-modal__btn buy-modal__btn--gradient" onClick={goToCredits}>
                Buy
              </button>
            </div>
          </div>
        )}

        {/* Enough credits — Buy Asset */}
        {phase === 'ready' && (
          <div className="buy-modal__body">
            <AssetRow item={item} priceCredits={priceCredits} />
            <div className="buy-modal__ctas">
              <button className="buy-modal__btn buy-modal__btn--gradient buy-modal__btn--full" onClick={confirm}>
                Buy
              </button>
            </div>
          </div>
        )}

        {/* Processing — completing transaction */}
        {phase === 'processing' && (
          <div className="buy-modal__body buy-modal__processing">
            <img className="buy-modal__logo" src="/icon-192.png" alt="" width={61} height={61} />
            <div className="buy-modal__processing-text">Completing transaction…</div>
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
                <path d="M20 33l8 8 16-18" fill="none" stroke="#fff" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <p className="buy-modal__success-text">
                <b>Your purchase was successful!</b> You can find your item in the My Assets tab.
              </p>
            </div>
            <div className="buy-modal__ctas">
              <button className="buy-modal__btn buy-modal__btn--outline" onClick={() => navigate('/assets?tab=mine')}>
                My assets
              </button>
              <button className="buy-modal__btn buy-modal__btn--ruby" onClick={onClose}>
                Try in world
                <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden>
                  <path d="M5 12h12M13 7l5 5-5 5" fill="none" stroke="#fcfcfc" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </div>
          </div>
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
            {item.name || 'Item'}
          </div>
          {item.creator ? <div className="buy-modal__asset-creator">By {item.creator}</div> : null}
        </div>
        <div className="buy-modal__asset-price">
          <CurrencyIcon className="buy-modal__asset-price-ico" />
          <span>{formatAmount(priceCredits)}</span>
        </div>
      </div>
    </div>
  )
}

export default BuyModal
