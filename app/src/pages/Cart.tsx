import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useCart } from '~/store/cart'
import { useFavorites } from '~/store/favorites'
import { useWallet } from '~/store/wallet'
import { stashResumeIntent, takeResumeIntent } from '~/lib/auth-return'
import { detailRouteFor } from '~/lib/routes'
import { showsWalletConfirmations } from '~/lib/wallet-kind'
import { useBalance } from '~/hooks/useBalance'
import { authorizeUsdCredit, cancelUsdIntents } from '~/lib/credits'
import { config } from '~/config'
import type { Session } from '~/lib/auth'
import { useManaBalance } from '~/hooks/useManaBalance'
import { useManaRate } from '~/hooks/useManaRate'
import type { ManaRate } from '~/lib/mana-convert'
import { readManaUsdRate, usdCentsToManaWei } from '~/lib/mana-rate'
import { buyManyWithMana } from '~/lib/buy-mana'
import {
  computePaymentOptions,
  distributeCreditsAcrossUnits,
  manaForRemainder,
  manaPerCredit,
  type PaymentMethod
} from '~/lib/payment-options'
import { PaymentCtas } from '~/components/PaymentCtas'
import { invalidateAfterPurchase } from '~/lib/after-purchase'
import {
  AuthorizationKind,
  ensureAuthorization,
  getAuthorizationStatus,
  getManaSpendingAuthorization,
  needsApprovalStep,
  type ShopAuthorization
} from '~/lib/authorizations'
import type { ChainId } from '@dcl/schemas'
import { AuthorizeStep } from '~/components/AuthorizeStep'
import manaLight from '~/assets/mana-matic-light.svg'
import { ContractName, getContract, getContractName } from 'decentraland-transactions'
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
import { useCartAvailability } from '~/hooks/useCartAvailability'
import { isLineBuyable } from '~/lib/cart-availability'
import { CURRENCY } from '~/lib/currency'
import { createPackCheckout, MAX_OFFER_PACKS } from '~/lib/payments'
import { useCreditPacks } from '~/hooks/useCreditPacks'
import { CartCheckoutModal, type CheckoutLine } from '~/components/CartCheckoutModal'
import { useSeo } from '~/hooks/useSeo'
import { t } from '~/intl/i18n'
import { isRejection, isInsufficient } from '~/lib/errors'
import { track, purchaseItemsProps, errorCode, isUserRejection, creditsToUsd } from '~/lib/analytics'
import { captureError } from '~/lib/monitoring'
import { CollectionCarousel } from '~/components/CollectionCarousel'
import { Icon } from '~/components/Icon'
import type { CatalogItem } from '~/lib/api'
import type { SuccessNavState } from '~/pages/Success'
import * as S from './Cart.styles'

// Router state handed to /cart by the /credits return handler to resume a checkout after a mid-checkout
// top-up. Exported so the producer (GetCredits) shares the exact shape — a renamed field is then a TS
// error at its navigate() call, not a silent runtime miss.
export type CartNavState = {
  resumeCheckout?: boolean
  // Credits that just landed, forwarded to the /success page for the combined credits+items view.
  creditsAdded?: number
}

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

// One-line summary of the rows we pruned so the buyer knows why the cart shrank.
function dropNotice(review: CartReview): string {
  const parts: string[] = []
  if (review.unavailable.length) parts.push(t('cart.drop.unavailable', { count: review.unavailable.length }))
  if (review.own.length) parts.push(t('cart.drop.own', { count: review.own.length }))
  return t('cart.drop.removed', { items: parts.join(` ${t('cart.drop.and')} `) })
}

// Sum of a set of reviewed lines in whole credits — per-unit price × quantity for each line.
const sumLineCredits = (lines: ResolvedLine[]): number => lines.reduce((n, l) => n + l.priceCredits * l.quantity, 0)

// Expand each reviewed line into one entry per unit (quantity 1) — the money flow authorizes and
// mints per unit (a primary trade may be accepted up to its `checks.uses` = remaining supply), so N
// copies become N credits in the same accept([...]) batch. Settlement stays per-unit and correct.
const toUnits = (lines: ResolvedLine[]): ResolvedLine[] =>
  lines.flatMap(l => Array.from({ length: l.quantity }, () => ({ ...l, quantity: 1 })))

// The multi-item checkout modal's state — a pure reflection of the charge flow (Cart owns the money).
// The processing stages, in order: reserve each unit's credits (silent, N sequential authorizes) →
// wait for the buyer to sign/confirm in their wallet (ONE prompt) → settle the single on-chain tx.
type ProcessingStage = 'reserving' | 'awaiting-signature' | 'settling'
type ModalState =
  // Payment-rail chooser — only reached when the buyer holds MANA (see lib/payment-options). Carries the
  // reviewed lines so confirming charges EXACTLY what was reviewed, whichever rail is picked.
  | { phase: 'choose'; lines: ResolvedLine[]; totalCents: number; manaWei: bigint }
  | { phase: 'processing'; stage: ProcessingStage; step: number; total: number }
  | { phase: 'nofunds'; lines: CheckoutLine[]; shortfall: number }
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
  const { session, signIn } = useWallet()
  // The top-up packs offered when the buyer is short on credits (same set the PDP uses — all four the
  // credits-server returns, shown in one widened row). Sourced from the credits-server catalogue
  // (single source of truth); falls back to the bundled packs so this critical picker always renders.
  const OFFER_PACKS = useCreditPacks().packs.slice(0, MAX_OFFER_PACKS)

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
  const { state: navState } = useLocation() as { state?: CartNavState }

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
  // Polygon MANA the buyer holds + the live MANA/USD rate: together they price the basket in MANA and
  // decide which rails the checkout can offer. Both are read-only; neither gates the credits path.
  const { data: manaBalanceWei } = useManaBalance(session)
  const { data: manaRate } = useManaRate(true)
  const [selectedPack, setSelectedPack] = useState('')
  // Credits that landed with a mid-checkout top-up (buy-credits-and-item-together). Carried from the
  // /credits return handler through the resume, then handed to the /success page so it can show the
  // bundle that was added alongside the purchased items (Figma 1231-250927). A ref (not state) so the
  // resume's deferred checkout() closure reads the current value, not a stale render capture.
  const creditsAddedRef = useRef<number | null>(null)

  // Validate each line's live trade when the cart page is open (optimistic — every line renders as
  // buyable until its trade actually resolves as sold-out / gone / expired). Bounded to the cart's
  // lines, cached ~30s, revalidated on refocus.
  const availability = useCartAvailability(items)
  const isBuyable = (i: CatalogItem) => isLineBuyable(availability[i.id])
  // Everything below counts / sums only the lines still buyable — an unavailable line is excluded from
  // the total and from checkout, but stays visible (with its reason) so the buyer can remove it.
  const buyableItems = items.filter(isBuyable)
  const allUnavailable = items.length > 0 && buyableItems.length === 0

  const shownTotal = buyableItems.reduce((sum, i) => sum + i.priceCredits * i.quantity, 0)
  // Total buyable units (Σ quantity over available lines) — the "N items" the summary total reflects.
  const totalUnits = items.reduce((n, i) => n + i.quantity, 0)
  const buyableUnits = buyableItems.reduce((n, i) => n + i.quantity, 0)
  // While a review is pending the total reflects the live (re-resolved) prices of what's still buyable.
  const total = review ? review.liveTotalCredits : shownTotal
  const inCart = new Set(items.map(i => i.id))
  const upsell = (suggested?.items ?? []).filter(i => !inCart.has(i.id)).slice(0, 12)
  // Live-price lookup for the rows while a review is pending.
  const lineById = new Map(review?.buyable.map(l => [l.item.id, l] as const))
  const balanceCredits = balance?.credits ?? 0

  // The rails the summary panel offers, and the exchange-rate caption under the total. Derived from the
  // cart's OWN line prices (1 credit = 10 cents) rather than a resolved trade, so the panel can offer a
  // rail on first paint instead of after a network round-trip. `usdCentsToManaWei` rounds the MANA leg up,
  // matching what the charge path quotes. No rate (oracle unread/unreachable) → 0n → credits only.
  const summaryTotalCents = total * 10
  const summaryManaWei = manaRate ? usdCentsToManaWei(summaryTotalCents, manaRate) : 0n
  const summaryRails = computePaymentOptions({
    priceCents: summaryTotalCents,
    priceManaWei: summaryManaWei,
    balanceCents: balance?.balanceCents ?? 0,
    manaBalanceWei: manaBalanceWei ?? 0n
  })
  const summaryManaPerCredit = manaPerCredit(summaryTotalCents, summaryManaWei)
  const summaryRateNote =
    summaryManaPerCredit != null
      ? t('buyModal.manaRate', { mana: summaryManaPerCredit.toLocaleString('en', { maximumFractionDigits: 2 }) })
      : null

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
      shortfall
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
    setModal({ phase: 'processing', stage: 'reserving', step: 1, total: units.length })
    try {
      // Authorize SEQUENTIALLY (not Promise.all): each authorize reserves against the running USD
      // balance, so ordering is what makes the insufficient-credits guard correct — parallel calls
      // would all read the pre-reservation balance and could over-authorize.
      const purchases: CreditPurchase[] = []
      for (let i = 0; i < units.length; i++) {
        const line = units[i]
        setModal({ phase: 'processing', stage: 'reserving', step: i + 1, total: units.length })
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
      // All units authorized. The whole basket settles in ONE accept([...]) tx (trades are grouped by
      // chain+marketplace, and the shop is single-chain), so from here it's a single wallet prompt then
      // one settlement — NOT a per-item count. Show "confirm in your wallet" until the buyer signs
      // (onSigned), then "completing transaction" while it settles.
      const onSigned = () =>
        setModal({ phase: 'processing', stage: 'settling', step: units.length, total: units.length })
      setModal({ phase: 'processing', stage: 'awaiting-signature', step: units.length, total: units.length })
      let hashes: string[] = []
      if (gaslessEnabled()) {
        try {
          hashes = await buyManyGasless({ purchases, buyer: session.address, signer: session.signer, onSigned })
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
          hashes = await buyManyWithCredits({ purchases, buyer: session.address, signer: session.signer, onSigned })
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
      invalidateAfterPurchase(qc)
      // The whole basket has settled on-chain (buyManyGasless/waitForSettlement above), so hand the
      // standalone success PAGE the purchased lines + tx and tell it settlement is already done
      // (settled:true) — it lands straight on the confirmed screen instead of a floating in-cart modal.
      // When this checkout auto-resumed after a mid-checkout top-up, also pass the credits that landed
      // so the success page shows the "buy credits + item together" combined view (Figma 1231-250927).
      const creditsAdded = creditsAddedRef.current
      creditsAddedRef.current = null
      setModal(null)
      setBusy(false)
      const successState: SuccessNavState = {
        items: purchasedLines,
        txHash: hashes[0] ?? undefined,
        settled: true,
        ...(creditsAdded ? { creditsAdded } : {})
      }
      // replace:true — the cart is now emptied, so Back from /success should not return to it.
      navigate('/success', { state: successState, replace: true })
    } catch (e) {
      if (!isUserRejection(e)) captureError(e, { flow: 'cart_checkout', step, cart_size: lines.length })
      track(isUserRejection(e) ? 'Shop Purchase Cancelled' : 'Shop Purchase Failed', {
        step,
        error_code: errorCode(e),
        value_usd: creditsToUsd(purchasedUnits.reduce((n, i) => n + i.priceCredits, 0)),
        cart_size: units.length
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

  // Post-purchase, shared by all three rails: refresh everything the sale changed and hand the standalone
  // success page the purchased lines + tx (settlement already confirmed by the caller).
  function finishCartPurchase(purchasedLines: SuccessNavState['items'], hashes: string[]) {
    void qc.invalidateQueries({ queryKey: ['usd-balance'] })
    void qc.invalidateQueries({ queryKey: ['detail-trade'] })
    void qc.invalidateQueries({ queryKey: ['shop-item'] })
    void qc.invalidateQueries({ queryKey: ['owned-token'] })
    void qc.invalidateQueries({ queryKey: ['public-token'] })
    void qc.invalidateQueries({ queryKey: ['item-resales'] })
    void qc.invalidateQueries({ queryKey: ['shop-items'] })
    void qc.invalidateQueries({ queryKey: ['catalog-items'] })
    void qc.invalidateQueries({ queryKey: ['my-assets'] })
    void qc.invalidateQueries({ queryKey: ['purchases'] })
    void qc.invalidateQueries({ queryKey: ['owned-item-count'] })
    void qc.invalidateQueries({ queryKey: ['overview-listings'] })
    void qc.invalidateQueries({ queryKey: ['upsell-listings'] })
    const creditsAdded = creditsAddedRef.current
    creditsAddedRef.current = null
    setModal(null)
    setBusy(false)
    const successState: SuccessNavState = {
      items: purchasedLines,
      txHash: hashes[0] ?? undefined,
      settled: true,
      ...(creditsAdded ? { creditsAdded } : {})
    }
    navigate('/success', { state: successState, replace: true })
  }

  // A failed MANA / combined charge: report it and surface the error state (reservations, if any, are
  // released by the caller which knows what it reserved).
  function handleChargeError(e: unknown, flow: string) {
    if (!isUserRejection(e)) captureError(e, { flow, step: 'submit' })
    track(isUserRejection(e) ? 'Shop Purchase Cancelled' : 'Shop Purchase Failed', {
      step: 'submit',
      error_code: errorCode(e)
    })
    setModal({ phase: 'error', message: friendlyError(e) })
    setBusy(false)
  }

  // Let the CreditsManager pull the MANA leg of a combined basket (gasless; no-op when already approved).
  async function ensureCreditsManagerManaAllowance(signer: Session['signer'], chainId: number) {
    const mana = getContract(ContractName.MANAToken, chainId)
    const creditsManager = getContract(ContractName.CreditsManager, chainId)
    await ensureAuthorization({
      auth: {
        kind: AuthorizationKind.Allowance,
        contractAddress: mana.address,
        spenderAddress: creditsManager.address,
        chainId
      },
      signer
    })
  }

  // The basket's total in cents + what it costs in MANA at the live rate.
  //
  // The rate is AWAITED when the buyer holds MANA and the background query hasn't resolved yet: deciding
  // off a missing rate would silently drop the MANA rails right when they matter (a real race on a slow
  // oracle read — the buyer would be sent to credits/top-up despite holding MANA). Resolves through the
  // react-query cache, so it's one read shared with the hook. A failed/unreachable oracle → 0n, which
  // simply means no MANA rail and the credits flow is untouched.
  // Resolve the rate through the react-query cache, awaiting it when the background query hasn't landed
  // yet. Shared by the MANA quote below and by reviewCart, which needs it to price LEGACY (MANA-priced)
  // lines. An unreachable/stale oracle resolves to undefined: no MANA rail, and legacy lines report as
  // unavailable rather than being priced off a rate we do not have.
  //
  // BuyModal has a same-named function with a DIFFERENT signature: it takes the trade and skips the oracle
  // read entirely for a native (USD-pegged) one, because it prices a single line and already knows which.
  // This one is parameterless because the cart holds a mixed basket and needs the rate before it can tell
  // whether any line needs it. Don't copy one into the other's place — they answer different questions.
  async function ensureManaRate(): Promise<ManaRate | undefined> {
    if (manaRate) return manaRate
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

  async function basketTotals(lines: ResolvedLine[]) {
    const totalCents = toUnits(lines).reduce((n, u) => n + u.usdCents, 0)
    const holdsMana = (manaBalanceWei ?? 0n) > 0n
    const rate = holdsMana ? await ensureManaRate() : manaRate
    const manaWei = rate ? usdCentsToManaWei(totalCents, rate) : 0n
    return { totalCents, manaWei }
  }

  // Decide, for a reviewed set of buyable lines, HOW to pay: offer the rails when the buyer holds MANA,
  // else keep the credits-only behaviour (charge, or prompt a top-up when short).
  async function chargeOrTopUp(lines: ResolvedLine[], picked?: PaymentMethod) {
    const totalCredits = sumLineCredits(lines)
    const { totalCents, manaWei } = await basketTotals(lines)
    const options = computePaymentOptions({
      priceCents: totalCents,
      priceManaWei: manaWei,
      balanceCents: balance?.balanceCents ?? 0,
      manaBalanceWei: manaBalanceWei ?? 0n
    })
    // The buyer already picked a rail in the summary panel, and it still covers the re-resolved total →
    // charge it, no second confirmation. (`picked` is dropped when the re-resolve invalidated it, which
    // falls through to the chooser / top-up below — never a silent switch to a different rail.)
    if (picked && options.options.some(o => o.method === picked)) {
      if (picked === 'credits') {
        void charge(lines)
        return
      }
      const { spender, chainId } = manaSpenderFor(picked, lines)
      await withManaApproval(spender, chainId, () =>
        picked === 'mana' ? void chargeWithMana(lines) : void chargeCombined(lines, totalCents, manaWei)
      )
      return
    }
    // A MANA rail on the table (pay in MANA, or credits + MANA) → let the buyer choose. This is also what
    // turns a short-on-credits basket into a payable one instead of a top-up dead end.
    if (options.options.some(o => o.method === 'mana' || o.method === 'combined')) {
      setModal({ phase: 'choose', lines, totalCents, manaWei })
      setBusy(false)
      return
    }
    // Known-and-short → straight to the pack picker; don't reserve dollars we can't spend. When the
    // balance is unknown we still try (the sequential authorize guards it server-side → 402 → nofunds).
    if (balance != null && balance.credits < totalCredits) {
      openNoFunds(lines)
      return
    }
    void charge(lines)
  }

  // The rails the current 'choose' modal offers, recomputed from the same inputs it was opened with.
  function chooseOptions(m: Extract<ModalState, { phase: 'choose' }>) {
    return computePaymentOptions({
      priceCents: m.totalCents,
      priceManaWei: m.manaWei,
      balanceCents: balance?.balanceCents ?? 0,
      manaBalanceWei: manaBalanceWei ?? 0n
    })
  }

  // Moving the buyer's MANA needs their permission. Self-custody wallets are TOLD first, through the
  // same approval step the sell and top-up flows use, so the extra prompt is explained rather than
  // arriving unannounced beside the purchase prompt. Managed (web2) wallets never see approval wording —
  // lib/buy-mana grants it silently for them (CONVENTIONS.md).
  const [authStep, setAuthStep] = useState<{
    auth: ShopAuthorization
    run: () => void
  } | null>(null)

  /**
   * Run `proceed`, but for a MANA rail show the approval step first when the wallet is self-custody and
   * the allowance is missing. A failed status read assumes approved and lets lib/buy-mana's
   * ensureAuthorization handle it — the pre-existing behaviour, so a flaky RPC never blocks a purchase.
   */
  /** Which contract pulls the MANA: the marketplace for a MANA-only basket, the CreditsManager for mixed. */
  function manaSpenderFor(rail: 'mana' | 'combined', lines: ResolvedLine[]): { spender: string; chainId: ChainId } {
    const trade = lines[0].trade
    const spender =
      rail === 'mana'
        ? getContract(getContractName(trade.contract), trade.chainId).address
        : getContract(ContractName.CreditsManager, trade.chainId).address
    return { spender, chainId: trade.chainId }
  }

  async function withManaApproval(spender: string, chainId: ChainId, proceed: () => void) {
    const auth = getManaSpendingAuthorization(chainId, spender)
    const authorized = session ? await getAuthorizationStatus(auth, session.address).catch(() => true) : true
    if (needsApprovalStep(session?.providerType, authorized)) {
      setBusy(false)
      setAuthStep({ auth, run: proceed })
      return
    }
    proceed()
  }

  // Route the chooser's confirmation to the picked rail.
  function confirmMethod(method: PaymentMethod) {
    if (modal?.phase !== 'choose') return
    const { lines, totalCents, manaWei } = modal
    if (method === 'credits') {
      void charge(lines)
      return
    }
    const { spender, chainId } = manaSpenderFor(method, lines)
    void withManaApproval(spender, chainId, () =>
      method === 'mana' ? void chargeWithMana(lines) : void chargeCombined(lines, totalCents, manaWei)
    )
  }

  // MANA-only basket: no credits, so nothing is authorized or reserved — every trade settles in ONE
  // accept([...]) paid from the buyer's MANA (buyManyWithMana).
  async function chargeWithMana(lines: ResolvedLine[]) {
    if (!session || lines.length === 0) return
    const units = toUnits(lines)
    const purchasedUnits = units.map(l => ({ ...l.item, priceCredits: l.priceCredits }))
    const purchasedLines = lines.map(l => ({ ...l.item, priceCredits: l.priceCredits, quantity: l.quantity }))
    const onSigned = () => setModal({ phase: 'processing', stage: 'settling', step: units.length, total: units.length })
    setModal({ phase: 'processing', stage: 'awaiting-signature', step: units.length, total: units.length })
    try {
      const hashes = await buyManyWithMana({
        trades: units.map(u => u.trade),
        buyer: session.address,
        signer: session.signer,
        onSigned
      })
      lines.forEach(l => remove(l.item.id))
      setReview(null)
      track('Shop Completed Purchase', {
        ...purchaseItemsProps(purchasedUnits),
        payment_type: 'mana',
        transaction_hash: hashes[0] ?? null
      })
      void qc.invalidateQueries({ queryKey: ['mana-balance'] })
      finishCartPurchase(purchasedLines, hashes)
    } catch (e) {
      handleChargeError(e, 'buy_cart_mana')
    }
  }

  // Credits + MANA: the credit balance is spread across the units (each takes what it can, the unit that
  // exhausts it takes a PARTIAL credit, later units take none) and MANA covers the gap. Everything still
  // settles in ONE useCredits accept([...]) — the gap rides along as the contract's uncredited leg, which
  // it pulls from the buyer's MANA and refunds any unused part of.
  async function chargeCombined(lines: ResolvedLine[], totalCents: number, manaWei: bigint) {
    if (!session || lines.length === 0) return
    const units = toUnits(lines)
    const purchasedUnits = units.map(l => ({ ...l.item, priceCredits: l.priceCredits }))
    const purchasedLines = lines.map(l => ({ ...l.item, priceCredits: l.priceCredits, quantity: l.quantity }))
    const allocation = distributeCreditsAcrossUnits(
      units.map(u => u.usdCents),
      balance?.balanceCents ?? 0
    )
    const creditedCents = allocation.reduce((n, c) => n + c, 0)
    const gapWei = manaForRemainder(Math.max(0, totalCents - creditedCents), totalCents, manaWei)
    const reservedSalts: string[] = []
    setModal({ phase: 'processing', stage: 'reserving', step: 1, total: units.length })
    try {
      const purchases: CreditPurchase[] = []
      for (let i = 0; i < units.length; i++) {
        const cents = allocation[i]
        if (cents <= 0) continue // fully covered by MANA — no credit, nothing to reserve
        setModal({ phase: 'processing', stage: 'reserving', step: i + 1, total: units.length })
        const { credit, maxCreditedValue } = await authorizeUsdCredit(session.identity, cents, units[i].trade.id)
        reservedSalts.push(credit.id)
        purchases.push({ trade: units[i].trade, credits: [credit], maxCreditedValue })
      }
      // Units with no credit still have to be in the accept([...]) batch — carry them with no credits so
      // the MANA leg pays for them.
      units.forEach((u, i) => {
        if (allocation[i] <= 0) purchases.push({ trade: u.trade, credits: [], maxCreditedValue: '0' })
      })
      // The group sums maxCreditedValue, so adding the gap to the first purchase makes the batch's
      // uncredited leg exactly the MANA gap (see buildUseCreditsArgs).
      purchases[0] = {
        ...purchases[0],
        maxCreditedValue: (BigInt(purchases[0].maxCreditedValue) + gapWei).toString()
      }
      await ensureCreditsManagerManaAllowance(session.signer, units[0].trade.chainId)

      const onSigned = () =>
        setModal({ phase: 'processing', stage: 'settling', step: units.length, total: units.length })
      setModal({ phase: 'processing', stage: 'awaiting-signature', step: units.length, total: units.length })
      const hashes = await buyManyWithCredits({
        purchases,
        buyer: session.address,
        signer: session.signer,
        onSigned
      })
      lines.forEach(l => remove(l.item.id))
      setReview(null)
      track('Shop Completed Purchase', {
        ...purchaseItemsProps(purchasedUnits),
        payment_type: 'credits_and_mana',
        transaction_hash: hashes[0] ?? null
      })
      void qc.invalidateQueries({ queryKey: ['mana-balance'] })
      finishCartPurchase(purchasedLines, hashes)
    } catch (e) {
      if (reservedSalts.length) {
        void cancelUsdIntents(session.identity, reservedSalts).catch(() => {})
        void qc.invalidateQueries({ queryKey: ['usd-balance'] })
      }
      handleChargeError(e, 'buy_cart_combined')
    }
  }

  /**
   * Run the checkout. `picked` is the rail the buyer clicked in the summary panel; it is a PREFERENCE,
   * not a commitment — the live re-resolve below can change the total, so chargeOrTopUp re-checks that
   * the rail still covers it and falls back to the chooser when it doesn't.
   */
  async function checkout(picked?: PaymentMethod) {
    if (!session) {
      // No dead-end: send them into sign-in (returns to /cart), stashing a resume so the checkout
      // re-runs automatically once the session is restored. The cart itself is persisted to
      // localStorage, so it survives the round-trip.
      stashResumeIntent({ type: 'cart-checkout' })
      signIn()
      return
    }
    // Read live so a post-top-up resume sees the restored cart, then drop any line already known to be
    // unavailable (sold-out / gone / expired) so checkout never even attempts a stale line. reviewCart
    // below remains the authority and re-prunes against the live trades.
    const cartItems = useCart.getState().items.filter(isBuyable)
    if (cartItems.length === 0) return
    setError(null)
    setNotice(null)
    setBusy(true)
    const cartCredits = cartItems.reduce((n, i) => n + i.priceCredits * i.quantity, 0)
    track('Shop Started Checkout', {
      cart_size: cartItems.length,
      cart_value_credits: cartCredits,
      cart_value_usd: creditsToUsd(cartCredits),
      has_sufficient_credits: balanceCredits >= cartCredits
    })
    try {
      // Resolve every item's LIVE listing first — never charge a stale snapshot, and never let one bad
      // item abort the basket.
      const rev = await reviewCart(cartItems, session.address, resolveTrade, await ensureManaRate())

      // Prune the rows we can't buy (sold/cancelled, or the buyer's own listing) and say what happened.
      const dropped = [...rev.unavailable, ...rev.own]
      if (dropped.length) {
        dropped.forEach(i => remove(i.id))
        setNotice(dropNotice(rev))
      }
      if (rev.buyable.length === 0) {
        setError(t('cart.error.noneAvailable'))
        setReview(null)
        return
      }
      // Anything changed (a re-price, or rows dropped) → show the reconciled order and require an
      // explicit second confirmation so the buyer is never silently charged a different total.
      if (rev.orderChanged) {
        setReview(rev)
        reviewedAtRef.current = Date.now()
        return
      }
      await chargeOrTopUp(rev.buyable, picked)
    } catch (e) {
      captureError(e, { flow: 'cart_checkout', step: 'review', cart_size: cartItems.length })
      setError(friendlyError(e))
    } finally {
      setBusy(false)
    }
  }

  async function confirmPurchase() {
    if (!review) return
    if (!session) {
      stashResumeIntent({ type: 'cart-checkout' })
      signIn()
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
    void chargeOrTopUp(review.buyable)
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

  // Resume after a sign-in round-trip: a signed-out buyer hit checkout, we sent them to sign in and
  // stashed the intent; on return the session is restored and we re-run checkout automatically (the
  // cart persisted to localStorage, so it's intact). Fires once, only after the session lands.
  const signInResumedRef = useRef(false)
  useEffect(() => {
    if (!session || signInResumedRef.current) return
    if (!takeResumeIntent('cart-checkout')) return
    signInResumedRef.current = true
    const id = setTimeout(() => void checkout(), 0)
    return () => clearTimeout(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session])

  // Resume after a Stripe top-up: /credits routed back here with resumeCheckout. Restore the stashed
  // cart (if the redirect wiped the in-memory store) and re-run checkout with the topped-up balance.
  const resumedRef = useRef(false)
  useEffect(() => {
    if (!navState?.resumeCheckout || resumedRef.current) return
    resumedRef.current = true
    // Remember the topped-up credits so the /success page can show them alongside the items once the
    // resumed checkout settles (buy-credits-and-item-together combined success).
    creditsAddedRef.current = navState.creditsAdded ?? null
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
      <S.Checkout>
        <S.Top>
          <S.Back onClick={() => navigate(-1)} type="button">
            <Icon name="arrow-left" />
            {t('nav.cart')}
          </S.Back>

          <S.CartEmpty data-testid="cart-empty">
            <Icon name="cart-plus" size={110} />
            <S.CartEmptyText>
              <S.CartEmptyTitle>{t('cart.empty.title')}</S.CartEmptyTitle>
              <S.CartEmptyBody>{t('cart.empty.body')}</S.CartEmptyBody>
            </S.CartEmptyText>
            <S.CartEmptyCta to="/assets">{t('cart.empty.cta')}</S.CartEmptyCta>
          </S.CartEmpty>
        </S.Top>
      </S.Checkout>
    )
  }

  return (
    <S.Checkout>
      {/* Top section (breadcrumb + cart/summary panels) sits on the gray band; everything below
          (the cross-sell) is on the white page — Figma 1182-232377. */}
      <S.Top>
        <S.Back onClick={() => navigate(-1)} type="button">
          <Icon name="arrow-left" />
          {t('nav.cart')}
        </S.Back>

        <S.Body>
          <S.Left>
            {/* Header card (Figma 1182-216308): "Cart: N Items" + Fitting Room — its own white card. */}
            <S.HeadCard>
              <S.PanelBack onClick={() => navigate(-1)} type="button" aria-label={t('cart.goBack')}>
                <Icon name="arrow-left" />
              </S.PanelBack>
              <S.PanelTitle>{t('cart.panelTitle', { count: totalUnits })}</S.PanelTitle>
              {hasWearable ? (
                <S.Fitting onClick={() => setFittingOpen(true)} disabled={working}>
                  <Icon name="fitting-room" />
                  {t('cart.fittingRoom')}
                </S.Fitting>
              ) : null}
            </S.HeadCard>

            {/* Items card (Figma 1182-216322): the cart lines, p-24, radius 16. */}
            <S.Panel>
              <S.List>
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
                  // Whole-item deep link (same route the browse cards use): a token line → /token, a
                  // catalog line → /item (see lib/routes). The PDP re-hydrates from the passed state.
                  const detailPath = detailRouteFor(item)
                  // Live availability (optimistically 'available' until the trade resolves otherwise).
                  const status = availability[item.id]
                  const unavailable = !isLineBuyable(status)
                  const unavailableLabel =
                    status === 'sold-out' ? t('cart.availability.soldOut') : t('cart.availability.unavailable')
                  return (
                    <S.Card data-unavailable={unavailable || undefined} key={item.id}>
                      <S.Thumb data-thumb>
                        {detailPath ? (
                          <S.ThumbLink to={detailPath} state={{ item, tradeId: item.tradeId }} aria-label={item.name}>
                            {item.thumbnail ? <img src={item.thumbnail} alt={item.name} /> : null}
                          </S.ThumbLink>
                        ) : item.thumbnail ? (
                          <img src={item.thumbnail} alt={item.name} />
                        ) : null}
                        <S.ThumbCheck data-check aria-hidden>
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
                        </S.ThumbCheck>
                      </S.Thumb>
                      <S.Info>
                        <S.Desc data-desc>
                          {detailPath ? (
                            <S.NameLink to={detailPath} state={{ item, tradeId: item.tradeId }} title={item.name}>
                              {item.name}
                            </S.NameLink>
                          ) : (
                            <S.Name title={item.name}>{item.name}</S.Name>
                          )}
                          {item.creator ? <S.Creator address={item.creator} linkToProfile /> : null}
                          {/* A line with no tokenId is a fresh mint, i.e. bought straight from the creator
                              (Figma 1553-317153 "Tag-Creator") — the same rule the stepper uses to decide a
                              line supports quantity. Resales carry a tokenId and get no chip. */}
                          {isPrimary ? (
                            <S.CreatorTag data-testid="cart-creator-tag">
                              <S.CreatorTagIco name="buy-from-creator" />
                              {t('cart.creatorTag')}
                            </S.CreatorTag>
                          ) : null}
                        </S.Desc>
                        <S.Foot>
                          {unavailable ? (
                            /* No price/stepper: a warning + the reason, plus a link to the item's resales.
                               The trash button in checkout__actions is the one-tap remove. */
                            <>
                              <S.Unavailable>
                                <S.Warn name="warning-fill" size={24} />
                                {unavailableLabel}
                              </S.Unavailable>
                              {detailPath ? (
                                <S.Resales to={detailPath} state={{ item, tradeId: item.tradeId }}>
                                  {t('cart.availability.viewResales')}
                                </S.Resales>
                              ) : null}
                            </>
                          ) : (
                            <>
                              {/* Quantity stepper. PRIMARY (mint) lines can buy multiple copies: minus decrements
                          (floored at 1 — the trash button removes), plus increments up to remaining stock.
                          SECONDARY lines are a single unique token, so the stepper is hidden (qty is 1). */}
                              {isPrimary ? (
                                <S.Stepper>
                                  <S.Step
                                    onClick={() => editCart(() => decrement(item.id))}
                                    disabled={working || qty <= 1}
                                    aria-label={t('cart.decreaseQuantity', { name: item.name })}
                                  >
                                    <svg viewBox="0 0 16 16" fill="none" aria-hidden focusable="false">
                                      <path
                                        d="M3.5 8h9"
                                        stroke="currentColor"
                                        strokeWidth="1.5"
                                        strokeLinecap="round"
                                      />
                                    </svg>
                                  </S.Step>
                                  <S.Qty>{qty}</S.Qty>
                                  <S.Step
                                    onClick={() => editCart(() => increment(item.id))}
                                    disabled={working || atStockCap}
                                    aria-label={t('cart.increaseQuantity')}
                                  >
                                    <svg viewBox="0 0 16 16" fill="none" aria-hidden focusable="false">
                                      <path
                                        d="M8 3.5v9M3.5 8h9"
                                        stroke="currentColor"
                                        strokeWidth="1.5"
                                        strokeLinecap="round"
                                      />
                                    </svg>
                                  </S.Step>
                                </S.Stepper>
                              ) : null}
                              <S.Price>
                                <S.PriceIco /> {lineSubtotal}
                                {changed ? <S.PriceWas>{item.priceCredits * qty}</S.PriceWas> : null}
                              </S.Price>
                            </>
                          )}
                        </S.Foot>
                      </S.Info>
                      <S.Actions>
                        <S.Fav
                          data-on={faved || undefined}
                          onClick={() => toggleFav(item)}
                          aria-label={
                            faved
                              ? t('cart.removeFromFavorites', { name: item.name })
                              : t('cart.addToFavorites', { name: item.name })
                          }
                          title={faved ? t('assetCard.removeFromFavorites') : t('assetCard.addToFavorites')}
                        >
                          <Icon name={faved ? 'heart-solid' : 'heart'} />
                        </S.Fav>

                        <S.Remove
                          onClick={() => editCart(() => remove(item.id))}
                          disabled={working}
                          aria-label={t('cart.remove', { name: item.name })}
                          title={t('cart.removeTitle')}
                        >
                          <Icon name="trash" size={24} />
                        </S.Remove>
                      </S.Actions>
                    </S.Card>
                  )
                })}
              </S.List>

              {/* Utility actions kept subtle so they don't compete with the CTA. */}
              <S.Utils>
                <button className="link" onClick={() => editCart(clear)} disabled={working}>
                  {t('cart.clearCart')}
                </button>
              </S.Utils>
            </S.Panel>
          </S.Left>

          <S.Summary>
            <S.SummaryTitle>{t('cart.purchaseSummary')}</S.SummaryTitle>
            <S.SummaryBody>
              <S.TotalLine>
                <S.TotalLabel>{t('cart.totalItems', { count: buyableUnits })}</S.TotalLabel>
                <S.TotalSide>
                  <S.TotalValue>
                    <S.TotalIco /> {total}
                  </S.TotalValue>
                  {/* The rate sits under the total, not under the buttons (Figma): it explains the MANA
                      amounts below, so it reads before them. Absent when the buyer holds no MANA — there
                      is no MANA amount on screen to explain. */}
                  {summaryRateNote && (manaBalanceWei ?? 0n) > 0n ? (
                    <S.TotalRate data-testid="cart-mana-rate">{summaryRateNote}</S.TotalRate>
                  ) : null}
                </S.TotalSide>
              </S.TotalLine>

              {/* One CTA per rail the buyer's balances support, right in the panel (Figma 1558-320257 /
                  1558-320267). Priced off the cart's own line prices — the same number the total above
                  shows — so the buttons and the total can never disagree. The authoritative price is
                  re-resolved on click; a rail that stops being viable after that falls back to the modal. */}
              {summaryRails.options.length > 0 || summaryRails.manaShortfall ? (
                <PaymentCtas
                  options={summaryRails.options}
                  totalCents={summaryTotalCents}
                  shortfall={summaryRails.manaShortfall}
                  creditsLabel={review ? t('marketCheckout.confirmPurchase') : t('cart.buyWithCredits')}
                  busy={working || allUnavailable}
                  onPay={method => void (review ? confirmPurchase() : checkout(method))}
                />
              ) : (
                <S.Cta
                  onClick={() => void (review ? confirmPurchase() : checkout())}
                  disabled={working || allUnavailable}
                >
                  {working ? t('cart.working') : review ? t('marketCheckout.confirmPurchase') : t('assetCard.buyNow')}
                </S.Cta>
              )}

              {allUnavailable ? <S.Msg className="muted">{t('cart.allUnavailable')}</S.Msg> : null}
              {!session ? <S.Msg className="muted">{t('cart.signInHint')}</S.Msg> : null}
              {review ? <S.Msg className="muted">{t('cart.priceChanged')}</S.Msg> : null}
              {notice ? <S.Msg className="muted">{notice}</S.Msg> : null}
              <S.MsgNotice message={error} />
            </S.SummaryBody>
          </S.Summary>
        </S.Body>
      </S.Top>

      {upsell.length > 0 ? (
        <S.Upsell>
          <CollectionCarousel title={t('cart.youMightAlsoLike')} items={upsell} />
        </S.Upsell>
      ) : null}

      {authStep && session ? (
        <AuthorizeStep
          auth={authStep.auth}
          signer={session.signer}
          title={t('authorizeStep.manaTitle')}
          name={t('authorizeStep.manaName')}
          reason={t('authorizeStep.manaReason')}
          icon={<img src={manaLight} width={24} height={24} alt="" aria-hidden />}
          onAuthorized={() => {
            const { run } = authStep
            setAuthStep(null)
            run()
          }}
          onCancel={() => setAuthStep(null)}
          onClose={() => setAuthStep(null)}
        />
      ) : null}

      {modal ? (
        <CartCheckoutModal
          phase={modal.phase}
          balanceCredits={balanceCredits}
          onClose={closeModal}
          stage={modal.phase === 'processing' ? modal.stage : undefined}
          step={modal.phase === 'processing' ? modal.step : undefined}
          total={modal.phase === 'processing' ? modal.total : undefined}
          isSelfCustody={showsWalletConfirmations(session?.providerType)}
          options={modal.phase === 'choose' ? chooseOptions(modal).options : undefined}
          onPay={confirmMethod}
          totalCents={modal.phase === 'choose' ? modal.totalCents : undefined}
          totalManaWei={modal.phase === 'choose' ? modal.manaWei : undefined}
          totalCredits={modal.phase === 'choose' ? sumLineCredits(modal.lines) : undefined}
          lines={modal.phase === 'nofunds' ? modal.lines : undefined}
          shortfallCredits={modal.phase === 'nofunds' ? modal.shortfall : undefined}
          packs={OFFER_PACKS}
          selectedPack={selectedPack}
          onSelectPack={setSelectedPack}
          onBuyPacks={() => void buyCreditsAndItems()}
          message={modal.phase === 'error' ? modal.message : undefined}
          onRetry={() => void checkout()}
        />
      ) : null}
    </S.Checkout>
  )
}
