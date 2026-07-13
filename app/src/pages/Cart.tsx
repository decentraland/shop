import { useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useCart } from '~/store/cart'
import { useWallet } from '~/store/wallet'
import { useBalance } from '~/hooks/useBalance'
import { authorizeUsdCredit, cancelUsdIntents, devMintUsd } from '~/lib/credits'
import { fetchTradeForItem, fetchTrade, fetchListings } from '~/lib/api'
import { buyManyWithCredits, type CreditPurchase } from '~/lib/buy'
import { buyManyGasless, waitForSettlement, GaslessUnavailableError, SettlementPendingError } from '~/lib/buy-gasless'
import { reviewCart, type CartReview, type ResolvedLine, type TradeResolver } from '~/lib/cart-checkout'
import { gaslessEnabled } from '~/lib/gasless-config'
import { CURRENCY } from '~/lib/currency'
import { CurrencyIcon } from '~/components/CurrencyIcon'
import { t } from '~/intl/i18n'
import { track, purchaseItemsProps, errorCode, isUserRejection, creditsToUsd } from '~/lib/analytics'
import { captureError } from '~/lib/monitoring'
import { AssetCard } from '~/components/AssetCard'
import { CreatorBadge } from '~/components/CreatorBadge'

function friendlyError(e: unknown): string {
  const err = e as { code?: number; message?: string }
  const msg = (err.message ?? '').toLowerCase()
  if (err.code === 4001 || msg.includes('reject') || msg.includes('denied') || msg.includes('cancel')) {
    return 'You cancelled the request.'
  }
  if (msg.includes('insufficient')) return `You don't have enough ${CURRENCY.name} — get more first.`
  if (msg.includes('no active listing') || msg.includes('your own listing')) return err.message as string
  return "Couldn't complete checkout — please try again."
}

// How long a pending review stays valid before we re-resolve on Confirm. Past this, live prices may
// have drifted (or listings sold), so we re-review instead of charging a stale total.
const REVIEW_TTL_MS = 120_000

// One-line summary of the rows we pruned so the buyer knows why the cart shrank.
function dropNotice(review: CartReview): string {
  const parts: string[] = []
  if (review.unavailable.length) parts.push(`${review.unavailable.length} no longer available`)
  if (review.own.length) parts.push(`${review.own.length} you can't buy (your own listing)`)
  return `Removed ${parts.join(' and ')} from your cart.`
}

export function Cart() {
  const items = useCart(s => s.items)
  const remove = useCart(s => s.remove)
  const clear = useCart(s => s.clear)
  const setFittingOpen = useCart(s => s.setFittingOpen)
  const { session } = useWallet()

  // Try-on is only meaningful for wearables (emotes aren't "worn").
  const hasWearable = items.some(i => i.category !== 'emote')

  // Last-minute upsell: more credit-buyable listings not already in the cart.
  const { data: suggested } = useQuery({ queryKey: ['upsell-listings'], queryFn: () => fetchListings({ first: 40 }), staleTime: 60_000 })
  const { data: balance } = useBalance(session)
  const qc = useQueryClient()
  const navigate = useNavigate()

  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  // A resolved order awaiting explicit confirmation because prices or availability changed since the
  // items were added (mirrors MarketCheckout's lock-then-confirm). null = no pending confirmation.
  const [review, setReview] = useState<CartReview | null>(null)
  // When the pending review was resolved, so Confirm can detect a stale one and re-resolve.
  const reviewedAtRef = useRef(0)

  const shownTotal = items.reduce((sum, i) => sum + i.priceCredits, 0)
  // While a review is pending the total reflects the live (re-resolved) prices of what's still buyable.
  const total = review ? review.liveTotalCredits : shownTotal
  const inCart = new Set(items.map(i => i.id))
  const upsell = (suggested?.items ?? []).filter(i => !inCart.has(i.id)).slice(0, 6)
  // Live-price lookup for the rows while a review is pending.
  const lineById = new Map(review?.buyable.map(l => [l.item.id, l] as const))

  const resolveTrade: TradeResolver = item =>
    item.tradeId ? fetchTrade(item.tradeId) : fetchTradeForItem(item.contractAddress, item.itemId ?? '')

  // Any manual cart edit invalidates a pending confirmation (its snapshot no longer matches the cart).
  function editCart(fn: () => void) {
    fn()
    setReview(null)
    setNotice(null)
    setError(null)
  }

  // Charge an already-reviewed set of buyable lines: authorize each (reserving the dollars), then spend
  // every credit in one transaction. The CALLER owns `busy`. Releases reservations on failure.
  async function charge(lines: ResolvedLine[]) {
    if (!session || lines.length === 0) return
    // Carry the LIVE price so the success page + analytics reflect what was actually charged.
    const purchased = lines.map(l => ({ ...l.item, priceCredits: l.priceCredits }))
    const reservedSalts: string[] = []
    let step: 'authorize' | 'submit' = 'authorize'
    let usedGasless = false
    try {
      // Authorize SEQUENTIALLY (not Promise.all): each authorize reserves against the running USD
      // balance, so ordering is what makes the insufficient-credits guard correct — parallel calls
      // would all read the pre-reservation balance and could over-authorize.
      setStatus('Preparing your order…')
      const purchases: CreditPurchase[] = []
      for (const line of lines) {
        const { credit, maxCreditedValue } = await authorizeUsdCredit(session.identity, line.usdCents, line.item.tradeId)
        reservedSalts.push(credit.id)
        purchases.push({ trade: line.trade, credits: [credit], maxCreditedValue })
      }

      setStatus('Confirming your purchase…')
      step = 'submit'
      let hashes: string[] = []
      if (gaslessEnabled()) {
        try {
          hashes = await buyManyGasless({ purchases, buyer: session.address, signer: session.signer })
          // Once buyManyGasless returns, every group's meta-tx is BROADCAST. A group that's only
          // pending (unconfirmed within the window) may still land, so we must NOT release the
          // reservations — the credits-server reconciles those against the indexed CreditUsed event.
          // Release (rethrow) ONLY when every failure is a hard revert and none is still pending.
          const settled = await Promise.allSettled(hashes.map(h => waitForSettlement(h)))
          const failures = settled.flatMap(r => (r.status === 'rejected' ? [r.reason] : []))
          if (failures.length && !failures.some(r => r instanceof SettlementPendingError)) {
            throw failures[0]
          }
          // TODO(cart-hardening): a mixed batch (one group reverted + one still pending) keeps the
          // reverted group's reservation locked until the credits-server TTL, since we can't map a
          // per-group failure back to its items without buyManyGasless returning per-group results.
          // Bounded (no double-spend, no loss); revisit with per-group settlement tracking.
          usedGasless = true
        } catch (gaslessErr) {
          if (!(gaslessErr instanceof GaslessUnavailableError)) throw gaslessErr
          hashes = await buyManyWithCredits({ purchases, buyer: session.address, signer: session.signer })
        }
      } else {
        hashes = await buyManyWithCredits({ purchases, buyer: session.address, signer: session.signer })
      }

      // Remove exactly what we bought (leaves any not-charged rows in place for a retry).
      lines.forEach(l => remove(l.item.id))
      setReview(null)
      setStatus('Purchased! 🎉')
      track('Shop Completed Purchase', {
        ...purchaseItemsProps(purchased),
        payment_type: 'credits',
        no_crypto_step: usedGasless,
        transaction_hash: hashes[0] ?? null
      })
      void qc.invalidateQueries({ queryKey: ['usd-balance'] })
      navigate('/success', { state: { items: purchased, txHash: hashes[0] } })
    } catch (e) {
      if (!isUserRejection(e)) captureError(e, { flow: 'cart_checkout', step, cart_size: lines.length })
      track(isUserRejection(e) ? 'Shop Purchase Cancelled' : 'Shop Purchase Failed', {
        step,
        error_code: errorCode(e),
        value_usd: creditsToUsd(purchased.reduce((n, i) => n + i.priceCredits, 0)),
        cart_size: lines.length
      })
      // Release any dollars we reserved so the balance isn't stuck until the TTL (~15 min).
      if (reservedSalts.length) {
        try {
          await cancelUsdIntents(session.identity, reservedSalts)
        } catch (relErr) {
          captureError(relErr, { flow: 'cart_checkout', step: 'release' })
        }
        void qc.invalidateQueries({ queryKey: ['usd-balance'] })
      }
      setError(friendlyError(e))
      setStatus(null)
    }
  }

  async function checkout() {
    if (!session) {
      setError('Sign in to check out.')
      return
    }
    setError(null)
    setNotice(null)
    setBusy(true)
    track('Shop Started Checkout', {
      cart_size: items.length,
      cart_value_credits: shownTotal,
      cart_value_usd: creditsToUsd(shownTotal),
      has_sufficient_credits: (balance?.credits ?? 0) >= shownTotal
    })
    try {
      // Resolve every item's LIVE listing first — never charge a stale snapshot, and never let one bad
      // item abort the basket.
      setStatus('Reviewing your cart…')
      const rev = await reviewCart(items, session.address, resolveTrade)

      // Prune the rows we can't buy (sold/cancelled, or the buyer's own listing) and say what happened.
      const dropped = [...rev.unavailable, ...rev.own]
      if (dropped.length) {
        dropped.forEach(i => remove(i.id))
        setNotice(dropNotice(rev))
      }
      if (rev.buyable.length === 0) {
        setError('None of these items are available to buy right now.')
        setReview(null)
        setStatus(null)
        return
      }
      // Anything changed (a re-price, or rows dropped) → show the reconciled order and require an
      // explicit second confirmation so the buyer is never silently charged a different total.
      if (rev.orderChanged) {
        setReview(rev)
        reviewedAtRef.current = Date.now()
        setStatus(null)
        return
      }
      await charge(rev.buyable)
    } catch (e) {
      captureError(e, { flow: 'cart_checkout', step: 'review', cart_size: items.length })
      setError(friendlyError(e))
      setStatus(null)
    } finally {
      setBusy(false)
    }
  }

  async function confirmPurchase() {
    if (!review) return
    if (!session) {
      setError('Sign in to check out.')
      return
    }
    // A review left sitting too long may be pricing off stale trades (a sale ended, a listing sold).
    // Re-resolve instead of charging it: checkout() re-reviews and, if it still differs, re-prompts.
    if (Date.now() - reviewedAtRef.current > REVIEW_TTL_MS) {
      setReview(null)
      setNotice(null)
      await checkout()
      return
    }
    setError(null)
    setBusy(true)
    try {
      await charge(review.buyable)
    } finally {
      setBusy(false)
    }
  }

  async function getTestCredits() {
    if (!session) return
    setError(null)
    setBusy(true)
    try {
      setStatus(`Adding test ${CURRENCY.name}…`)
      await devMintUsd(session.address, 1000) // $10 = 100 credits
      setStatus(`Test ${CURRENCY.name} added.`)
      void qc.invalidateQueries({ queryKey: ['usd-balance'] })
    } catch (e) {
      captureError(e, { flow: 'get_test_credits' })
      setError(`Could not add test ${CURRENCY.name} (is the credits service running with dev mint enabled?)`)
      setStatus(null)
    } finally {
      setBusy(false)
    }
  }

  if (items.length === 0) {
    return (
      <div className="cart cart--empty">
        <span className="ico ico-cart cart-empty__ico" aria-hidden />
        <p className="cart-empty__title">{t('cart.empty.title')}</p>
        <p className="muted">{t('cart.empty.body')}</p>
        <Link className="btn btn--purple" to="/assets">{t('cart.empty.cta')}</Link>
      </div>
    )
  }

  return (
    <div className="cart">
      <h1>Cart ({items.length})</h1>

      <div className="cart__list">
        {items.map(item => {
          const line = lineById.get(item.id)
          const livePrice = line ? line.priceCredits : item.priceCredits
          const changed = !!line && line.priceCredits !== item.priceCredits
          return (
            <div className="cart__row" key={item.id}>
              <div className="cart__thumb">{item.thumbnail ? <img src={item.thumbnail} alt={item.name} /> : null}</div>
              <div className="cart__info">
                <div className="cart__name">{item.name}</div>
                {item.creator ? <CreatorBadge address={item.creator} className="cart__creator" linkToProfile /> : null}
              </div>
              <div className="cart__price">
                <CurrencyIcon className="ccy-mark" /> {livePrice}
                {changed ? (
                  <span className="muted" style={{ marginLeft: 6, textDecoration: 'line-through' }}>{item.priceCredits}</span>
                ) : null}
              </div>
              <button
                className="cart__remove"
                onClick={() => editCart(() => remove(item.id))}
                disabled={busy}
                aria-label={`Remove ${item.name}`}
                title="Remove"
              >
                <span className="ico ico-trash" aria-hidden />
              </button>
            </div>
          )
        })}
      </div>

      <div className="cart__foot">
        <div className="cart__total">
          <div className="cart__total-line">Total <strong><CurrencyIcon className="ccy-mark" /> {total}</strong></div>
          {session ? <div className="muted cart__balance">Your balance: <CurrencyIcon className="ccy-mark" /> {balance?.credits ?? 0}</div> : null}
        </div>
        <div className="cart__actions">
          {hasWearable ? (
            <button className="btn btn--ghost" onClick={() => setFittingOpen(true)} disabled={busy}>Try on outfit</button>
          ) : null}
          <Link className="btn btn--ghost" to="/credits">Get {CURRENCY.name}</Link>
          <button className="btn btn--purple cart__checkout" onClick={review ? confirmPurchase : checkout} disabled={busy}>
            {busy ? 'Working…' : review ? 'Confirm purchase' : 'Checkout'}
          </button>
        </div>
      </div>

      {/* Utility actions kept subtle so they don't compete with Checkout. */}
      <div className="cart__utils">
        <button className="link" onClick={() => editCart(clear)} disabled={busy}>Clear cart</button>
        {import.meta.env.DEV ? (
          <button className="link" onClick={getTestCredits} disabled={busy || !session}>Get test {CURRENCY.name} (dev)</button>
        ) : null}
      </div>

      {review ? (
        <p className="muted" style={{ marginTop: 12 }}>
          Prices or availability changed since you added these — review the updated total and confirm to buy.
        </p>
      ) : null}
      {notice ? <p className="muted" style={{ marginTop: 12 }}>{notice}</p> : null}
      {status ? <p className="muted" style={{ marginTop: 12 }}>{status}</p> : null}
      {error ? <p className="error" style={{ marginTop: 12 }}>{error}</p> : null}

      {upsell.length > 0 ? (
        <section className="row cart-upsell">
          <div className="row__head"><h2 className="row__title">You might also like</h2></div>
          <div className="row__track">
            {upsell.map(i => <AssetCard key={i.id} item={i} />)}
          </div>
        </section>
      ) : null}
    </div>
  )
}
