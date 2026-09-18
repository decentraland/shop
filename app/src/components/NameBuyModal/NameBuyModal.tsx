import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { useWallet } from '~/store/wallet'
import { useBalance, balanceLabel } from '~/hooks/useBalance'
import {
  type NameRegistrationStage,
  NameNotRegisteredError,
  NameRouteCostTooHighError,
  NameSettlementUnknownError,
  registerNameWithUsdCredits
} from '~/lib/names'
import { showsWalletConfirmations } from '~/lib/wallet-kind'
import { Icon } from '~/components/Icon'
import { CurrencyIcon } from '~/components/CurrencyIcon'
import { WarningTriangleIcon } from '~/components/Icons/WarningTriangleIcon'
import { formatCredits } from '~/lib/currency'
import { isIapMode } from '~/lib/iap'
import { hrefFor } from '~/lib/routes'
import { captureError } from '~/lib/monitoring'
import { createPackCheckout, MAX_OFFER_PACKS, type CreditPack } from '~/lib/payments'
import { useCreditPacks } from '~/hooks/useCreditPacks'
import { RESUME_NAME_KEY } from '~/lib/resume-name'
import { RESUME_BUY_KEY } from '~/lib/resume-buy'
import { RESUME_CART_KEY } from '~/lib/cart-checkout'
import { track, errorCode, isUserRejection, creditsToUsd } from '~/lib/analytics'
import { config } from '~/config'
import { t } from '~/intl/i18n'
import loaderLogo from '~/assets/credits/loader-logo.svg'
import packCoin from '~/assets/credits/pack-coin.webp'
import nameGlyph from '~/assets/names/name-glyph.svg'
import nameVerified from '~/assets/names/name-verified.svg'
import * as M from '~/components/BuyModal/modal.styles'
import * as S from './NameBuyModal.styles'

/**
 * `pending` is its own phase, NOT a flavour of success.
 *
 * Registering a NAME is cross-chain: the credit is spent on Polygon, and the NAME is minted on Ethereum by
 * an Across relayer afterwards. `registerNameWithUsdCredits` distinguishes the two outcomes precisely —
 * `registered` means the mint ran, `pending` means the money left but the bridge has not landed inside our
 * polling window — and showing "Purchase complete! You can find your NAME in the My Items tab" for the
 * second one sends the buyer to look for something that does not exist yet.
 */
type Phase = 'confirm' | 'completing' | 'success' | 'pending' | 'error'

/**
 * Buy-a-NAME flow. The name is already validated + probed available on the search page; here we make
 * the user RE-ENTER it (a deliberate confirmation gate, per Figma) and then register it with credits
 * via the shop's names lib. Web2 wording throughout: "purchase", never "transaction"/"wallet" — the
 * only relaxation is a generic "confirm" step for self-custody users (see CONVENTIONS.md).
 */
export function NameBuyModal({
  name,
  priceCredits,
  onClose
}: {
  name: string
  priceCredits: number | null
  onClose: () => void
}) {
  const { session } = useWallet()
  const { data: balance, isError: balanceError } = useBalance(session)
  const qc = useQueryClient()
  const navigate = useNavigate()

  const [phase, setPhase] = useState<Phase>('confirm')
  const [reentry, setReentry] = useState('')
  // The credit pack the no-funds screen would buy, once the buyer has picked one. Empty means "whatever is
  // recommended right now" rather than "none" — see `activePack`.
  const [selectedPack, setSelectedPack] = useState('')
  const [topUpBusy, setTopUpBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Whether the credit is spent or may be, which decides if a retry is offered at all. Retrying on either
  // buys a second one — for the unknown case while the first may still be in flight.
  const [retryUnsafe, setRetryUnsafe] = useState(false)
  // What the purchase is currently doing, so the processing screen can stop asking for a confirmation the
  // buyer already gave. Reset on every attempt, not just on mount.
  const [stage, setStage] = useState<NameRegistrationStage>('preparing')
  const startedRef = useRef(false)

  const matches = reentry.trim().toLowerCase() === name.toLowerCase()
  /**
   * Dismissal is off while anything irreversible is in flight — the registration, and the top-up checkout.
   *
   * `topUpBusy` belongs here and not only on the button: `createPackCheckout` is a network round trip, and
   * it is not tied to this component's lifetime. Closing during it does not cancel it, so a buyer who hit
   * Escape on a slow connection was still thrown out to Stripe a second later, with the hand-off already
   * written.
   */
  const busy = phase === 'completing' || topUpBusy
  const priceLabel = priceCredits != null ? formatCredits(priceCredits) : '—'

  /**
   * Why the CTA needs more than "the name matches".
   *
   * A NAME is priced in MANA on-chain and paid in credits, so the price only exists while the MANA/USD
   * oracle answers. With no rate the row shows "—" and the purchase cannot be sized — `registerNameWithUsdCredits`
   * would read the oracle itself and throw ("mana rate unavailable/stale/incomplete") into the generic
   * error. Better to say so before the click than to fail after it.
   *
   * The balance was already on screen but never compared to the price, so someone short on credits reached
   * the server, failed `authorizeUsdCredit`, and got the same generic error — instead of "you need N more".
   * `balance` is undefined while loading and on error (see useBalance): in both cases we do NOT block, since
   * refusing a purchase because our own balance read failed is worse than letting the server decide.
   *
   * Being short is no longer a reason to block at all — it opens the pack picker below instead — so the only
   * thing left that can refuse the CTA outright is a price we cannot compute.
   */
  const priceUnavailable = priceCredits == null
  const spendable = balance?.credits
  const shortBy = priceCredits != null && spendable != null ? priceCredits - spendable : 0
  const insufficient = shortBy > 0
  const blockedReason = priceUnavailable ? t('names.priceUnavailable') : null

  /**
   * Which packs are offered, and which one is recommended.
   *
   * Only packs that actually COMPLETE this purchase are shown: this picker is an offer to finish buying the
   * NAME, and a pack smaller than the gap breaks that promise — the buyer pays and lands back on this same
   * screen, still short. The whole list is the fallback for a NAME dearer than the largest pack, where an
   * empty picker would be worse than an honest one.
   *
   * The recommendation is the SMALLEST pack that closes the gap — the cheapest way to the NAME they came
   * for, not the one we would rather sell. In the fallback case nothing closes it, so the largest is the
   * most progress on offer.
   */
  const offerPacks = useCreditPacks().packs.slice(0, MAX_OFFER_PACKS)
  const coveringPacks = offerPacks.filter(p => p.credits >= shortBy)
  const packs = coveringPacks.length > 0 ? coveringPacks : offerPacks
  const recommendedPack: CreditPack | null =
    packs.length === 0
      ? null
      : coveringPacks.length > 0
        ? packs.reduce((best, p) => (p.credits < best.credits ? p : best))
        : packs.reduce((best, p) => (p.credits > best.credits ? p : best))
  // The recommendation is the default, not a pre-click: until the buyer picks a tile it tracks the live
  // shortfall, so a balance that refreshes mid-screen re-recommends rather than leaving a stale choice.
  const activePack = packs.find(p => p.id === selectedPack) ?? recommendedPack
  /**
   * The badge is a PROMISE that this pack finishes the NAME, so it only appears when one actually does.
   *
   * In the fallback branch nothing closes the gap, and badging the largest pack there would make exactly
   * the claim the covering filter exists to prevent: the buyer pays, comes back, and is still short —
   * staring at this same screen. The pack is still preselected (it is the most progress on offer) and the
   * warning above still states the real shortfall; it just stops calling itself the answer.
   */
  const recommendationCloses = coveringPacks.length > 0

  /**
   * Close on Escape (unless mid-purchase). Freezing the page behind the modal is NOT done here.
   *
   * This used to also set `body { overflow: hidden }`, which did two wrong things at once. It never locked
   * anything — index.css sets `html { overflow-x: clip }`, and body's overflow only reaches the viewport
   * while html is `visible`, so the page kept scrolling behind the open modal. And it made body a scroll
   * container, which re-parents the sticky sub-nav's scroll context: the tabs dropped out of their pinned
   * position the moment the modal opened.
   *
   * `useDialogScrollLock`, mounted once in App, is what actually locks the page — it enrolls this modal
   * automatically through the `[role="dialog"][aria-modal="true"]` it already carries, and hands the
   * scrollbar's width back as padding so nothing shifts.
   */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [busy, onClose])

  async function buy() {
    // Repeats every condition the CTA is disabled on, rather than trusting that it was. The button being
    // disabled is a UI fact; this is the money call, and it should be safe to invoke from anywhere.
    if (!session || !matches || priceUnavailable || insufficient || startedRef.current) return
    startedRef.current = true
    setPhase('completing')
    setError(null)
    setStage('preparing')
    try {
      const result = await registerNameWithUsdCredits({
        name,
        identity: session.identity,
        signer: session.signer,
        onProgress: setStage
      })
      // The money left the balance in both outcomes, so both refresh it and both count as a completed
      // purchase for analytics — what differs is only whether the NAME exists yet.
      track('Shop Completed Purchase', {
        // Same shape as every other purchase event so a NAME lands in the same warehouse columns
        // instead of being a special case that item-level and revenue cards silently drop.
        items: [
          {
            item_id: null,
            contract_address: null,
            token_id: null,
            price_usd: creditsToUsd(priceCredits ?? 0),
            category: 'name',
            is_smart: false
          }
        ],
        purchase_type: 'name',
        is_primary: true,
        payment_type: 'credits',
        value_credits: priceCredits ?? null,
        value_usd: creditsToUsd(priceCredits ?? 0),
        transaction_hash: result.originTxHash ?? null,
        settlement: result.status
      })
      void qc.invalidateQueries({ queryKey: ['usd-balance'] })
      // A freshly registered NAME is a new owned asset — refresh My Assets (the Names section reads the
      // 'my-assets' family) so it shows up without waiting for the 30s staleTime or a manual reload.
      void qc.invalidateQueries({ queryKey: ['my-assets'] })
      setPhase(result.status === 'registered' ? 'success' : 'pending')
    } catch (e) {
      track(isUserRejection(e) ? 'Shop Purchase Cancelled' : 'Shop Purchase Failed', {
        step: 'submit',
        error_code: errorCode(e),
        purchase_type: 'name'
      })
      // The route-cost guard is a DISTINCT condition and gets its own copy. The credits-server withholds
      // the route (503 ROUTE_COST_TOO_HIGH) when Across' bridge overhead exceeds what the executor can
      // front; the lib types it separately and rethrows it unwrapped for exactly this. It is temporary and
      // nothing is wrong with the buyer's account, so "try again" is the wrong advice — "try again later" is.
      // Two failures where the credit is gone or may be, so retrying spends a second one on something the
      // buyer cannot fix. Each gets its own copy, and neither gets a retry button below.
      const notRegistered = e instanceof NameNotRegisteredError
      const unknown = e instanceof NameSettlementUnknownError
      setError(
        e instanceof NameRouteCostTooHighError
          ? t('names.errorRouteCost')
          : notRegistered
            ? t('names.errorNotRegistered')
            : unknown
              ? t('names.errorSettlementUnknown')
              : (e as { message?: string })?.message || t('names.errorGeneric')
      )
      setRetryUnsafe(notRegistered || unknown)
      setPhase('error')
    } finally {
      startedRef.current = false
    }
  }

  /**
   * Not enough credits → buy the chosen pack on Stripe and come back to THIS NAME.
   *
   * Straight out to the hosted checkout, never via /credits: the buyer is mid-purchase, and a detour
   * through the packs page is a second place to abandon. The NAME is stashed first so the credits page's
   * return handler knows where to send them once the grant lands — and it is stashed BEFORE the request,
   * because the redirect can leave the page the moment it resolves.
   */
  async function buyCreditsForName() {
    if (!session || !activePack || topUpBusy) return
    setTopUpBusy(true)
    try {
      /**
       * Claim the hand-off outright: this NAME is the buyer's intent NOW.
       *
       * The credits page claims the three keys in a fixed order — cart, then item, then NAME — so a cart or
       * item hand-off left behind by an earlier abandoned top-up would win over this one. Both of those
       * resume by CHARGING without asking again, so the credits bought here would be spent on a basket the
       * buyer had already walked away from, and the NAME would never be bought at all.
       */
      sessionStorage.removeItem(RESUME_CART_KEY)
      sessionStorage.removeItem(RESUME_BUY_KEY)
      sessionStorage.setItem(RESUME_NAME_KEY, name)
    } catch {
      /* private mode: resume just won't auto-trigger; the credits still land */
    }
    try {
      const cs = await createPackCheckout(activePack.id, { address: session.address, identity: session.identity })
      if (cs.url) {
        window.location.href = cs.url // Stripe hosted checkout with the pack pre-selected
        return
      }
      /**
       * No hosted URL (mock/dev, Stripe off): hand the order to the credits page the same way Stripe's
       * success_url would, so it polls the grant and resumes this NAME.
       *
       * The order id is what makes the dev rail complete. Landing on a bare `/credits` leaves the page with
       * nothing to poll — it just renders the pack grid — so the top-up finished and the resume silently
       * never fired, which is exactly the dead end this whole screen exists to remove.
       *
       * Guarded rather than trusted: a checkout with neither a redirect URL nor an order id has nothing to
       * hand over, and `?order=undefined` would send the buyer to a page that polls a non-existent order and
       * reports a failure. Raised here so the catch below releases the hand-off and says so plainly — the
       * same shape GetCredits' own consumer uses.
       */
      if (!cs.orderId) throw new Error('Checkout returned neither a redirect url nor an order id')
      navigate(`/credits?order=${encodeURIComponent(cs.orderId)}`)
    } catch (e) {
      captureError(e, { flow: 'name_buy_credits' })
      try {
        sessionStorage.removeItem(RESUME_NAME_KEY)
      } catch {
        /* ignore */
      }
      // Nothing was charged and nothing was reserved, so TRY AGAIN is safe — and lands back on this same
      // screen, since the balance is still short.
      setError(t('buyModal.error.creditsCheckout'))
      setRetryUnsafe(false)
      setPhase('error')
      /**
       * Released ONLY here, never in a `finally`.
       *
       * On the success path this function has already handed the page to Stripe (or to /credits), but the
       * assignment to `window.location.href` does not unmount anything — the browser acts on it a moment
       * later. Clearing the flag there re-enables BUY for that window, and a second click opens a SECOND
       * Checkout Session: not a double charge (only the last URL is navigated to), but an orphan order
       * sitting in Activity and in the reconciler.
       */
      setTopUpBusy(false)
    }
  }

  const showHead = phase !== 'success' && phase !== 'pending'
  const selfCustody = showsWalletConfirmations(session?.providerType)

  /**
   * How many steps this buyer's purchase has, and which one is on screen.
   *
   * Registering a NAME is ONE step — the design draws it as `1/1`, and that is the whole of it for a
   * managed (web2) wallet, which signs without ever prompting its owner. A self-custody wallet has one
   * thing more to do before that step can start, and it is a thing the BUYER does: approve in their
   * wallet. Counting it makes the number honest for them without inventing a step for everyone else.
   *
   * Deliberately not one step per internal phase. `preparing` and `confirming` are ours, not theirs, and a
   * counter that ticks through work the buyer cannot act on is just noise.
   */
  const totalSteps = selfCustody ? 2 : 1
  const awaitingBuyer = selfCustody && (stage === 'preparing' || stage === 'awaiting-confirmation')
  const currentStep = awaitingBuyer ? 1 : totalSteps

  // The step's own name. The wallet prompt is the buyer's to act on; everything past it is the purchase
  // completing, which is what the design says and all it needs to say.
  const processingText = awaitingBuyer ? t('names.confirming') : t('names.completing')

  /**
   * The one thing the step name cannot carry: `registering` is the bridge and the Ethereum mint, and it
   * runs for MINUTES. Left unsaid, a wait going exactly to plan reads as a purchase that hung — which is
   * the bug this screen was opened to fix, and collapsing the phases into one label would bring it back.
   */
  const processingNote = stage === 'registering' ? t('names.processingRegistering') : null

  /**
   * Short on credits → sell them the credits instead of showing a dead end (Figma 2996-434120).
   *
   * DERIVED, not a phase of its own, so the screen follows the balance rather than a decision taken when the
   * modal opened. That is what makes the return trip work: the buyer comes back from Stripe with the money
   * landed, and this flips to the confirm step on its own — no resume state to thread through, and no way to
   * strand someone on a top-up screen they no longer need. `insufficient` is false while the balance is
   * unknown, so a failed read still shows the confirm step and lets the server be the authority.
   */
  const shortOnCredits = phase === 'confirm' && insufficient
  const headTitle =
    phase === 'error' ? t('names.errorTitle') : shortOnCredits ? t('names.buyCreditsTitle') : t('names.buyTitle')

  return (
    <S.Scrim onClick={busy ? undefined : onClose} role="presentation">
      <S.Card role="dialog" aria-modal="true" aria-label={headTitle} onClick={e => e.stopPropagation()}>
        {showHead && (
          <>
            <S.HeadRow>
              <S.Title>{headTitle}</S.Title>
              <S.Close onClick={onClose} disabled={busy} aria-label={t('buyModal.close')}>
                <Icon name="close" />
              </S.Close>
            </S.HeadRow>
            <S.Balance>
              {t('names.myCreditsBalance')} <CurrencyIcon /> {balanceLabel(balance, balanceError)}
            </S.Balance>
            <S.Divider />
          </>
        )}

        {shortOnCredits && (
          <S.NoFunds>
            <M.Warning>
              <WarningTriangleIcon />
              <M.WarningText>
                <b>{t('buyModal.insufficientFunds')}</b> {t('buyModal.warningNeedToBuy')}{' '}
                <b>{t('buyModal.warningCreditsAmount', { count: shortBy })}</b> {t('names.warningToPurchase')}
                {/* The link opens the packs page, so it is an offer to sell credits like any other and goes
                    with them in the iOS web view. The sentence above still states the shortfall. */}
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

            {/* Inside the iOS web view this screen has nothing to sell, so it has to at least say what the
                buyer was trying to buy. Without the row they are left with a bare shortfall and a Cancel
                button — less than the dead end this screen replaced, which at least named the NAME and its
                price. Everywhere else the picker below carries the context and the row would be noise. */}
            {isIapMode() ? (
              <S.NameRow data-testid="name-row-iap">
                <S.Thumb aria-hidden>@</S.Thumb>
                <S.NameMeta>
                  <S.NameText>
                    {name}
                    <span>.dcl.eth</span>
                  </S.NameText>
                  <S.NameSub>{t('names.subtitle')}</S.NameSub>
                </S.NameMeta>
                <S.RowPrice>
                  <CurrencyIcon />
                  {priceLabel}
                </S.RowPrice>
              </S.NameRow>
            ) : null}

            {/* The picker, its total and BUY are the actual sale of credits, so inside the iOS web view none
                of them render — the app sells credits through In-App Purchase. The warning stays, so the
                buyer is told what they are short by and can close; they top up in the app and come back. */}
            {isIapMode() ? null : (
              <>
                <S.Packs data-testid="credit-packs">
                  {packs.map(p => (
                    <S.PackTile
                      key={p.id}
                      type="button"
                      data-testid="credit-pack"
                      data-on={p.id === activePack?.id || undefined}
                      aria-pressed={p.id === activePack?.id}
                      aria-label={t('getCredits.packAria', { amount: formatCredits(p.credits), usd: p.usd })}
                      onClick={() => setSelectedPack(p.id)}
                    >
                      {recommendationCloses && p.id === recommendedPack?.id ? (
                        <S.PackBadge data-testid="pack-recommended" aria-hidden>
                          <Icon name="star-rounded" />
                          {t('getCredits.packBadge')}
                        </S.PackBadge>
                      ) : null}
                      <M.PackIco src={packCoin} alt="" />
                      <M.PackAmount>{formatCredits(p.credits)}</M.PackAmount>
                      <M.PackUsd>(${p.usd.toFixed(2)})</M.PackUsd>
                    </S.PackTile>
                  ))}
                </S.Packs>
                <M.Total>
                  <M.TotalCredits>
                    <M.TotalIco />
                    <span data-testid="topup-total-credits">{formatCredits(activePack?.credits ?? 0)}</span>
                  </M.TotalCredits>
                  <M.TotalUsd>${(activePack?.usd ?? 0).toFixed(2)}</M.TotalUsd>
                </M.Total>
              </>
            )}

            <S.PackCtas>
              <M.Btn data-variant="outline" onClick={onClose}>
                {t('buyModal.cancel')}
              </M.Btn>
              {isIapMode() ? null : (
                <M.Btn
                  data-variant="gradient"
                  data-testid="name-buy-credits"
                  disabled={!session || !activePack || topUpBusy}
                  onClick={() => void buyCreditsForName()}
                >
                  {t('buyModal.buy')}
                </M.Btn>
              )}
            </S.PackCtas>
          </S.NoFunds>
        )}

        {(phase === 'confirm' || phase === 'error') && !shortOnCredits && (
          <>
            <S.NameRow>
              <S.Thumb aria-hidden>@</S.Thumb>
              <S.NameMeta>
                <S.NameText>
                  {name}
                  <span>.dcl.eth</span>
                </S.NameText>
                <S.NameSub>{t('names.subtitle')}</S.NameSub>
              </S.NameMeta>
              <S.RowPrice>
                <CurrencyIcon />
                {priceLabel}
              </S.RowPrice>
            </S.NameRow>

            {phase === 'error' ? (
              <>
                <S.ErrorBox>
                  <Icon name="info" aria-hidden />
                  <span>{error}</span>
                </S.ErrorBox>
                {retryUnsafe ? (
                  <S.PrimaryBtn onClick={onClose}>{t('names.errorSpentDismiss')}</S.PrimaryBtn>
                ) : (
                  <S.PrimaryBtn onClick={() => setPhase('confirm')}>{t('names.tryAgain')}</S.PrimaryBtn>
                )}
              </>
            ) : (
              <>
                <S.Confirm>
                  <S.ConfirmTitle>{t('names.confirmTitle')}</S.ConfirmTitle>
                  <S.ConfirmBody
                    dangerouslySetInnerHTML={{
                      __html: t('names.confirmBody', { name: `<b>@${escapeHtml(name)}</b>` })
                    }}
                  />
                  <S.ReenterRow>
                    <S.ReenterAt aria-hidden>@</S.ReenterAt>
                    <S.ReenterInput
                      value={reentry}
                      onChange={e => setReentry(e.target.value.replace(/[^a-zA-Z0-9]/g, ''))}
                      placeholder="yourname"
                      aria-label={t('names.reenterAria')}
                      autoComplete="off"
                      spellCheck={false}
                      style={{ width: `${Math.max(reentry.length, 'yourname'.length)}ch` }}
                    />
                    <S.ReenterSuffix>.dcl.eth</S.ReenterSuffix>
                  </S.ReenterRow>
                </S.Confirm>
                {blockedReason ? (
                  <S.ErrorBox data-tone="info" data-testid="name-blocked-reason">
                    <Icon name="info" aria-hidden />
                    <span>{blockedReason}</span>
                  </S.ErrorBox>
                ) : null}
                <S.PrimaryBtn
                  onClick={() => void buy()}
                  disabled={!matches || !session || priceUnavailable || insufficient}
                >
                  {t('names.buyCta')}
                </S.PrimaryBtn>
              </>
            )}
          </>
        )}

        {phase === 'completing' && (
          <S.Processing>
            <S.Logo src={loaderLogo} alt="" width={61} height={61} />
            <S.StatusBlock>
              <S.ProcessingText>{processingText}</S.ProcessingText>
              <S.ProgressRow>
                <S.Progress aria-hidden>
                  <span />
                </S.Progress>
                <S.ProgressCount data-testid="name-progress-count">{`${currentStep}/${totalSteps}`}</S.ProgressCount>
              </S.ProgressRow>
              {processingNote ? <S.ProcessingNote>{processingNote}</S.ProcessingNote> : null}
            </S.StatusBlock>
          </S.Processing>
        )}

        {/* Paid, but the NAME is not minted yet. Deliberately NOT the success screen: it must not send the
            buyer to My Items for something that is not there, and it must not offer "assign to avatar" for a
            NAME they do not hold yet. It reassures instead — the money is accounted for and the
            credits-server reconciler settles the reservation against the indexed consumption either way. */}
        {phase === 'pending' && (
          <>
            <S.HeadRow>
              <S.Title>{t('names.pendingHeaderTitle')}</S.Title>
              <S.Close onClick={onClose} aria-label={t('buyModal.close')}>
                <Icon name="close" />
              </S.Close>
            </S.HeadRow>
            <S.Balance>
              {t('names.myCreditsBalance')} <CurrencyIcon /> {balanceLabel(balance, balanceError)}
            </S.Balance>
            <S.Divider />

            <S.ErrorBox data-tone="info">
              <Icon name="info" aria-hidden />
              <span>
                <b>{t('names.pendingBannerBold')}</b> {t('names.pendingBannerRest')}
              </span>
            </S.ErrorBox>

            <S.NameRow style={{ marginTop: 20 }}>
              <S.Thumb aria-hidden>@</S.Thumb>
              <S.NameMeta>
                <S.NameText>
                  {name}
                  <span>.dcl.eth</span>
                </S.NameText>
                <S.NameSub>{t('names.subtitle')}</S.NameSub>
              </S.NameMeta>
              <S.RowPrice>
                <CurrencyIcon />
                {priceLabel}
              </S.RowPrice>
            </S.NameRow>

            <S.Actions>
              <S.OutlineBtn
                onClick={() => {
                  onClose()
                  navigate('/my-items')
                }}
              >
                {t('names.myItems')}
              </S.OutlineBtn>
            </S.Actions>
          </>
        )}

        {phase === 'success' && (
          <>
            <S.HeadRow>
              <S.Title>{t('names.successHeaderTitle')}</S.Title>
              <S.Close onClick={onClose} aria-label={t('buyModal.close')}>
                <Icon name="close" />
              </S.Close>
            </S.HeadRow>
            <S.Balance>
              {t('names.myCreditsBalance')} <CurrencyIcon /> {balanceLabel(balance, balanceError)}
            </S.Balance>
            <S.Divider />

            <S.SuccessBanner>
              <S.SuccessCheck aria-hidden>
                <Icon name="check" />
              </S.SuccessCheck>
              <S.SuccessText>
                <b>{t('names.successBannerBold')}</b> {t('names.successBannerRest')}
              </S.SuccessText>
            </S.SuccessBanner>

            <S.NameRow style={{ marginTop: 20 }}>
              {/* The NAME as a card, only on this screen: by now it is theirs. */}
              <S.NameTile data-testid="name-success-tile">
                <S.NameTileGlyph src={nameGlyph} alt="" aria-hidden width={47} height={47} />
                <S.NameTileLabel>
                  {/* The canonical name for assistive tech is the one in NameMeta below; this repeat is
                      visual. */}
                  <span aria-hidden>{name}</span>
                  <S.NameTileTick src={nameVerified} alt="" aria-hidden width={14} height={14} />
                </S.NameTileLabel>
              </S.NameTile>
              <S.NameMeta>
                <S.NameText>
                  {name}
                  <span>.dcl.eth</span>
                </S.NameText>
                <S.NameSub>{t('names.subtitle')}</S.NameSub>
              </S.NameMeta>
              {/* Credits, not MANA: it is what was charged, and the header states the credits balance two
                  lines above. (The Figma draws a Polygon mark here — confirmed stale.) */}
              <S.RowPrice>
                <CurrencyIcon />
                {priceLabel}
              </S.RowPrice>
            </S.NameRow>

            <S.Actions>
              <S.OutlineBtn
                onClick={() => {
                  onClose()
                  navigate('/my-items')
                }}
              >
                {t('names.myItems')}
              </S.OutlineBtn>
              <S.RubyBtn href={config.profileUrl} target="_blank" rel="noopener noreferrer">
                {t('names.assignToAvatar')}
              </S.RubyBtn>
            </S.Actions>
          </>
        )}
      </S.Card>
    </S.Scrim>
  )
}

// The confirm copy interpolates the selected name into bold markup; escape it so a name can never
// inject HTML (defence-in-depth — names are already alphanumeric-only).
function escapeHtml(s: string): string {
  return s.replace(
    /[&<>"']/g,
    c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string
  )
}

export default NameBuyModal
