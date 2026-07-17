import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { CircularProgress } from 'decentraland-ui2'
import { useWallet } from '~/store/wallet'
import { CurrencyIcon } from '~/components/CurrencyIcon'
import { CURRENCY, formatAmount } from '~/lib/currency'
import { track, errorCode } from '~/lib/analytics'
import { captureError } from '~/lib/monitoring'
import { RESUME_BUY_KEY } from '~/lib/resume-buy'
import { RESUME_CART_KEY } from '~/lib/cart-checkout'
import {
  CREDIT_PACKS,
  createPackCheckout,
  pollCreditGrant,
  isMockPayments,
  type CheckoutSession,
  type CreditPack
} from '~/lib/payments'

// Live Stripe when real payments are configured; otherwise the built-in mock (dev). Single source of
// truth via isMockPayments() (which gates on the publishable key) — don't reimplement the gate here.
const CREDITS_PROVIDER = isMockPayments() ? 'mock' : 'stripe'

type Phase = 'select' | 'paying' | 'processing' | 'success' | 'error' | 'pending'

function friendlyError(e: unknown): string {
  const err = e as { message?: string; name?: string }
  if (err?.name === 'AbortError') return 'You cancelled the request.'
  const msg = (err?.message ?? '').toLowerCase()
  if (msg.includes('sign in')) return `Sign in to get ${CURRENCY.name}.`
  if (msg.includes('timed out')) return `This is taking longer than usual — your ${CURRENCY.name} will appear shortly.`
  return "Couldn't complete your purchase — please try again."
}

export function GetCredits() {
  const navigate = useNavigate()
  const { session, signIn } = useWallet()
  const qc = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()

  const [phase, setPhase] = useState<Phase>('select')
  const [selected, setSelected] = useState<CreditPack | null>(null)
  const [checkout, setCheckout] = useState<CheckoutSession | null>(null)
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
  // Used by both the mock card form (onPaid) and the Stripe hosted-Checkout return handler.
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
              const pendingItem = JSON.parse(pending)
              const seg = pendingItem?.tokenId ?? pendingItem?.itemId
              if (pendingItem?.contractAddress && seg) {
                navigate(`/item/${pendingItem.contractAddress}/${seg}`, {
                  state: { item: pendingItem, resumeBuy: true },
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
          setError(result.error ?? `Couldn't add your ${CURRENCY.name} — please try again.`)
          setPhase('error')
        }
      } catch (e) {
        captureError(e, { flow: 'get_credits', step: 'grant', order_id: orderId })
        track('Shop Buy Credits Failed', { step: 'grant', error_code: errorCode(e), pack_usd: selected?.usd ?? null })
        setError(friendlyError(e))
        setPhase('error')
      }
    },
    [selected, session, qc]
  )

  const startCheckout = useCallback(
    async (pack: CreditPack) => {
      if (!session) {
        signIn()
        return
      }
      setError(null)
      setCanceledNote(false)
      setSelected(pack)
      setPhase('paying')
      track('Shop Started Buy Credits', { pack_usd: pack.usd, credits: pack.credits, provider: CREDITS_PROVIDER })
      try {
        const cs = await createPackCheckout(pack.id, { address: session.address, identity: session.identity })
        if (cs.mock) {
          // Mock path stays in-app: render the demo card form (PayStep).
          setCheckout(cs)
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
    [session, signIn]
  )

  // Card charge succeeded (mock path) → wait for the backend to grant the credits.
  const onPaid = useCallback(() => {
    if (!checkout) return
    void pollForGrant(checkout.orderId)
  }, [checkout, pollForGrant])

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
    setCheckout(null)
    setGranted(null)
    setError(null)
    setCanceledNote(false)
  }

  return (
    <div className="getcredits">
      <header className="getcredits__head">
        <h1 className="getcredits__title">Get {CURRENCY.name}</h1>
        <p className="muted">Add {CURRENCY.name} to your account to shop. Pay with any card.</p>
      </header>

      {!session ? (
        <div className="getcredits__status" role="status">
          <p className="getcredits__status-title">Sign in to get {CURRENCY.name}</p>
          <p className="muted">Connect your account to buy {CURRENCY.name} and start shopping.</p>
          <div className="getcredits__status-actions">
            <button className="btn btn--purple" onClick={signIn}>
              Sign in
            </button>
          </div>
        </div>
      ) : (
        <>
          {phase === 'select' && (
            <>
              {canceledNote && (
                <p className="getcredits__note muted" role="status">
                  Payment canceled — no charge was made. Pick a pack whenever you&rsquo;re ready.
                </p>
              )}
              <PackGrid onSelect={pack => void startCheckout(pack)} />
            </>
          )}

          {phase === 'paying' && selected && (
            <PayStep pack={selected} checkout={checkout} onPaid={onPaid} onCancel={reset} />
          )}

          {phase === 'processing' && (
            <div className="getcredits__status" role="status" aria-live="polite">
              <CircularProgress size={40} />
              <p className="getcredits__status-title">Adding your {CURRENCY.name}…</p>
              <p className="muted">Payment received. Just a moment while we top up your balance.</p>
            </div>
          )}

          {phase === 'success' && (
            <div className="getcredits__status getcredits__status--ok" role="status" aria-live="polite">
              <div className="getcredits__confetti" aria-hidden>
                🎉
              </div>
              <p className="getcredits__status-title">You&rsquo;re all set!</p>
              <p className="muted">
                {granted != null ? (
                  <>
                    <strong>
                      <CurrencyIcon className="ccy-mark" /> {granted}
                    </strong>{' '}
                    {CURRENCY.name} added to your account.
                  </>
                ) : (
                  <>Your {CURRENCY.name} are ready.</>
                )}
              </p>
              <div className="getcredits__status-actions">
                <button className="btn" onClick={() => navigate('/cart')}>
                  Back to cart
                </button>
                <button className="btn btn--ghost" onClick={reset}>
                  Get more {CURRENCY.name}
                </button>
              </div>
            </div>
          )}

          {phase === 'pending' && (
            <div className="getcredits__status" role="status" aria-live="polite">
              <p className="getcredits__status-title">Your {CURRENCY.name} are on the way</p>
              <p className="muted">
                Your payment went through. It&rsquo;s taking a little longer than usual to confirm — your balance will
                update automatically as soon as it lands, no need to pay again.
              </p>
              <div className="getcredits__status-actions">
                <button className="btn" onClick={() => navigate('/cart')}>
                  Back to cart
                </button>
                <button className="btn btn--ghost" onClick={reset}>
                  Done
                </button>
              </div>
            </div>
          )}

          {phase === 'error' && (
            <div className="getcredits__status getcredits__status--err" role="alert">
              <p className="getcredits__status-title">Something went wrong</p>
              <p className="error">{error}</p>
              <div className="getcredits__status-actions">
                <button className="btn" onClick={reset}>
                  Try again
                </button>
              </div>
            </div>
          )}
        </>
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
          onClick={() => onSelect(pack)}
          aria-label={`Get ${formatAmount(pack.credits)} for $${pack.usd}`}
        >
          {pack.bestValue && <span className="pack__ribbon">Best value</span>}
          <span className="pack__credits">
            <CurrencyIcon className="pack__credits-ico" />
            {pack.credits}
          </span>
          <span className="pack__label">{CURRENCY.name}</span>
          <span className="pack__price">${pack.usd}</span>
          <span className="pack__cta">Get {CURRENCY.name}</span>
        </button>
      ))}
    </div>
  )
}

function PayStep({
  pack,
  checkout,
  onPaid,
  onCancel
}: {
  pack: CreditPack
  checkout: CheckoutSession | null
  onPaid: () => void
  onCancel: () => void
}) {
  return (
    <div className="pay">
      <div className="pay__summary">
        <button className="link" onClick={onCancel}>
          &larr; Choose a different pack
        </button>
        <div className="pay__summary-row">
          <span>You&rsquo;ll get</span>
          <strong>
            <CurrencyIcon className="ccy-mark" /> {formatAmount(pack.credits)}
          </strong>
        </div>
        <div className="pay__summary-row pay__summary-row--total">
          <span>You pay</span>
          <strong>${pack.usd}</strong>
        </div>
      </div>

      <div className="pay__form">
        {checkout?.mock ? (
          // Mock demo card form (dev / no real Stripe backend). The real path never reaches
          // 'paying' with a checkout — it redirects out to Stripe's hosted Checkout instead —
          // so this step only ever renders the mock form (or the brief pre-redirect spinner).
          <MockCardForm onPaid={onPaid} amountUsd={pack.usd} />
        ) : (
          <div className="getcredits__status" role="status" aria-live="polite">
            <CircularProgress size={32} />
            <p className="muted">Getting the payment form ready…</p>
          </div>
        )}
      </div>
    </div>
  )
}

// Mocked card form — stands in for the Stripe widget so the flow is fully demoable
// with no backend. 4242 4242 4242 4242 is the standard Stripe test card.
function MockCardForm({ onPaid, amountUsd }: { onPaid: () => void; amountUsd: number }) {
  const [number, setNumber] = useState('4242 4242 4242 4242')
  const [busy, setBusy] = useState(false)

  function pay() {
    setBusy(true)
    // Simulate the card being charged, then hand off to the credit-grant polling.
    setTimeout(() => onPaid(), 700)
  }

  return (
    <div className="card-form" aria-label="Payment details">
      <p className="muted small card-form__note">Demo mode — no real charge is made.</p>
      <label className="field">
        <span>Card number</span>
        <input value={number} onChange={e => setNumber(e.target.value)} disabled={busy} inputMode="numeric" />
      </label>
      <div className="card-form__row">
        <label className="field">
          <span>Expiry</span>
          <input defaultValue="12 / 34" disabled={busy} />
        </label>
        <label className="field">
          <span>CVC</span>
          <input defaultValue="123" disabled={busy} inputMode="numeric" />
        </label>
      </div>
      <button className="btn btn--purple card-form__pay" onClick={pay} disabled={busy}>
        {busy ? 'Processing…' : `Pay $${amountUsd}`}
      </button>
    </div>
  )
}

export default GetCredits
