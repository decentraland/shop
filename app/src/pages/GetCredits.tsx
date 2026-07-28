import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { CircularProgress } from 'decentraland-ui2'
import { useWallet } from '~/store/wallet'
import { CurrencyIcon } from '~/components/CurrencyIcon'
import { Icon } from '~/components/Icon'
import { CURRENCY, formatAmount } from '~/lib/currency'
import { detailRouteFor } from '~/lib/routes'
import { useSeo } from '~/hooks/useSeo'
import { track, errorCode } from '~/lib/analytics'
import { captureError } from '~/lib/monitoring'
import { t } from '~/intl/i18n'
import { RESUME_BUY_KEY } from '~/lib/resume-buy'
import { RESUME_CART_KEY } from '~/lib/cart-checkout'
import type { CartNavState } from '~/pages/Cart'
import type { CatalogItem } from '~/lib/api'
import packCoins from '~/assets/credits/pack-coins.webp'
import packStacks from '~/assets/credits/pack-stacks.webp'
import packChest from '~/assets/credits/pack-chest.webp'
import creditCoin from '~/assets/credits/credit-coin.webp'
import checkCircle from '~/assets/credits/check-circle.svg'
import loaderLogo from '~/assets/credits/loader-logo.svg'
import { createPackCheckout, pollCreditGrant, isMockPayments, type CreditPack } from '~/lib/payments'
import { useCreditPacks } from '~/hooks/useCreditPacks'
import * as S from './GetCredits.styles'

// Live Stripe when real payments are configured; otherwise the built-in mock (dev). Single source of
// truth via isMockPayments() (which gates on the publishable key) — don't reimplement the gate here.
const CREDITS_PROVIDER = isMockPayments() ? 'mock' : 'stripe'

// Pack artwork (Figma 1654-374650 / 1654-374651 / 1660-376515 / 1654-374653). The art escalates with
// the pack size, so it's keyed by pack id with a positional fallback for a server catalogue we don't
// know the ids of.
const PACK_ART_ORDER = [packCoins, packCoins, packStacks, packChest]
const PACK_ART: Record<string, string> = {
  pack_5: packCoins,
  pack_10: packCoins,
  pack_25: packStacks,
  pack_50: packChest
}

/** The bundled art for a pack — the fallback, and what renders while/if the catalogue has no URL. */
function bundledArtFor(pack: CreditPack, index: number): string {
  return PACK_ART[pack.id] ?? PACK_ART_ORDER[index % PACK_ART_ORDER.length]
}

/**
 * The artwork to draw: the catalogue's URL when the server publishes one, else the bundled asset.
 *
 * The catalogue is the single source of truth now — the same URLs the in-world explorer draws from, so the
 * two surfaces can't drift when the art changes. The bundled copy stays as the fallback on purpose: this
 * page sits on the purchase path and used to render with no network dependency for art at all. Trading
 * that for a remote image with nothing behind it would mean a CDN hiccup shows four empty cards.
 */
function artFor(pack: CreditPack, index: number): string {
  return pack.artUrl ?? bundledArtFor(pack, index)
}

// Where "Get credits and start shopping" points. No credits-specific doc yet — link to the shop docs.
const LEARN_MORE_URL = 'https://docs.decentraland.org'

type Phase = 'select' | 'redirecting' | 'processing' | 'success' | 'error' | 'pending'

function friendlyError(e: unknown): string {
  const err = e as { message?: string; name?: string }
  if (err?.name === 'AbortError') return t('getCredits.errorCanceled')
  const msg = (err?.message ?? '').toLowerCase()
  if (msg.includes('sign in')) return t('getCredits.errorSignIn', { currency: CURRENCY.name })
  if (msg.includes('timed out')) return t('getCredits.errorTimeout', { currency: CURRENCY.name })
  return t('getCredits.errorGeneric')
}

export function GetCredits() {
  useSeo({ title: t('nav.getCredits', { currency: CURRENCY.name }), noindex: true })
  const navigate = useNavigate()
  const { session, signIn } = useWallet()
  const qc = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()
  // Catalogue from the credits-server (single source of truth); falls back to the bundled packs.
  const { packs, isLoading: packsLoading } = useCreditPacks()

  const [phase, setPhase] = useState<Phase>('select')
  const [selected, setSelected] = useState<CreditPack | null>(null)
  const [granted, setGranted] = useState<number | null>(null)

  // The artwork for the pack that was just bought, from the catalogue (credits-server publishes one image
  // per pack). Resolved by MATCHING THE GRANTED COUNT rather than from `selected`, because on the real
  // hosted-redirect return we come back on a fresh page load and `selected` is null — the count is the only
  // thing we still know. Pack credit amounts are distinct, so the match is unambiguous.
  //
  // Falls back to the bundled coin: a top-up whose amount matches no pack, or a catalogue that failed to
  // load, must still render an image rather than a gap.
  const grantedArt = (granted != null ? packs.find(p => p.credits === granted)?.artUrl : undefined) ?? creditCoin
  const [error, setError] = useState<string | null>(null)
  // Gentle "payment canceled" note shown on the pack grid after a cancelled Stripe redirect.
  const [canceledNote, setCanceledNote] = useState(false)

  const abortRef = useRef<AbortController | null>(null)
  useEffect(() => () => abortRef.current?.abort(), [])

  // Drop Stripe's return params so a refresh doesn't re-trigger the return handling below.
  const clearReturnParams = useCallback(() => {
    setSearchParams(
      prev => {
        const next = new URLSearchParams(prev)
        next.delete('order')
        next.delete('canceled')
        return next
      },
      { replace: true }
    )
  }, [setSearchParams])

  // Wait for the backend to grant the credits for an order (poll until it flips off 'processing').
  // Used by both the mock "went to Stripe → came back credited" path and the Stripe hosted-Checkout
  // return handler.
  const pollForGrant = useCallback(
    async (orderId: string) => {
      setPhase('processing')
      const ac = new AbortController()
      abortRef.current = ac
      try {
        const result = await pollCreditGrant(orderId, {
          signal: ac.signal,
          address: session?.address,
          identity: session?.identity
        })
        if (result.status === 'credited') {
          // On the real hosted-redirect return `selected` is null (we came back on a fresh page load),
          // so if the server omits creditsGranted we have no count to show. Never render "0 credits
          // added" to a buyer who WAS charged — fall back to a generic "your credits are ready" success
          // (granted = null) instead, and don't log credits:0 as if it were a real grant amount.
          const creditsGranted = result.creditsGranted ?? selected?.credits ?? 0
          setGranted(creditsGranted > 0 ? creditsGranted : null)
          setPhase('success')
          track('Shop Completed Buy Credits', {
            order_id: orderId,
            pack_usd: selected?.usd ?? null,
            credits: creditsGranted > 0 ? creditsGranted : null,
            provider: CREDITS_PROVIDER
          })
          void qc.invalidateQueries({ queryKey: ['usd-balance'] })
          // If this top-up was started to finish a CART checkout (no-funds → Stripe from the cart's
          // buy modal), route back to the cart, which restores the stashed cart and resumes checkout.
          // The cart consumes RESUME_CART_KEY itself (we only detect + route here).
          try {
            if (sessionStorage.getItem(RESUME_CART_KEY)) {
              // Carry the credits that just landed so the cart's resumed checkout can hand them to the
              // /success page for the combined "credits + items" view (Figma 1231-250927).
              const cartState: CartNavState = {
                resumeCheckout: true,
                ...(creditsGranted > 0 ? { creditsAdded: creditsGranted } : {})
              }
              navigate('/cart', { state: cartState })
              return
            }
          } catch {
            /* ignore — the credits still landed */
          }
          // If this top-up was started to finish an item purchase (no-funds → Stripe from the buy
          // modal), resume that buy now that the credits landed: hand off to the item page in resume
          // mode so it completes with the new balance.
          try {
            const pending = sessionStorage.getItem(RESUME_BUY_KEY)
            if (pending) {
              sessionStorage.removeItem(RESUME_BUY_KEY)
              const pendingItem = JSON.parse(pending) as CatalogItem
              const detailPath = detailRouteFor(pendingItem)
              if (detailPath) {
                navigate(detailPath, { state: { item: pendingItem, resumeBuy: true } })
                return
              }
            }
          } catch {
            /* ignore a malformed resume payload — the credits still landed */
          }
        } else if (result.status === 'pending') {
          // Poll timed out but the payment isn't failed — the webhook can still grant the credits.
          // Show an "on the way" state (not an error) and refetch the balance so it updates when it lands.
          track('Shop Buy Credits Pending', { step: 'grant', pack_usd: selected?.usd ?? null })
          void qc.invalidateQueries({ queryKey: ['usd-balance'] })
          setPhase('pending')
        } else {
          track('Shop Buy Credits Failed', {
            step: 'grant',
            error_code: 'grant_failed',
            pack_usd: selected?.usd ?? null
          })
          setError(result.error ?? t('getCredits.errorGrant', { currency: CURRENCY.name }))
          setPhase('error')
        }
      } catch (e) {
        captureError(e, { flow: 'get_credits', step: 'grant', order_id: orderId })
        track('Shop Buy Credits Failed', { step: 'grant', error_code: errorCode(e), pack_usd: selected?.usd ?? null })
        setError(friendlyError(e))
        setPhase('error')
      }
    },
    [selected, session, qc, navigate]
  )

  const startCheckout = useCallback(
    async (pack: CreditPack) => {
      // Always-show-packs: signed-out buyers can browse the packs; clicking one starts sign-in (they
      // land back here to pick again) rather than dropping them into an un-authable Stripe checkout.
      if (!session) {
        signIn()
        return
      }
      setError(null)
      setCanceledNote(false)
      setSelected(pack)
      // No intermediate page: REAL goes straight out to Stripe's hosted Checkout (show a minimal
      // "redirecting" spinner for the brief async window before the redirect leaves the page); MOCK
      // (local dev, no real Stripe) skips the embedded card form and lands straight in the crediting
      // state so it behaves like "went to Stripe → came back credited".
      setPhase(CREDITS_PROVIDER === 'mock' ? 'processing' : 'redirecting')
      track('Shop Started Buy Credits', { pack_usd: pack.usd, credits: pack.credits, provider: CREDITS_PROVIDER })
      try {
        const cs = await createPackCheckout(pack.id, { address: session.address, identity: session.identity })
        if (cs.mock) {
          // Mock path: no card form — hand straight to the credit-grant polling, which mints via
          // /dev/mint-usd and advances to success (the grant count comes from the mock/server result,
          // exactly as it does on the real hosted-redirect return where `selected` is null).
          void pollForGrant(cs.orderId)
        } else if (cs.url) {
          // Real path: full redirect out to Stripe's hosted Checkout. We come back to
          // `${STRIPE_RETURN_URL}?order=${orderId}` (handled by the return effect below).
          // Funnel marker: the buyer actually reached Stripe's page (separates "started" from the
          // drop between clicking a pack and landing on the hosted checkout).
          track('Shop Redirected To Stripe', { order_id: cs.orderId, pack_usd: pack.usd, credits: pack.credits })
          window.location.href = cs.url
        } else {
          throw new Error('Checkout did not return a redirect url')
        }
      } catch (e) {
        captureError(e, { flow: 'get_credits', step: 'checkout', provider: CREDITS_PROVIDER })
        track('Shop Buy Credits Failed', { step: 'checkout', error_code: errorCode(e), pack_usd: pack.usd })
        setError(friendlyError(e))
        setPhase('error')
      }
    },
    [session, signIn, pollForGrant]
  )

  // Return handling: Stripe's hosted Checkout redirects back to this page with `?order=<id>` on
  // success or `?canceled=1` on cancel. Handle it once, then clear the params so a refresh is a no-op.
  const returnHandled = useRef(false)
  useEffect(() => {
    if (returnHandled.current) return
    const orderId = searchParams.get('order')
    const wasCanceled = searchParams.get('canceled') != null

    if (wasCanceled) {
      returnHandled.current = true
      // Buyer abandoned Stripe's hosted checkout (came back via `?canceled=1`). The single biggest
      // drop in a payments funnel — tracked so we can measure hosted-page abandonment.
      track('Shop Buy Credits Cancelled', { order_id: orderId, provider: CREDITS_PROVIDER })
      clearReturnParams()
      setCanceledNote(true)
      setPhase('select')
      return
    }
    if (!orderId) return

    // We're on Stripe's success_url. Show the crediting state right away so the pack grid doesn't
    // flash, but the poll is a signed-fetch that needs the restored wallet identity — wait for it.
    setPhase('processing')
    if (!session) return

    returnHandled.current = true
    clearReturnParams()
    void pollForGrant(orderId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, session])

  function reset() {
    abortRef.current?.abort()
    setPhase('select')
    setSelected(null)
    setGranted(null)
    setError(null)
    setCanceledNote(false)
  }

  return (
    <S.Root>
      {phase === 'select' && (
        <S.Hero data-testid="credits-hero">
          <S.HeroBackdrop aria-hidden />
          <S.HeroInner>
            <S.Head>
              <S.Title>{t('getCredits.title', { currency: CURRENCY.name })}</S.Title>
              <S.SubRow>
                <S.Sub>{t('getCredits.subtitle', { currency: CURRENCY.nameSingular })}</S.Sub>
                <S.Learn href={LEARN_MORE_URL} target="_blank" rel="noreferrer">
                  {t('getCredits.learnMore')}
                  <Icon name="link-out" />
                </S.Learn>
              </S.SubRow>
            </S.Head>

            {canceledNote && <S.Note role="status">{t('getCredits.canceledNote')}</S.Note>}

            <PackGrid packs={packs} loading={packsLoading} onSelect={pack => void startCheckout(pack)} />
          </S.HeroInner>
        </S.Hero>
      )}

      {phase === 'redirecting' && (
        <S.RedirectStatus role="status" aria-live="polite">
          <CircularProgress size={32} />
          <S.Muted>{t('getCredits.redirecting')}</S.Muted>
        </S.RedirectStatus>
      )}

      {phase === 'processing' && (
        <S.Processing role="status" aria-live="polite">
          <S.ProcessingLogo src={loaderLogo} alt="" width={61} height={61} />
          <S.ProcessingBody>
            <S.ProcessingTitle>
              <strong>{t('getCredits.processing')}</strong>…
            </S.ProcessingTitle>
            <S.Progress aria-hidden>
              <S.ProgressTrack>
                <S.ProgressFill />
              </S.ProgressTrack>
              <S.ProgressCount>1/1</S.ProgressCount>
            </S.Progress>
          </S.ProcessingBody>
        </S.Processing>
      )}

      {phase === 'success' && (
        <S.Success role="status" aria-live="polite">
          <S.Banner>
            <S.BannerIcon src={checkCircle} alt="" width={60} height={60} />
            <S.BannerText>
              <strong>{t('getCredits.successTitle')}</strong> {t('getCredits.successBody', { currency: CURRENCY.name })}
            </S.BannerText>
          </S.Banner>

          {granted != null && (
            <S.CreditsPanel>
              <S.CreditsRow>
                <S.CreditsCoin src={grantedArt} alt="" width={93} height={93} />
                <S.CreditsText>
                  <CurrencyIcon />
                  <span>
                    <S.CreditsAmount>
                      {t('getCredits.creditsAmount', { credits: granted, currency: CURRENCY.name })}
                    </S.CreditsAmount>{' '}
                    <S.CreditsAdded>{t('getCredits.creditsAdded')}</S.CreditsAdded>
                  </span>
                </S.CreditsText>
              </S.CreditsRow>
            </S.CreditsPanel>
          )}

          <S.Actions>
            <S.ActionButton data-variant="outline" onClick={reset}>
              {t('getCredits.buyMore', { currency: CURRENCY.name })}
            </S.ActionButton>
            <S.ActionButton onClick={() => navigate('/assets')}>{t('getCredits.startShopping')}</S.ActionButton>
          </S.Actions>
        </S.Success>
      )}

      {phase === 'pending' && (
        <S.StatusPanel role="status" aria-live="polite">
          <S.StatusTitle>{t('getCredits.pendingTitle', { currency: CURRENCY.name })}</S.StatusTitle>
          <S.Muted>{t('getCredits.pendingBody')}</S.Muted>
          <S.StatusActions>
            <S.ActionButton onClick={() => navigate('/assets')}>{t('getCredits.startShopping')}</S.ActionButton>
            <S.ActionButton data-variant="outline" onClick={reset}>
              {t('getCredits.done')}
            </S.ActionButton>
          </S.StatusActions>
        </S.StatusPanel>
      )}

      {phase === 'error' && (
        <S.StatusPanel role="alert">
          <S.StatusTitle data-tone="error">{t('getCredits.errorTitle')}</S.StatusTitle>
          <S.ErrorText>{error}</S.ErrorText>
          <S.StatusActions>
            <S.ActionButton onClick={reset}>{t('getCredits.tryAgain')}</S.ActionButton>
          </S.StatusActions>
        </S.StatusPanel>
      )}
    </S.Root>
  )
}

function PackGrid({
  packs,
  loading,
  onSelect
}: {
  packs: CreditPack[]
  loading: boolean
  onSelect: (pack: CreditPack) => void
}) {
  // Content-shaped skeletons (same card shell as a real pack) while the catalogue loads, so the grid
  // keeps its shape instead of flashing a bare spinner. Four matches the usual pack count.
  if (loading) {
    return (
      <S.Grid aria-busy="true" aria-label={t('getCredits.packsLoading', { currency: CURRENCY.name })}>
        {[0, 1, 2, 3].map(i => (
          <S.PackCard key={i} as="div" data-skeleton="true" data-testid="pack-skeleton" aria-hidden>
            <S.PackTop>
              <S.PackHeading>
                <S.SkAmount />
              </S.PackHeading>
              <S.SkArt />
            </S.PackTop>
            <S.SkPrice />
          </S.PackCard>
        ))}
      </S.Grid>
    )
  }
  return (
    <S.Grid>
      {packs.map((pack, i) => (
        <S.PackCard
          key={pack.id}
          type="button"
          data-testid="pack"
          data-best={pack.bestValue ? 'true' : undefined}
          onClick={() => onSelect(pack)}
          aria-label={t('getCredits.packAria', { amount: formatAmount(pack.credits), usd: pack.usd })}
        >
          {pack.bestValue && (
            <S.PackBadge>
              <Icon name="star-rounded" />
              {t('getCredits.packBadge')}
            </S.PackBadge>
          )}
          <S.PackTop>
            <S.PackHeading>
              <S.PackAmountRow>
                <CurrencyIcon />
                <S.PackAmount>{pack.credits}</S.PackAmount>
              </S.PackAmountRow>
              <S.PackUnit>{t('getCredits.packUnit', { currency: CURRENCY.name })}</S.PackUnit>
            </S.PackHeading>
            <S.PackArt>
              {/* onError is the second half of the fallback: `artFor` picks the remote URL when the
                  catalogue has one, and if that request fails we swap to the bundled asset rather than
                  leave a broken image in a card the buyer is about to click.

                  Guarded by a one-shot flag, NOT by comparing src: `img.src` reads back the resolved
                  ABSOLUTE url while the bundled import is a root-relative path, so that comparison never
                  matches and a bundled asset that also failed would re-assign forever, hammering the
                  network from inside its own error handler. */}
              <img
                src={artFor(pack, i)}
                alt=""
                loading="lazy"
                width={507}
                height={507}
                onError={e => {
                  const img = e.currentTarget
                  if (img.dataset.artFallback) return
                  img.dataset.artFallback = 'done'
                  img.src = bundledArtFor(pack, i)
                }}
              />
            </S.PackArt>
          </S.PackTop>
          <S.PackPrice>${pack.usd.toFixed(2)}</S.PackPrice>
        </S.PackCard>
      ))}
    </S.Grid>
  )
}

export default GetCredits
