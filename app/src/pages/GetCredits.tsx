import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { CircularProgress } from 'decentraland-ui2'
import { useWallet } from '~/store/wallet'
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
import packChips from '~/assets/credits/pack-chips.webp'
import creditCoin from '~/assets/credits/credit-coin.webp'
import checkCircle from '~/assets/credits/check-circle.svg'
import loaderLogo from '~/assets/credits/loader-logo.svg'
import { createPackCheckout, pollCreditGrant, isMockPayments, type CreditPack } from '~/lib/payments'
import { useCreditPacks } from '~/hooks/useCreditPacks'
import * as S from './GetCredits.styles'

// Live Stripe when real payments are configured; otherwise the built-in mock (dev). Single source of
// truth via isMockPayments() (which gates on the publishable key) — don't reimplement the gate here.
const CREDITS_PROVIDER = isMockPayments() ? 'mock' : 'stripe'

// Pack artwork, mapped onto CREDIT_PACKS by id. Placeholder art lifted from Figma (all packs share the
// same chip-stack render today); a per-pack swap is a one-line change here once final art lands.
const PACK_IMAGES: Record<string, string> = {
  pack_5: packChips,
  pack_10: packChips,
  pack_25: packChips,
  pack_50: packChips
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

  const showHeader = phase === 'select'

  return (
    <S.Root>
      {showHeader && (
        <S.Head>
          <S.Title>{t('getCredits.title', { currency: CURRENCY.name })}</S.Title>
          <S.Sub>
            {t('getCredits.subtitle', { currency: CURRENCY.name })}{' '}
            <S.Learn href={LEARN_MORE_URL} target="_blank" rel="noreferrer">
              {t('getCredits.learnMore')}
              <Icon name="arrow-up-right" size={13} />
            </S.Learn>
          </S.Sub>
        </S.Head>
      )}

      {phase === 'select' && (
        <>
          {canceledNote && (
            <S.Note className="muted" role="status">
              {t('getCredits.canceledNote')}
            </S.Note>
          )}
          <PackGrid packs={packs} loading={packsLoading} onSelect={pack => void startCheckout(pack)} />
        </>
      )}

      {phase === 'redirecting' && (
        <S.Redirect role="status" aria-live="polite">
          <CircularProgress size={32} />
          <p className="muted">{t('getCredits.redirecting')}</p>
        </S.Redirect>
      )}

      {phase === 'processing' && (
        <S.Processing role="status" aria-live="polite">
          <S.ProcessingLogo src={loaderLogo} alt="" width={61} height={61} />
          <S.ProcessingBody>
            <S.ProcessingTitle>
              <strong>{t('getCredits.processing')}</strong>…
            </S.ProcessingTitle>
            <S.Progress aria-hidden>
              <S.Track>
                <S.Fill />
              </S.Track>
              <S.Count>1/1</S.Count>
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
            <S.Credits>
              <S.CreditsRow>
                <S.Coin src={creditCoin} alt="" width={93} height={93} />
                <S.CreditsText>
                  <S.Diamond />
                  <span>
                    <S.Amount>{t('getCredits.creditsAmount', { credits: granted, currency: CURRENCY.name })}</S.Amount>{' '}
                    <S.Added>{t('getCredits.creditsAdded')}</S.Added>
                  </span>
                </S.CreditsText>
              </S.CreditsRow>
            </S.Credits>
          )}

          <S.Actions>
            <S.GcBtn data-variant="outline" onClick={reset}>
              {t('getCredits.buyMore', { currency: CURRENCY.name })}
            </S.GcBtn>
            <S.GcBtn data-variant="solid" onClick={() => navigate('/assets')}>
              {t('getCredits.startShopping')}
            </S.GcBtn>
          </S.Actions>
        </S.Success>
      )}

      {phase === 'pending' && (
        <S.Status role="status" aria-live="polite">
          <S.StatusTitle data-title>{t('getCredits.pendingTitle', { currency: CURRENCY.name })}</S.StatusTitle>
          <p className="muted">{t('getCredits.pendingBody')}</p>
          <S.StatusActions>
            <S.GcBtn data-variant="solid" onClick={() => navigate('/assets')}>
              {t('getCredits.startShopping')}
            </S.GcBtn>
            <S.GcBtn data-variant="outline" onClick={reset}>
              {t('getCredits.done')}
            </S.GcBtn>
          </S.StatusActions>
        </S.Status>
      )}

      {phase === 'error' && (
        <S.Status data-err role="alert">
          <S.StatusTitle data-title>{t('getCredits.errorTitle')}</S.StatusTitle>
          <p className="error">{error}</p>
          <S.StatusActions>
            <S.GcBtn data-variant="solid" onClick={reset}>
              {t('getCredits.tryAgain')}
            </S.GcBtn>
          </S.StatusActions>
        </S.Status>
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
  // Content-shaped skeletons (same shimmer as the rest of the app) while the catalogue loads, so the
  // grid keeps its shape instead of flashing a bare spinner. Four matches the usual pack count.
  if (loading) {
    return (
      <S.Packs aria-busy="true" aria-label={t('getCredits.packsLoading', { currency: CURRENCY.name })}>
        {[0, 1, 2, 3].map(i => (
          <S.PackSkeleton key={i} data-testid="pack-skeleton" aria-hidden>
            <S.Inner>
              <S.LabelSk className="skeleton" />
              <S.ArtSk className="skeleton" />
              <S.CtaSk className="skeleton" />
            </S.Inner>
          </S.PackSkeleton>
        ))}
      </S.Packs>
    )
  }
  return (
    <S.Packs>
      {packs.map(pack => (
        <S.Pack
          key={pack.id}
          type="button"
          data-best={pack.bestValue || undefined}
          data-testid="pack"
          onClick={() => onSelect(pack)}
          aria-label={t('getCredits.packAria', { amount: formatAmount(pack.credits), usd: pack.usd })}
        >
          {pack.bestValue && <S.Badge>{t('getCredits.packBadge')}</S.Badge>}
          <S.Inner data-inner>
            <S.Label>{t('getCredits.creditsAmount', { credits: pack.credits, currency: CURRENCY.name })}</S.Label>
            <S.Art>
              <img src={PACK_IMAGES[pack.id] ?? packChips} alt="" loading="lazy" />
            </S.Art>
            <S.CtaWrap>
              <S.Cta data-cta>${pack.usd.toFixed(2)}</S.Cta>
            </S.CtaWrap>
          </S.Inner>
        </S.Pack>
      ))}
    </S.Packs>
  )
}

export default GetCredits
