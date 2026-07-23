import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { CircularProgress } from 'decentraland-ui2'
import { useWallet } from '~/store/wallet'
import { Icon } from '~/components/Icon'
import { CurrencyIcon } from '~/components/CurrencyIcon'
import { CURRENCY, formatAmount } from '~/lib/currency'
import { useSeo } from '~/hooks/useSeo'
import { track, errorCode } from '~/lib/analytics'
import { captureError } from '~/lib/monitoring'
import { t } from '~/intl/i18n'
import { RESUME_BUY_KEY } from '~/lib/resume-buy'
import { RESUME_CART_KEY } from '~/lib/cart-checkout'
import type { CatalogItem } from '~/lib/api'
import packChips from '~/assets/credits/pack-chips.webp'
import creditCoin from '~/assets/credits/credit-coin.webp'
import checkCircle from '~/assets/credits/check-circle.svg'
import loaderLogo from '~/assets/credits/loader-logo.svg'
import { CREDIT_PACKS, createPackCheckout, pollCreditGrant, isMockPayments, type CreditPack } from '~/lib/payments'

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
              navigate('/cart', { state: { resumeCheckout: true } })
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
              const seg = pendingItem.tokenId ?? pendingItem.itemId
              if (pendingItem.contractAddress && seg) {
                navigate(`/item/${pendingItem.contractAddress}/${seg}`, {
                  state: { item: pendingItem, resumeBuy: true }
                })
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
    <div className="getcredits">
      {showHeader && (
        <header className="getcredits__head">
          <h1 className="getcredits__title">{t('getCredits.title', { currency: CURRENCY.name })}</h1>
          <p className="getcredits__sub">
            {t('getCredits.subtitle', { currency: CURRENCY.name })}{' '}
            <a className="getcredits__learn" href={LEARN_MORE_URL} target="_blank" rel="noreferrer">
              {t('getCredits.learnMore')}
              <Icon name="arrow-up-right" className="getcredits__learn-ico" size={13} />
            </a>
          </p>
        </header>
      )}

      {phase === 'select' && (
        <>
          {canceledNote && (
            <p className="getcredits__note muted" role="status">
              {t('getCredits.canceledNote')}
            </p>
          )}
          <PackGrid onSelect={pack => void startCheckout(pack)} />
        </>
      )}

      {phase === 'redirecting' && (
        <div className="getcredits__status" role="status" aria-live="polite">
          <CircularProgress size={32} />
          <p className="muted">{t('getCredits.redirecting')}</p>
        </div>
      )}

      {phase === 'processing' && (
        <div className="gc-processing" role="status" aria-live="polite">
          <img className="gc-processing__logo" src={loaderLogo} alt="" width={61} height={61} />
          <div className="gc-processing__body">
            <p className="gc-processing__title">
              <strong>{t('getCredits.processing')}</strong>…
            </p>
            <div className="gc-progress" aria-hidden>
              <span className="gc-progress__track">
                <span className="gc-progress__fill" />
              </span>
              <span className="gc-progress__count">1/1</span>
            </div>
          </div>
        </div>
      )}

      {phase === 'success' && (
        <div className="gc-success" role="status" aria-live="polite">
          <div className="gc-banner">
            <img className="gc-banner__icon" src={checkCircle} alt="" width={60} height={60} />
            <p className="gc-banner__text">
              <strong>{t('getCredits.successTitle')}</strong> {t('getCredits.successBody', { currency: CURRENCY.name })}
            </p>
          </div>

          {granted != null && (
            <div className="gc-credits">
              <div className="gc-credits__row">
                <img className="gc-credits__coin" src={creditCoin} alt="" width={93} height={93} />
                <p className="gc-credits__text">
                  <CurrencyIcon className="gc-credits__diamond" />
                  <span>
                    <strong className="gc-credits__amount">
                      {t('getCredits.creditsAmount', { credits: granted, currency: CURRENCY.name })}
                    </strong>{' '}
                    <span className="gc-credits__added">{t('getCredits.creditsAdded')}</span>
                  </span>
                </p>
              </div>
            </div>
          )}

          <div className="gc-actions">
            <button className="gc-actions__btn gc-actions__btn--outline" onClick={reset}>
              {t('getCredits.buyMore', { currency: CURRENCY.name })}
            </button>
            <button className="gc-actions__btn gc-actions__btn--solid" onClick={() => navigate('/assets')}>
              {t('getCredits.startShopping')}
            </button>
          </div>
        </div>
      )}

      {phase === 'pending' && (
        <div className="gc-status" role="status" aria-live="polite">
          <p className="gc-status__title">{t('getCredits.pendingTitle', { currency: CURRENCY.name })}</p>
          <p className="muted">{t('getCredits.pendingBody')}</p>
          <div className="gc-status__actions">
            <button className="gc-actions__btn gc-actions__btn--solid" onClick={() => navigate('/assets')}>
              {t('getCredits.startShopping')}
            </button>
            <button className="gc-actions__btn gc-actions__btn--outline" onClick={reset}>
              {t('getCredits.done')}
            </button>
          </div>
        </div>
      )}

      {phase === 'error' && (
        <div className="gc-status gc-status--err" role="alert">
          <p className="gc-status__title">{t('getCredits.errorTitle')}</p>
          <p className="error">{error}</p>
          <div className="gc-status__actions">
            <button className="gc-actions__btn gc-actions__btn--solid" onClick={reset}>
              {t('getCredits.tryAgain')}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function PackGrid({ onSelect }: { onSelect: (pack: CreditPack) => void }) {
  return (
    <div className="packs">
      {CREDIT_PACKS.map(pack => (
        <button
          key={pack.id}
          type="button"
          className={`pack${pack.bestValue ? ' pack--best' : ''}`}
          data-testid="pack"
          onClick={() => onSelect(pack)}
          aria-label={t('getCredits.packAria', { amount: formatAmount(pack.credits), usd: pack.usd })}
        >
          {pack.bestValue && <span className="pack__badge">{t('getCredits.packBadge')}</span>}
          <span className="pack__inner">
            <span className="pack__label">
              {t('getCredits.creditsAmount', { credits: pack.credits, currency: CURRENCY.name })}
            </span>
            <span className="pack__art">
              <img src={PACK_IMAGES[pack.id] ?? packChips} alt="" loading="lazy" />
            </span>
            <span className="pack__cta-wrap">
              <span className="pack__cta">${pack.usd.toFixed(2)}</span>
            </span>
          </span>
        </button>
      ))}
    </div>
  )
}

export default GetCredits
