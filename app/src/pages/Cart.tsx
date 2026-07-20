import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useCart } from '~/store/cart'
import { useFavorites } from '~/store/favorites'
import { useWallet } from '~/store/wallet'
import { useBalance } from '~/hooks/useBalance'
import { authorizeUsdCredit, cancelUsdIntents, devMintUsd } from '~/lib/credits'
import { resolveLiveTrade, fetchListings } from '~/lib/api'
import { buyManyWithCredits, type CreditPurchase } from '~/lib/buy'
import { buyManyGasless, waitForSettlement, GaslessUnavailableError, SettlementPendingError } from '~/lib/buy-gasless'
import {
  reviewCart,
  RESUME_CART_KEY,
  type CartReview,
  type ResolvedLine,
  type TradeResolver
} from '~/lib/cart-checkout'
import { gaslessEnabled } from '~/lib/gasless-config'
import { CURRENCY } from '~/lib/currency'
import { CREDIT_PACKS, createPackCheckout } from '~/lib/payments'
import { config } from '~/config'
import { CurrencyIcon } from '~/components/CurrencyIcon'
import { CartCheckoutModal, type CheckoutLine } from '~/components/CartCheckoutModal'
import { useSeo } from '~/hooks/useSeo'
import { t } from '~/intl/i18n'
import { isRejection, isInsufficient } from '~/lib/errors'
import { ErrorNotice } from '~/components/ErrorNotice'
import { track, purchaseItemsProps, errorCode, isUserRejection, creditsToUsd } from '~/lib/analytics'
import { captureError } from '~/lib/monitoring'
import { CollectionCarousel } from '~/components/CollectionCarousel'
import { CreatorBadge } from '~/components/CreatorBadge'
import { Button } from '~/components/Button'
import { Icon } from '~/components/Icon'
import styled from '@emotion/styled'
import type { CatalogItem } from '~/lib/api'
import './cart.css'

const EmptyCta = styled(Button)`
  margin-top: 12px;
`

// Cart-specific mapping: the "listing changed" message is plural (a multi-item cart), so it maps
// locally rather than via the shared singular soldOrRemoved/cantBuyOwn.
function friendlyError(e: unknown): string {
  if (isRejection(e)) return t('errors.rejected')
  const msg = ((e as { message?: string }).message ?? '').toLowerCase()
  if (msg.includes('insufficient')) return t('cart.error.insufficient', { currency: CURRENCY.name })
  if (msg.includes('no active listing') || msg.includes('your own listing')) return t('cart.error.listingChanged')
  return t('marketCheckout.error.generic')
}

// How long a pending review stays valid before we re-resolve on Confirm. Past this, live prices may
// have drifted (or listings sold), so we re-review instead of charging a stale total.
const REVIEW_TTL_MS = 120_000

// The three top-up packs offered when the buyer is short on credits (same set the PDP uses).
const OFFER_PACKS = CREDIT_PACKS.slice(0, 3)

// In-world launcher deep-link (zone on testnet) — matches the success page.
const JUMP_URL = config.chainId === 80002 ? 'https://decentraland.zone/jump' : 'https://decentraland.org/jump'

// One-line summary of the rows we pruned so the buyer knows why the cart shrank.
function dropNotice(review: CartReview): string {
  const parts: string[] = []
  if (review.unavailable.length) parts.push(t('cart.drop.unavailable', { count: review.unavailable.length }))
  if (review.own.length) parts.push(t('cart.drop.own', { count: review.own.length }))
  return t('cart.drop.removed', { items: parts.join(` ${t('cart.drop.and')} `) })
}

// Sum of a set of reviewed lines in whole credits — per-unit price × quantity for each line.
const sumLineCredits = (lines: ResolvedLine[]): number =>
  lines.reduce((n, l) => n + l.priceCredits * l.quantity, 0)

// Expand each reviewed line into one entry per unit (quantity 1) — the money flow authorizes and
// mints per unit (a primary trade may be accepted up to its `checks.uses` = remaining supply), so N
// copies become N credits in the same accept([...]) batch. Settlement stays per-unit and correct.
const toUnits = (lines: ResolvedLine[]): ResolvedLine[] =>
  lines.flatMap(l => Array.from({ length: l.quantity }, () => ({ ...l, quantity: 1 })))

// The multi-item checkout modal's state — a pure reflection of the charge flow (Cart owns the money).
type ModalState =
  | { phase: 'processing'; step: number; total: number }
  | { phase: 'nofunds'; lines: CheckoutLine[]; shortfall: number }
  | { phase: 'complete'; purchased: Array<CatalogItem & { quantity?: number }> }
  | { phase: 'error'; message: string }

export function Cart() {
  useSeo({ title: t('nav.cart'), noindex: true })
  const items = useCart(s => s.items)
  const remove = useCart(s => s.remove)
  const increment = useCart(s => s.increment)
  const decrement = useCart(s => s.decrement)
  const clear = useCart(s => s.clear)
  const restore = useCart(s => s.restore)
  const setFittingOpen = useCart(s => s.setFittingOpen)
  const favItems = useFavorites(s => s.items)
  const toggleFav = useFavorites(s => s.toggle)
  const { session } = useWallet()

  // Paint the whole page gray while the cart is open (Figma 1182-216274) so the white cart cards get
  // the focus. Toggled on <body> so the gray is full-bleed under the sticky sub-nav; reverted on leave.
  useEffect(() => {
    document.body.classList.add('shop-cart-bg')
    return () => document.body.classList.remove('shop-cart-bg')
  }, [])

  // Try-on is only meaningful for wearables (emotes aren't "worn").
  const hasWearable = items.some(i => i.category !== 'emote')

  // Last-minute upsell: more credit-buyable listings not already in the cart.
  const { data: suggested } = useQuery({
    queryKey: ['upsell-listings'],
    queryFn: () => fetchListings({ first: 40 }),
    staleTime: 60_000
  })
  const { data: balance } = useBalance(session)
  const qc = useQueryClient()
  const navigate = useNavigate()
  const { state: navState } = useLocation() as { state?: { resumeCheckout?: boolean } }

  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  // A resolved order awaiting explicit confirmation because prices or availability changed since the
  // items were added (mirrors MarketCheckout's lock-then-confirm). null = no pending confirmation.
  const [review, setReview] = useState<CartReview | null>(null)
  // When the pending review was resolved, so Confirm can detect a stale one and re-resolve.
  const reviewedAtRef = useRef(0)
  // The charge overlay (processing / no-funds / complete / error). null = closed.
  const [modal, setModal] = useState<ModalState | null>(null)
  const [selectedPack, setSelectedPack] = useState('')

  const shownTotal = items.reduce((sum, i) => sum + i.priceCredits * i.quantity, 0)
  // Total units across all lines (Σ quantity) — the "N items" the summary/count reflect.
  const totalUnits = items.reduce((n, i) => n + i.quantity, 0)
  // While a review is pending the total reflects the live (re-resolved) prices of what's still buyable.
  const total = review ? review.liveTotalCredits : shownTotal
  const inCart = new Set(items.map(i => i.id))
  const upsell = (suggested?.items ?? []).filter(i => !inCart.has(i.id)).slice(0, 12)
  // Live-price lookup for the rows while a review is pending.
  const lineById = new Map(review?.buyable.map(l => [l.item.id, l] as const))
  const balanceCredits = balance?.credits ?? 0

  // Re-resolve each line's LIVE trade at review time: a stored tradeId can be stale (the trade gets
  // re-signed as availability/expiration rolls), so resolveLiveTrade re-resolves by item on a 404
  // instead of dropping a still-listed row as unavailable.
  const resolveTrade: TradeResolver = resolveLiveTrade

  // Any manual cart edit invalidates a pending confirmation (its snapshot no longer matches the cart).
  function editCart(fn: () => void) {
    fn()
    setReview(null)
    setNotice(null)
    setError(null)
  }

  function closeModal() {
    setModal(null)
    setBusy(false)
  }

  // Show the no-funds (pack picker) overlay for a set of buyable lines — reserve nothing, prompt a
  // top-up. The cheapest pack that still clears the shortfall is pre-selected.
  function openNoFunds(lines: ResolvedLine[]) {
    const totalCredits = sumLineCredits(lines)
    const shortfall = Math.max(0, totalCredits - balanceCredits)
    const cover = OFFER_PACKS.find(p => p.credits >= shortfall) ?? OFFER_PACKS[OFFER_PACKS.length - 1]
    setSelectedPack(cover.id)
    track('Shop Buy Credits Prompted', {
      from: 'cart_checkout',
      credits_needed: totalCredits,
      credits_balance: balanceCredits,
      shortfall
    })
    setModal({
      phase: 'nofunds',
      lines: lines.map(l => ({ item: l.item, priceCredits: l.priceCredits, quantity: l.quantity })),
      shortfall,
    })
    setBusy(false)
  }

  // Charge an already-reviewed set of buyable lines: authorize each (reserving the dollars) with a live
  // step counter, then spend every credit in one transaction. Drives the modal through processing →
  // complete, or → no-funds on a 402, or → error. Releases reservations on failure.
  async function charge(lines: ResolvedLine[]) {
    if (!session || lines.length === 0) return
    // Expand to one unit per copy: buying qty N of a primary line is N per-unit authorizes + N
    // credits in the same accept([...trade × N]) batch (the trade's checks.uses = remaining supply
    // permits it). Keeps the money math + settlement strictly per-unit.
    const units = toUnits(lines)
    // Per-unit snapshot at the LIVE price for analytics (correct value across quantities).
    const purchasedUnits = units.map(l => ({ ...l.item, priceCredits: l.priceCredits }))
    // Per-line snapshot (carries quantity) for the success modal — unique keys, shows "× N".
    const purchasedLines = lines.map(l => ({ ...l.item, priceCredits: l.priceCredits, quantity: l.quantity }))
    const reservedSalts: string[] = []
    let step: 'authorize' | 'submit' = 'authorize'
    let usedGasless = false
    setModal({ phase: 'processing', step: 1, total: units.length })
    try {
      // Authorize SEQUENTIALLY (not Promise.all): each authorize reserves against the running USD
      // balance, so ordering is what makes the insufficient-credits guard correct — parallel calls
      // would all read the pre-reservation balance and could over-authorize.
      const purchases: CreditPurchase[] = []
      for (let i = 0; i < units.length; i++) {
        const line = units[i]
        setModal({ phase: 'processing', step: i + 1, total: units.length })
        try {
          // Authorize against the freshly RESOLVED trade (line.trade), not the item's original tradeId:
          // a stale tradeId may have been re-signed to a new trade, and the spend below executes against
          // line.trade — authorizing the retired trade would mismatch what's actually charged (Jarvis P1).
          const { credit, maxCreditedValue } = await authorizeUsdCredit(session.identity, line.usdCents, line.trade.id)
          reservedSalts.push(credit.id)
          purchases.push({ trade: line.trade, credits: [credit], maxCreditedValue })
        } catch (authErr) {
          // Server said not enough credits → release what we already reserved and show the pack picker
          // (top-up → resume), not a bare error. Same behaviour as the PDP BuyModal.
          if (isInsufficient(authErr)) {
            if (reservedSalts.length) {
              try {
                await cancelUsdIntents(session.identity, reservedSalts)
              } catch (relErr) {
                captureError(relErr, { flow: 'cart_checkout', step: 'release' })
              }
              void qc.invalidateQueries({ queryKey: ['usd-balance'] })
            }
            openNoFunds(lines)
            return
          }
          throw authErr
        }
      }

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
          const failures = settled.flatMap(r => (r.status === 'rejected' ? [r.reason as unknown] : []))
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
      track('Shop Completed Purchase', {
        ...purchaseItemsProps(purchasedUnits),
        payment_type: 'credits',
        no_crypto_step: usedGasless,
        transaction_hash: hashes[0] ?? null
      })
      void qc.invalidateQueries({ queryKey: ['usd-balance'] })
      setModal({ phase: 'complete', purchased: purchasedLines })
    } catch (e) {
      if (!isUserRejection(e)) captureError(e, { flow: 'cart_checkout', step, cart_size: lines.length })
      track(isUserRejection(e) ? 'Shop Purchase Cancelled' : 'Shop Purchase Failed', {
        step,
        error_code: errorCode(e),
        value_usd: creditsToUsd(purchasedUnits.reduce((n, i) => n + i.priceCredits, 0)),
        cart_size: units.length,
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
      setModal({ phase: 'error', message: friendlyError(e) })
    }
  }

  // Decide, for a reviewed set of buyable lines, whether to charge or to prompt a top-up first.
  function chargeOrTopUp(lines: ResolvedLine[]) {
    const totalCredits = sumLineCredits(lines)
    // Known-and-short → straight to the pack picker; don't reserve dollars we can't spend. When the
    // balance is unknown we still try (the sequential authorize guards it server-side → 402 → nofunds).
    if (balance != null && balance.credits < totalCredits) {
      openNoFunds(lines)
      return
    }
    void charge(lines)
  }

  async function checkout() {
    if (!session) {
      setError(t('buyModal.signInToCheckout'))
      return
    }
    const cartItems = useCart.getState().items // read live so a post-top-up resume sees the restored cart
    if (cartItems.length === 0) return
    setError(null)
    setNotice(null)
    setBusy(true)
    const cartCredits = cartItems.reduce((n, i) => n + i.priceCredits * i.quantity, 0)
    track('Shop Started Checkout', {
      cart_size: cartItems.length,
      cart_value_credits: cartCredits,
      cart_value_usd: creditsToUsd(cartCredits),
      has_sufficient_credits: balanceCredits >= cartCredits,
    })
    try {
      // Resolve every item's LIVE listing first — never charge a stale snapshot, and never let one bad
      // item abort the basket.
      setStatus(t('cart.status.reviewing'))
      const rev = await reviewCart(cartItems, session.address, resolveTrade)

      // Prune the rows we can't buy (sold/cancelled, or the buyer's own listing) and say what happened.
      const dropped = [...rev.unavailable, ...rev.own]
      if (dropped.length) {
        dropped.forEach(i => remove(i.id))
        setNotice(dropNotice(rev))
      }
      if (rev.buyable.length === 0) {
        setError(t('cart.error.noneAvailable'))
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
      setStatus(null)
      chargeOrTopUp(rev.buyable)
    } catch (e) {
      captureError(e, { flow: 'cart_checkout', step: 'review', cart_size: cartItems.length })
      setError(friendlyError(e))
      setStatus(null)
    } finally {
      setBusy(false)
    }
  }

  async function confirmPurchase() {
    if (!review) return
    if (!session) {
      setError(t('buyModal.signInToCheckout'))
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
    chargeOrTopUp(review.buyable)
  }

  // No funds → buy the selected pack on Stripe, then resume THIS cart's checkout once the credits land.
  // Stash the cart snapshot so it survives the full-page Stripe redirect (which wipes the in-memory
  // store); the /credits return handler routes back to /cart and re-runs checkout.
  async function buyCreditsAndItems() {
    if (!selectedPack) return
    try {
      sessionStorage.setItem(RESUME_CART_KEY, JSON.stringify(useCart.getState().items))
    } catch {
      /* private mode: resume just won't auto-trigger; the credits still land */
    }
    setBusy(true)
    try {
      const cs = await createPackCheckout(
        selectedPack,
        session ? { address: session.address, identity: session.identity } : undefined
      )
      if (cs.url) {
        window.location.href = cs.url // Stripe hosted checkout with the pack pre-selected
        return
      }
      // No hosted URL (mock/dev, Stripe off): the credits page grants then resumes.
      navigate('/credits')
    } catch (e) {
      try {
        sessionStorage.removeItem(RESUME_CART_KEY)
      } catch {
        /* ignore */
      }
      captureError(e, { flow: 'cart_buy_credits' })
      setModal({ phase: 'error', message: t('buyModal.error.creditsCheckout') })
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

  // Resume after a Stripe top-up: /credits routed back here with resumeCheckout. Restore the stashed
  // cart (if the redirect wiped the in-memory store) and re-run checkout with the topped-up balance.
  const resumedRef = useRef(false)
  useEffect(() => {
    if (!navState?.resumeCheckout || resumedRef.current) return
    resumedRef.current = true
    try {
      const snap = sessionStorage.getItem(RESUME_CART_KEY)
      if (snap) {
        sessionStorage.removeItem(RESUME_CART_KEY)
        const saved = JSON.parse(snap) as CatalogItem[]
        if (Array.isArray(saved) && saved.length) restore(saved)
      }
    } catch {
      /* ignore a malformed snapshot — nothing to resume */
    }
    void qc.invalidateQueries({ queryKey: ['usd-balance'] })
    // Defer a tick so the restored items land in the store before checkout re-reviews.
    const id = setTimeout(() => void checkout(), 0)
    return () => clearTimeout(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navState?.resumeCheckout])

  const working = busy || modal?.phase === 'processing'

  if (items.length === 0 && !modal) {
    return (
      <div className="cart cart--empty">
        <Icon name="cart" size={44} color="var(--muted-2)" />
        <p className="cart-empty__title">{t('cart.empty.title')}</p>
        <p className="muted">{t('cart.empty.body')}</p>
        <EmptyCta as={Link} to="/assets" variant="purple">
          {t('cart.empty.cta')}
        </EmptyCta>
      </div>
    )
  }

  return (
    <div className="checkout">
      <button className="checkout__back" onClick={() => navigate(-1)} type="button">
        <Icon name="arrow-left" />
        {t('nav.cart')}
      </button>

      <div className="checkout__body">
        <section className="checkout__panel">
          <div className="checkout__panel-head">
            <button
              className="checkout__panel-back"
              onClick={() => navigate(-1)}
              type="button"
              aria-label={t('cart.goBack')}
            >
              <Icon name="arrow-left" />
            </button>
            <h1 className="checkout__panel-title">{t('cart.panelTitle', { count: totalUnits })}</h1>
            {hasWearable ? (
              <button className="checkout__fitting" onClick={() => setFittingOpen(true)} disabled={working}>
                <Icon name="fitting-room" />
                {t('cart.fittingRoom')}
              </button>
            ) : null}
          </div>

          <div className="checkout__list">
            {items.map(item => {
              const line = lineById.get(item.id)
              const livePrice = line ? line.priceCredits : item.priceCredits
              const changed = !!line && line.priceCredits !== item.priceCredits
              // Quantity is only a primary (mint) concept; a secondary token is a single unique unit.
              const isPrimary = !item.tokenId
              const qty = item.quantity
              const atStockCap = typeof item.available === 'number' && qty >= item.available
              const lineSubtotal = livePrice * qty
              const faved = !!favItems[item.id]
              // Whole-item deep link (same route the browse cards use): cart lines carry the listing's
              // contractAddress + itemId/tokenId, so the thumbnail + name navigate to the detail page
              // client-side (the PDP re-hydrates from the passed router state).
              const routeSeg = item.tokenId ?? item.itemId
              const detailPath = item.contractAddress && routeSeg ? `/item/${item.contractAddress}/${routeSeg}` : null
              return (
                <div className="checkout__card" key={item.id}>
                  <div className="checkout__thumb">
                    {detailPath ? (
                      <Link
                        className="checkout__thumb-link"
                        to={detailPath}
                        state={{ item, tradeId: item.tradeId }}
                        aria-label={item.name}
                      >
                        {item.thumbnail ? <img src={item.thumbnail} alt={item.name} /> : null}
                      </Link>
                    ) : item.thumbnail ? (
                      <img src={item.thumbnail} alt={item.name} />
                    ) : null}
                    <span className="checkout__thumb-check" aria-hidden>
                      <svg viewBox="0 0 20 20" width="12" height="12">
                        <path
                          d="M5 10.5l3 3 7-7.5"
                          fill="none"
                          stroke="#fff"
                          strokeWidth="2.4"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </span>
                  </div>
                  <div className="checkout__info">
                    <div className="checkout__desc">
                      {detailPath ? (
                        <Link
                          className="checkout__name"
                          to={detailPath}
                          state={{ item, tradeId: item.tradeId }}
                          title={item.name}
                        >
                          {item.name}
                        </Link>
                      ) : (
                        <div className="checkout__name" title={item.name}>
                          {item.name}
                        </div>
                      )}
                      {item.creator ? (
                        <CreatorBadge address={item.creator} className="checkout__creator" linkToProfile />
                      ) : null}
                    </div>
                    <div className="checkout__foot">
                      {/* Quantity stepper. PRIMARY (mint) lines can buy multiple copies: minus decrements
                          (floored at 1 — the trash button removes), plus increments up to remaining stock.
                          SECONDARY lines are a single unique token, so the stepper is hidden (qty is 1). */}
                      {isPrimary ? (
                        <div className="checkout__stepper">
                          <button
                            className="checkout__step"
                            onClick={() => editCart(() => decrement(item.id))}
                            disabled={working || qty <= 1}
                            aria-label={t('cart.decreaseQuantity', { name: item.name })}
                          >
                            <svg viewBox="0 0 16 16" fill="none" aria-hidden focusable="false">
                              <path d="M3.5 8h9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                            </svg>
                          </button>
                          <span className="checkout__qty">{qty}</span>
                          <button
                            className="checkout__step"
                            onClick={() => editCart(() => increment(item.id))}
                            disabled={working || atStockCap}
                            aria-label={t('cart.increaseQuantity')}
                          >
                            <svg viewBox="0 0 16 16" fill="none" aria-hidden focusable="false">
                              <path d="M8 3.5v9M3.5 8h9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                            </svg>
                          </button>
                        </div>
                      ) : null}
                      <div className="checkout__price">
                        <CurrencyIcon className="checkout__price-ico" /> {lineSubtotal}
                        {changed ? <span className="checkout__price-was">{item.priceCredits * qty}</span> : null}
                      </div>
                    </div>
                  </div>
                  <div className="checkout__actions">
                    <button
                      className={`checkout__fav${faved ? ' is-on' : ''}`}
                      onClick={() => toggleFav(item)}
                      aria-label={
                        faved
                          ? t('cart.removeFromFavorites', { name: item.name })
                          : t('cart.addToFavorites', { name: item.name })
                      }
                      title={faved ? t('assetCard.removeFromFavorites') : t('assetCard.addToFavorites')}
                    >
                      <Icon name={faved ? 'heart-solid' : 'heart'} />
                    </button>

                    <button
                      className="checkout__remove"
                      onClick={() => editCart(() => remove(item.id))}
                      disabled={working}
                      aria-label={t('cart.remove', { name: item.name })}
                      title={t('cart.removeTitle')}
                    >
                      <Icon name="trash" size={24} />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Utility actions kept subtle so they don't compete with the CTA. */}
          <div className="checkout__utils">
            <button className="link" onClick={() => editCart(clear)} disabled={working}>
              {t('cart.clearCart')}
            </button>
            {import.meta.env.DEV ? (
              <button className="link" onClick={() => void getTestCredits()} disabled={working || !session}>
                Get test {CURRENCY.name} (dev)
              </button>
            ) : null}
          </div>
        </section>

        <aside className="checkout__summary">
          <h2 className="checkout__summary-title">{t('cart.purchaseSummary')}</h2>
          <div className="checkout__summary-body">
            <div className="checkout__total-line">
              <span className="checkout__total-label">{t('cart.totalItems', { count: totalUnits })}</span>
              <span className="checkout__total-value">
                <CurrencyIcon className="checkout__total-ico" /> {total}
              </span>
            </div>

            <button
              className="checkout__cta"
              onClick={() => void (review ? confirmPurchase() : checkout())}
              disabled={working}
            >
              {working ? t('cart.working') : review ? t('marketCheckout.confirmPurchase') : t('assetCard.buyNow')}
            </button>

            {review ? <p className="muted checkout__msg">{t('cart.priceChanged')}</p> : null}
            {notice ? <p className="muted checkout__msg">{notice}</p> : null}
            {status ? <p className="muted checkout__msg">{status}</p> : null}
            <ErrorNotice message={error} className="checkout__msg" />
          </div>
        </aside>
      </div>

      {upsell.length > 0 ? (
        <div className="cart-upsell">
          <CollectionCarousel title={t('cart.youMightAlsoLike')} items={upsell} />
        </div>
      ) : null}

      {modal ? (
        <CartCheckoutModal
          phase={modal.phase}
          balanceCredits={balanceCredits}
          onClose={closeModal}
          step={modal.phase === 'processing' ? modal.step : undefined}
          total={modal.phase === 'processing' ? modal.total : undefined}
          lines={modal.phase === 'nofunds' ? modal.lines : undefined}
          shortfallCredits={modal.phase === 'nofunds' ? modal.shortfall : undefined}
          packs={OFFER_PACKS}
          selectedPack={selectedPack}
          onSelectPack={setSelectedPack}
          onBuyPacks={() => void buyCreditsAndItems()}
          purchased={modal.phase === 'complete' ? modal.purchased : undefined}
          onMyAssets={() => navigate('/assets?tab=mine')}
          onTryInWorld={() => window.open(JUMP_URL, '_blank', 'noopener')}
          message={modal.phase === 'error' ? modal.message : undefined}
        />
      ) : null}
    </div>
  )
}
