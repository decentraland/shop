import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CircularProgress } from 'decentraland-ui2'
import { useQueryClient } from '@tanstack/react-query'
import { useWallet } from '~/store/wallet'
import { useBalance } from '~/hooks/useBalance'
import { useManaBalance } from '~/hooks/useManaBalance'
import { fetchStoreMintState, resolveLiveTrade, type CatalogItem } from '~/lib/api'
import { CURRENCY, formatCredits, usdCentsToCredits } from '~/lib/currency'
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
import { canOfferGasRail } from '~/lib/gas-rail'
import { chainLabel, isWrongNetworkError, switchChain } from '~/lib/network'
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
import { JUMP_URL } from '~/lib/jump'
import * as M from './modal.styles'
import loaderLogo from '~/assets/credits/loader-logo.svg'

type Phase = 'loading' | 'ready' | 'nofunds' | 'processing' | 'complete' | 'error'

/** A mint's live price + remaining supply, re-read at checkout exactly as the cart re-reads it. */
const resolveStore: StoreResolver = item => fetchStoreMintState(item.contractAddress, String(item.itemId))

/**
 * What this purchase costs in MANA, or null when it cannot be established.
 *
 * A mint is PRICED in MANA on-chain and the resolve already read it — that exact figure is what the store
 * will verify, so there is nothing to ask the oracle and no failure mode. A trade has to be quoted, and
 * that read can fail; null is "we do not know", never "no MANA rail".
 */
async function manaPriceFor(sale: PurchaseTarget, opts: { reportFailure?: boolean } = {}): Promise<bigint | null> {
  if (sale.kind === 'store') return BigInt(sale.mint.item.priceWei)
  try {
    return await readTradeManaPriceWei(sale.trade)
  } catch (err) {
    // The retry passes false: one outage, one report.
    if (opts.reportFailure !== false) captureError(err, { flow: 'buy', step: 'mana_price' })
    return null
  }
}

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
 *   1. resolve the item's live listing (or live mint) and price it — nothing is reserved
 *   2. enough credits → "Buy Asset" · not enough → "Buy Credits and Item" (pack picker)
 *   3. confirm → authorize the credit (reserving the dollars), then "Completing transaction…"
 *   4. settled/indexed → "Purchase complete!"
 * On any exit after confirming without buying, the reserved dollars are released.
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
  /**
   * The chain to offer a switch to, or null for "do not offer it".
   *
   * Only ever set for a wrong-network refusal the buyer could actually act on. Reaching that refusal means a
   * relayed rail already failed — the relayed ones work from any network — so who they are decides the honest
   * answer: see lib/gas-rail. Everyone else is told their hold is released instead of being sent to a network
   * where they still could not pay.
   */
  const [retryChain, setRetryChain] = useState<number | null>(null)
  /**
   * A hold WAS taken and has been sent back — which the error screen has to say out loud.
   *
   * Not the same question as `reservedCreditIdRef.current`, which every catch clears the instant it asks for
   * the release so the unmount path cannot ask a second time. Clearing it also put the "your credits come
   * back" sentence out of reach of any buy that failed AFTER the price lock — and that is every buy, because
   * the reservation is taken when the buyer CONFIRMS, moments before the wallet prompt they then dismiss.
   * A cancelled signature therefore showed a balance tens of credits lower than a moment earlier with
   * nothing on screen to account for it.
   */
  const [holdReleased, setHoldReleased] = useState(false)
  // Bumped by the error state's TRY AGAIN to re-run the open sequence from scratch.
  const [attempt, setAttempt] = useState(0)
  const [selectedPack, setSelectedPack] = useState<string>('')
  const [itemCredits, setItemCredits] = useState(item.priceCredits)
  // The MANA (wei) this purchase costs — from the oracle for a trade, from the store's own on-chain price
  // for a mint. Null until read (or if the read fails, in which case MANA simply isn't offered and the
  // credits path is unaffected).
  const [manaPriceWei, setManaPriceWei] = useState<bigint | null>(null)
  // The oracle was asked and could not answer. Distinct from `manaPriceWei === null`, which is also the
  // state before anything has been asked — only this one means the MANA option is missing for a REASON.
  const [manaPriceUnavailable, setManaPriceUnavailable] = useState(false)
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
  /**
   * The authorize came back with a different price than the screen was showing, so the buyer has not yet
   * agreed to what they would be charged. Set only by `confirm`, cleared the moment they confirm again.
   */
  const [priceChanged, setPriceChanged] = useState(false)
  const reservedCreditIdRef = useRef<string | null>(null)
  /**
   * Whether this modal is gone. The authorize now happens on the click, so it can be in flight when the
   * buyer navigates away — and until it resolves there is no credit id for the unmount cleanup to release.
   * Without this the reservation would land on a dead component and hold those dollars until it expires,
   * which is the leak this whole change exists to remove.
   */
  const goneRef = useRef(false)
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

  // Its own effect, with no deps: the open sequence re-runs on TRY AGAIN, and its cleanup must not be
  // mistaken for the component going away.
  useEffect(() => {
    goneRef.current = false
    return () => {
      goneRef.current = true
    }
  }, [])

  /**
   * Route to the no-funds state — but only AFTER settling whether MANA could have paid.
   *
   * The MANA price used to be read by a later effect, gated on the phase already being `nofunds`. So a
   * buyer holding MANA was shown "Insufficient funds — buy credits" first, by construction, and the
   * screen only became a payment choice once the oracle answered. Nobody waits to see if a dead end
   * turns into an offer: they have already read that they cannot afford it.
   *
   * Two things follow from resolving first. `Shop Buy Credits Prompted` no longer fires for buyers who
   * could pay — it was inflating the "no funds" figure with people who had the money. And an oracle
   * that fails is REPORTED rather than silently deleting the MANA rail: the old catch only warned in
   * DEV, so in production the option vanished with nobody the wiser.
   *
   * Reached from BOTH the open sequence (the balance is known and short) and from `confirm` (the server
   * refused the authorize), which is why it takes its own cancellation check instead of closing over the
   * open effect's.
   */
  async function goNoFunds(credits: number, sale: PurchaseTarget, priceCents: number, cancelled?: () => boolean) {
    // Only a buyer who HOLDS MANA can have a MANA rail, so only they are worth making wait. Everyone
    // else reaches the pack picker with no oracle round-trip at all — the guard the old effect carried
    // (`manaBalanceWei <= 0n → return`), which moving this read onto the blocking path would otherwise
    // have dropped. A trade quote is three sequential RPC calls; charging them to the majority who
    // cannot use the answer is a slower screen for nothing.
    const holdsMana = (manaBalanceWei ?? 0n) > 0n
    const manaWei = holdsMana ? await manaPriceFor(sale) : null
    if (cancelled?.()) return
    if (manaWei != null) setManaPriceWei(manaWei)
    // "Unavailable" is only true of a read that was ATTEMPTED. Someone with no MANA is not owed a notice
    // about a price we never asked for.
    else if (holdsMana) setManaPriceUnavailable(true)

    const rails = computePaymentOptions({
      priceCents,
      priceManaWei: manaWei ?? 0n,
      balanceCents: balance?.balanceCents ?? 0,
      manaBalanceWei: manaBalanceWei ?? 0n
    })
    const canPayWithMana = rails.options.some(o => o.method === 'mana' || o.method === 'combined')

    const shortfall = credits - (balance?.credits ?? 0)
    const cover = OFFER_PACKS.find(p => p.credits >= shortfall) ?? OFFER_PACKS[OFFER_PACKS.length - 1]
    setSelectedPack(cover.id)
    // Only a buyer with no way to pay is being prompted to top up. Tracking the rest is what made this
    // number untrustworthy.
    if (!canPayWithMana) {
      track('Shop Buy Credits Prompted', {
        from: 'item_checkout',
        credits_needed: credits,
        credits_balance: balance?.credits ?? 0,
        shortfall: Math.max(0, shortfall)
      })
    }
    setPhase('nofunds')
  }

  /**
   * Step 1 on open: resolve the live purchase, price it, and branch on whether the balance covers it.
   *
   * NOTHING is reserved here. The resolve already yields the exact price — the authorize does not set it,
   * it echoes it (see `confirm`) — so opening this modal costs the buyer nothing. Re-runs on `attempt`,
   * which is what the error state's TRY AGAIN bumps: the honest retry is a fresh resolve, never a replay.
   */
  useEffect(() => {
    let cancelled = false
    if (!session) {
      setPhase('error')
      setError(t('buyModal.signInToCheckout'))
      return
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
        // Known-and-short → straight to the pack picker.
        if (balance != null && balance.credits < credits) {
          await goNoFunds(credits, sale, usdCents, () => cancelled)
          return
        }
        // Resuming after a Stripe top-up: the buyer already committed, so finish automatically. The
        // purchase is passed in rather than read back off state, which has not flushed yet.
        if (resume) void confirm({ sale, usdCents })
        else setPhase('ready')
      } catch (e) {
        if (cancelled) return
        // 'resolve', not 'authorize': nothing is authorized here any more. Sold-out, an own listing, an
        // unavailable price and a missing trade all land in this catch, and reporting them as authorize
        // failures would blend them into the one metric that says whether moving the mint to the click
        // worked — making the authorize-failure rate appear to RISE the moment this ships.
        track(isUserRejection(e) ? 'Shop Purchase Cancelled' : 'Shop Purchase Failed', {
          step: 'resolve',
          error_code: errorCode(e)
        })
        failWith(e)
      }
    })()
    return () => {
      cancelled = true
      if (reservedCreditIdRef.current && session) {
        void releaseIfNotInFlight([reservedCreditIdRef.current])
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
    let cancelled = false
    /**
     * Deliberately runs even after `goNoFunds` already tried and failed: a MANA/USD read is one RPC hop
     * and a blip should not cost the buyer their MANA rail for the life of the modal. So this is the
     * retry, not a duplicate — and `reportFailure: false` keeps a single outage from being reported twice.
     */
    void manaPriceFor(sale, { reportFailure: !manaPriceUnavailable }).then(wei => {
      if (cancelled) return
      if (wei != null) setManaPriceWei(wei)
      else setManaPriceUnavailable(true)
    })
    return () => {
      cancelled = true
    }
  }, [phase, locked, resolvedSale, manaBalanceWei, manaPriceWei, manaPriceUnavailable])

  // Which rails the buyer's balances actually support (pure — see lib/payment-options). MANA rails
  // appear only once both the MANA balance and the MANA price are known; until then this is just the
  // credits rail (or nothing), which keeps the default flow untouched.
  const paymentOptions = computePaymentOptions({
    priceCents,
    priceManaWei: manaPriceWei ?? 0n,
    balanceCents: balance?.balanceCents ?? 0,
    manaBalanceWei: manaBalanceWei ?? 0n
  })

  /**
   * Buy — and the ONLY place this modal mints a full-price credit.
   *
   * The authorize used to run when the modal OPENED. An ephemeral credit is signed, and a signed credit
   * cannot be revoked: it stays spendable until its own expiry whatever the client does next, and the
   * balance query keeps subtracting it for that whole time. So every window a buyer merely opened froze
   * that item's price out of their balance for minutes, and cancelling on close could not give it back
   * any sooner — one buyer held four at once across two items. Minting on the click is the only thing
   * that prevents it, rather than trying to unwind it afterwards.
   *
   * Nothing on screen needed the reservation: the server does not PRICE the purchase, it echoes what we
   * send (rounded up to a whole credit, which is the same rounding `usdCentsToCredits` already applies),
   * so the resolve's own figure is the figure that gets charged. The one case where the two can disagree
   * is handled below rather than assumed away.
   *
   * `at` carries the freshly resolved purchase for the `resume` path, whose state has not flushed yet.
   */
  async function confirm(at?: { sale: PurchaseTarget; usdCents: number }) {
    const sale = locked?.sale ?? at?.sale ?? resolvedSale
    const cents = locked?.usdCents ?? at?.usdCents ?? priceCents
    if (!session || !sale || cents <= 0) return
    setPhase('processing')
    setError(null)
    setPriceChanged(false)

    let lk = locked
    if (!lk) {
      try {
        const {
          credit,
          maxCreditedValue,
          usdCents: lockedCents
        } = await authorizeUsdCredit(session.identity, cents, tradeIdOf(sale), purchasedItem(item))
        // The buyer left while this was in flight. The unmount cleanup ran before there was an id to
        // release, so this is the only place that can hand it back — and it must, before the submit.
        if (goneRef.current) {
          void releaseReservation([credit.id])
          return
        }
        reservedCreditIdRef.current = credit.id
        // The dollars are committed as of this line, and the cached balance still says otherwise —
        // `useBalance` holds it for 30s, so nothing would refetch on its own. Every other invalidation
        // in this file fires on a failure or after a purchase; the moment money is actually held had
        // none, which is exactly when the buyer needs the balance (and its `held` block) to be right.
        void qc.invalidateQueries({ queryKey: ['usd-balance'] })
        const lockedCredits = usdCentsToCredits(lockedCents)
        lk = { sale, credit, maxCreditedValue, usdCents: lockedCents, credits: lockedCredits }
        setLocked(lk)
        /**
         * The reservation must never charge more (or less) than the screen said.
         *
         * Normally it cannot: the price is ours and the server only rounds it up to a whole credit. But
         * the credits-server hands back an EXISTING live credit for the same item rather than minting a
         * second one, and that one was priced at an earlier read — so its amount can differ from what
         * this modal is showing. Fail closed: re-render at the price that is actually reserved and make
         * the buyer confirm it. The credit is kept, so agreeing spends this one instead of minting again.
         */
        if (lockedCredits !== usdCentsToCredits(cents)) {
          setItemCredits(lockedCredits)
          setPriceCents(lockedCents)
          setPriceChanged(true)
          setPhase('ready')
          return
        }
      } catch (authErr) {
        // Server said not enough credits → show the pack picker, not a bare error.
        if (isInsufficient(authErr)) {
          // Reaching here means our own balance read said the buyer COULD afford it, so that read is the
          // thing that is wrong. Refetch it, or the shortfall the pack picker states is computed from a
          // number the server has just contradicted.
          void qc.invalidateQueries({ queryKey: ['usd-balance'] })
          await goNoFunds(usdCentsToCredits(cents), sale, cents)
          return
        }
        if (!isUserRejection(authErr)) captureError(authErr, { flow: 'buy', step: 'authorize' })
        track(isUserRejection(authErr) ? 'Shop Purchase Cancelled' : 'Shop Purchase Failed', {
          step: 'authorize',
          error_code: errorCode(authErr)
        })
        setError(friendlyError(authErr, t('buyModal.error.generic'), { sale: true }))
        setPhase('error')
        return
      }
    }
    if (!lk) return
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
      releaseOptimistically([lk.credit.id])
      reservedCreditIdRef.current = null
      track(isUserRejection(e) ? 'Shop Purchase Cancelled' : 'Shop Purchase Failed', {
        step: 'submit',
        error_code: errorCode(e)
      })
      void qc.invalidateQueries({ queryKey: ['usd-balance'] })
      failWith(e)
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
  function releaseReservation(ids: string[]): Promise<boolean> {
    if (!session || ids.length === 0) return Promise.resolve(false)
    const safe = ids.filter(id => !guardRef.current.mayBeConsumed(id))
    if (safe.length === 0) return Promise.resolve(false)
    // Resolves TRUE for anything actually handed back — and only that. A credit the guard kept may be
    // spent, so telling the buyer it is coming back would be a lie at the worst possible moment. The
    // request's own fate is not the question: unconsumed credits return on the server's sweep either way.
    return cancelUsdIntents(session.identity, safe).then(
      () => true,
      () => true
    )
  }

  /**
   * Release a reservation and SAY SO IMMEDIATELY.
   *
   * The error screen paints synchronously after every caller, so the reassurance cannot wait on the release
   * round-trip — it would land after the buyer had already read that the purchase failed. The promise is made
   * first and corrected DOWN only: `false` means the guard kept the credit because it may already be spent,
   * and promising it back would be a lie at the worst possible moment.
   */
  function releaseOptimistically(ids: string[]): void {
    setHoldReleased(true)
    void releaseReservation(ids).then(released => {
      if (!released) setHoldReleased(false)
    })
  }

  /**
   * The unmount path, which needs a STRICTER rule than a buy's own catch.
   *
   * A catch runs after its submit settles, so it knows whether a transaction went out. This runs whenever the
   * component goes away — including while the wallet prompt is open, or while the relayer is mid-round-trip,
   * when nothing has been reported yet. Releasing on "nothing broadcast" there hands back a credit the buyer
   * is about to spend. A modal abandoned before any submit still releases, which is the case it exists for.
   */
  function releaseIfNotInFlight(ids: string[]): Promise<boolean> {
    return releaseReservation(ids.filter(id => !guardRef.current.isInFlight(id)))
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
      // Handed back because THIS rail spends MANA instead — and if the MANA leg then fails, the error
      // screen still owes the buyer an explanation for the balance that just moved.
      releaseOptimistically([reservedCreditIdRef.current])
      reservedCreditIdRef.current = null
    }
    setPhase('processing')
    setError(null)
    try {
      // What the rail will pull, so its allowance check asks "is it enough" rather than "is there any" — an
      // allowance left over from a cheaper purchase otherwise skips the approve and reverts the sale.
      const manaWei = findOption(paymentOptions, 'mana')?.manaWei
      // A listing settles against the marketplace, a mint against the CollectionStore. Same rail from the
      // buyer's side: no credits are spent either way, and lib/buy-mana relays both so a managed wallet
      // (which holds no POL) can take it.
      const txHash =
        sale.kind === 'trade'
          ? await buyWithMana({ trade: sale.trade, buyer: session.address, signer: session.signer, manaWei })
          : await buyMintWithMana({ mint: sale.mint, buyer: session.address, signer: session.signer, manaWei })
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
      failWith(e)
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
    // Release the full-price reservation (if one was made) and WAIT for it, because the authorize below
    // asks for a credit sized to the balance and the server answers with a live one for the same item
    // rather than minting a second. A release still in flight can therefore come straight back as the
    // full-price credit this just gave up — against a MANA gap computed for the partial one.
    if (reservedCreditIdRef.current) {
      if (await releaseReservation([reservedCreditIdRef.current])) setHoldReleased(true)
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
        // Decides whether this buyer is offered the gas-paying fallback when the relay refuses — a managed
        // wallet holds no POL, so for them the rail ends here rather than at INSUFFICIENT_FUNDS.
        providerType: session.providerType,
        // Same rule as the credits-only rail, against THIS reservation: the partial credit, not the price lock
        // that was released above.
        onBroadcast: ({ txHash: h }: { txHash: string }) => guardRef.current.broadcast(credit.id, h),
        onReverted: ({ txHash: h }: { txHash: string | null }) => {
          if (h) guardRef.current.reverted(h)
        },
        // The relay may have broadcast before it went dark: no hash means the reservation can never be
        // released, so mark it rather than let the catch below hand the money back.
        onUnobservable: () => guardRef.current.unobservable(credit.id)
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
      if (partialCreditId) releaseOptimistically([partialCreditId])
      if (!isUserRejection(e)) captureError(e, { flow: 'buy_credits_and_mana', step: 'submit' })
      track(isUserRejection(e) ? 'Shop Purchase Cancelled' : 'Shop Purchase Failed', {
        step: 'submit',
        error_code: errorCode(e)
      })
      void qc.invalidateQueries({ queryKey: ['usd-balance'] })
      failWith(e)
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
    // Release the (unaffordable) item reservation; we re-authorize after topping up. Both are gated on the
    // ref so it can never be dropped without the credit it names being handed back.
    if (reservedCreditIdRef.current) {
      void releaseReservation([reservedCreditIdRef.current])
      reservedCreditIdRef.current = null
    }
    setLocked(null)
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

  /**
   * Land in the error phase — and, for a wrong-network refusal, say something the buyer can act on.
   *
   * Reaching that refusal means a relayed rail ALREADY failed: the relayed ones work from any network, so
   * nothing else puts a buyer in front of a chain requirement. From there the honest answer depends on who
   * they are (see lib/gas-rail). A managed wallet cannot switch or hold POL, so "switch to Polygon" was
   * advice it could not follow — and network wording is what those users must never be shown at all; a
   * self-custody wallet with no POL would switch, sign, and revert on gas. Both are told their hold is
   * released. Only a wallet that can really pay is offered the switch.
   *
   * The generic message is set SYNCHRONOUSLY first so the error phase is never briefly blank; the wallet
   * check then refines it. For a managed wallet that check short-circuits without a network call.
   */
  function failWith(e: unknown) {
    setError(friendlyError(e, t('buyModal.error.generic'), { sale: true }))
    setPhase('error')
    if (!isWrongNetworkError(e) || !session) return
    const required = e.required
    void (async () => {
      if (await canOfferGasRail(session.providerType, session.address)) {
        setRetryChain(required)
        return
      }
      setError(t('buyModal.error.relayDownNoRail'))
    })()
  }

  /**
   * Switch the wallet, then resume the rail they chose — ONE action, from inside their own click.
   *
   * Both halves matter. The click is what makes the switch legal: a wallet refuses a `wallet_*` request it
   * cannot attribute to a user gesture, with the `-32006` that used to reach Sentry dressed as a revert
   * (see lib/network). And the retry is what makes it useful — the failed attempt already released its
   * reservation, so a button that only changed networks would leave them staring at the same dead screen,
   * with no sign that starting over was on them.
   *
   * The credits rail needs a FRESH credit: the one it locked was released on the way in here, so reusing it
   * would spend an intent the server has already cancelled. The MANA rails hold no credit and resume as-is.
   */
  async function switchAndRetry(chainId: number) {
    if (!session) return
    setRetryChain(null)
    try {
      await switchChain(session.web3Provider, chainId)
    } catch (switchErr) {
      // Declining is an answer, not a failure to retry around — leave the offer standing, say nothing new.
      if (!isUserRejection(switchErr)) captureError(switchErr, { flow: 'buy', step: 'switch_chain' })
      setRetryChain(chainId)
      return
    }
    // `retry` and not a resume: with the reservation now taken at confirm time, it clears `locked` on
    // purpose (see there) — the price is re-resolved and re-locked, which is the only thing that can be
    // said to be correct after the buyer moved networks.
    retry()
  }

  function runRail(rail: PaymentMethod) {
    if (rail === 'mana') void confirmMana()
    else if (rail === 'combined') void confirmCombined()
    else void confirm()
  }

  /**
   * The MANA rails read an allowance BEFORE anything sets the processing phase, so the confirm button stays
   * enabled across that await. Two clicks there used to start two purchases — and the mixed rail reserves,
   * so that is two credits for one item. The rails themselves flip the phase synchronously, which disables
   * the button; this only has to cover the read.
   */
  const startingRef = useRef(false)

  async function startPurchase(rail: PaymentMethod) {
    if (startingRef.current) return
    startingRef.current = true
    try {
      const sale = locked?.sale ?? resolvedSale
      if (rail === 'credits' || !sale || !session) {
        runRail(rail)
        return
      }
      const auth = manaAuthFor(rail, sale)
      /**
       * Sized to THIS purchase, like the cart's own approval path.
       *
       * Without the amount the check is `allowance > 0` — "is there any?" rather than "is it enough?" — so
       * a buyer carrying a smaller allowance from a cheaper purchase is told they are already approved, the
       * approval step is skipped, and the transaction reverts on chain.
       *
       * On a failed status read, assume approved and let the lib's ensureAuthorization handle it: that is
       * the pre-existing behaviour, so a flaky RPC degrades to "unannounced prompt", never to a blocked buy.
       */
      const requiredWei = paymentOptions.options.find(o => o.method === rail)?.manaWei ?? 0n
      const authorized = await getAuthorizationStatus(auth, session.address, requiredWei).catch(() => true)
      if (needsApprovalStep(session.providerType, authorized)) {
        setAuthStep({ auth, rail })
        return
      }
      runRail(rail)
    } finally {
      startingRef.current = false
    }
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
    // Drop the previous attempt's reservation along with its price. It was either released by the catch or
    // is unsafe to touch, and either way spending it on the retry would charge a credit this run never
    // made — the effect below re-resolves from scratch and `confirm` reserves again.
    setLocked(null)
    setPriceChanged(false)
    setHoldReleased(false)
    setPhase('loading')
    setAttempt(a => a + 1)
  }

  /**
   * Whether this failure left the buyer's credits reserved.
   *
   * Only then is "they weren't used and will come back" a true statement: a run that failed before the
   * authorize — a rejected signature, a wrong network — never took anything, and promising a refund for
   * money we never held would be its own kind of wrong. The reservation is released on unmount, so while
   * this modal is open the credits genuinely are still held.
   *
   * Read from the ref rather than mirrored into state: entering the error phase is itself a re-render,
   * and the ref is only ever written in the same synchronous flows that set the phase.
   */
  /**
   * While a switch-and-retry is on offer the hold is NOT unwinding — it is waiting to be spent by that very
   * retry — so promising its return would be the opposite of true.
   */
  const heldCredits = phase === 'error' && retryChain === null && (!!reservedCreditIdRef.current || holdReleased)

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
            /**
             * A buyer holding MANA never reaches the no-funds screen — this step replaces it — so without
             * this the one person who most needs the explanation is the only one who cannot get it: they
             * see "Credits Balance: 2" against a 3-credit item with no hint that 3 more are their own,
             * held by a purchase they already started. Price-change wins when both apply; it is about
             * what they are about to be charged.
             */
            notice={
              priceChanged
                ? t('buyModal.priceChanged')
                : balance?.held
                  ? t('buyModal.heldExplainer', { credits: balance.held.credits, currency: CURRENCY.name })
                  : null
            }
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
                    <b>{t('cartCheckout.errorHeadline')}</b>{' '}
                    {/* The REASON first, then what became of the money. A cancelled signature needs both:
                        "You cancelled the request" explains the screen, and the hold sentence explains the
                        balance that dropped a second earlier. Showing only one of them is how a buyer ends
                        up staring at credits they cannot account for. The generic body is skipped when the
                        hold sentence is present — both say "your credits are safe", once is enough. */}
                    {error ?? (heldCredits ? null : t('cartCheckout.errorBody'))}
                    {heldCredits ? (
                      <>
                        {error ? ' ' : ''}
                        {t('cartCheckout.heldLead', { currency: CURRENCY.name })}
                        <b>{t('cartCheckout.heldBold')}</b>
                        {t('cartCheckout.heldTail', { currency: CURRENCY.name })}
                      </>
                    ) : null}
                  </M.BuyErrorText>
                </M.BuyError>
                {retryChain !== null ? (
                  /* The relay failed and THIS buyer can actually take the gas-paying rail (self-custody,
                     funded — see lib/gas-rail). One control, because switching without resuming would just
                     leave them on the same dead screen. */
                  <M.Ctas>
                    <M.Btn data-variant="outline" onClick={onClose}>
                      {t('buyModal.cancel')}
                    </M.Btn>
                    <M.Btn
                      data-variant="purple"
                      data-testid="switch-and-retry"
                      onClick={() => void switchAndRetry(retryChain)}
                    >
                      {t('buyModal.error.switchAndRetry', { network: chainLabel(retryChain) })}
                    </M.Btn>
                  </M.Ctas>
                ) : heldCredits ? (
                  /* Nothing to retry WITH while the reservation is still unwinding — the copy above says to
                     come back once the balance is whole, so offering it here would only fail again. */
                  <M.Ctas>
                    <M.Btn data-variant="purple" data-full onClick={onClose}>
                      {t('cartCheckout.gotIt')}
                    </M.Btn>
                  </M.Ctas>
                ) : (
                  <M.Ctas>
                    <M.Btn data-variant="outline" onClick={onClose}>
                      {t('buyModal.cancel')}
                    </M.Btn>
                    <M.Btn data-variant="purple" onClick={retry}>
                      {t('cartCheckout.tryAgain')}
                    </M.Btn>
                  </M.Ctas>
                )}
              </M.Body>
            )}

            {/* Not enough credits — insufficient warning + pack picker */}
            {phase === 'nofunds' && (
              <M.Body>
                {/* The MANA rail is missing because the oracle could not be read, not because the buyer
                    cannot afford it. Said out loud: without it they are told to buy credits for something
                    their MANA may well have covered, and the reason is invisible. */}
                {manaPriceUnavailable && manaPriceWei === null && (manaBalanceWei ?? 0n) > 0n ? (
                  <M.Warning data-testid="mana-price-unavailable">
                    <WarningTriangleIcon />
                    <M.WarningText>{t('buyModal.manaPriceUnavailable')}</M.WarningText>
                  </M.Warning>
                ) : null}
                {/* The buyer's OWN money, committed to a purchase they already started, is part of why the
                    balance is short. Saying "you need to buy N more credits" without this is how a hold got
                    read as the Shop taking them — and here it would be telling someone to pay twice. */}
                {balance?.held ? (
                  <M.Warning data-testid="nofunds-held">
                    <WarningTriangleIcon />
                    <M.WarningText>
                      {t('buyModal.heldExplainer', {
                        credits: balance.held.credits,
                        currency: CURRENCY.name
                      })}
                    </M.WarningText>
                  </M.Warning>
                ) : null}
                <M.Warning>
                  <WarningTriangleIcon />
                  <M.WarningText>
                    <b>{t('buyModal.insufficientFunds')}</b> {t('buyModal.warningNeedToBuy')}{' '}
                    <b>{t('buyModal.warningCreditsAmount', { count: Math.max(1, priceCredits - balanceCredits) })}</b>{' '}
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
                    shortfall={paymentOptions.manaShortfall}
                    onPay={() => undefined}
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
                {/* The reserved price is not the one the buyer was looking at, so the row below has been
                    re-rendered at the real one and needs agreeing to before anything is spent. */}
                {priceChanged && (
                  <M.Warning data-testid="price-changed" role="status">
                    <WarningTriangleIcon />
                    <M.WarningText>{t('buyModal.priceChanged')}</M.WarningText>
                  </M.Warning>
                )}
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
                  {/* A LINK, not a button that closes: this used to only dismiss the modal, so the same
                      "Try in World" opened the launcher from the cart's success page and did nothing from
                      the PDP. Still closes behind itself — the purchase is finished either way. */}
                  <M.BtnLink data-variant="ruby" href={JUMP_URL} target="_blank" rel="noreferrer" onClick={onClose}>
                    {t('buyModal.tryInWorld')}
                    <JumpInIcon />
                  </M.BtnLink>
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
