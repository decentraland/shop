import { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { CircularProgress } from 'decentraland-ui2'
import { useWallet } from '~/store/wallet'
import {
  CREDIT_PACKS,
  createPackCheckout,
  pollCreditGrant,
  type CheckoutSession,
  type CreditPack
} from '~/lib/payments'

// Lazily loaded so the real Stripe SDK is only pulled in when a live key/backend exists;
// the mock demo path never downloads it.
const RealCheckout = lazy(() => import('~/components/RealCheckout'))

type Phase = 'select' | 'paying' | 'processing' | 'success' | 'error'

function friendlyError(e: unknown): string {
  const err = e as { message?: string; name?: string }
  if (err?.name === 'AbortError') return 'You cancelled the request.'
  const msg = (err?.message ?? '').toLowerCase()
  if (msg.includes('sign in')) return 'Sign in to get credits.'
  if (msg.includes('timed out')) return 'This is taking longer than usual — your credits will appear shortly.'
  return "Couldn't complete your purchase — please try again."
}

export function GetCredits() {
  const navigate = useNavigate()
  const { session, signIn } = useWallet()
  const qc = useQueryClient()

  const [phase, setPhase] = useState<Phase>('select')
  const [selected, setSelected] = useState<CreditPack | null>(null)
  const [checkout, setCheckout] = useState<CheckoutSession | null>(null)
  const [granted, setGranted] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  const abortRef = useRef<AbortController | null>(null)
  useEffect(() => () => abortRef.current?.abort(), [])

  const startCheckout = useCallback(
    async (pack: CreditPack) => {
      if (!session) {
        signIn()
        return
      }
      setError(null)
      setSelected(pack)
      setPhase('paying')
      try {
        const cs = await createPackCheckout(pack.id, { address: session.address, identity: session.identity })
        setCheckout(cs)
      } catch (e) {
        console.error(e)
        setError(friendlyError(e))
        setPhase('error')
      }
    },
    [session, signIn]
  )

  // Card charge succeeded → wait for the backend to grant the credits.
  const onPaid = useCallback(async () => {
    if (!checkout) return
    setPhase('processing')
    const ac = new AbortController()
    abortRef.current = ac
    try {
      const result = await pollCreditGrant(checkout.orderId, {
        signal: ac.signal,
        address: session?.address,
        identity: session?.identity
      })
      if (result.status === 'credited') {
        setGranted(result.creditsGranted ?? selected?.credits ?? 0)
        setPhase('success')
        void qc.invalidateQueries({ queryKey: ['usd-balance'] })
      } else {
        setError(result.error ?? "Couldn't add your credits — please try again.")
        setPhase('error')
      }
    } catch (e) {
      console.error(e)
      setError(friendlyError(e))
      setPhase('error')
    }
  }, [checkout, selected, session, qc])

  function reset() {
    abortRef.current?.abort()
    setPhase('select')
    setSelected(null)
    setCheckout(null)
    setGranted(null)
    setError(null)
  }

  return (
    <div className="getcredits">
      <header className="getcredits__head">
        <h1 className="getcredits__title">Get credits</h1>
        <p className="muted">Add credits to your account to shop. Pay with any card.</p>
      </header>

      {phase === 'select' && <PackGrid onSelect={startCheckout} />}

      {phase === 'paying' && selected && (
        <PayStep pack={selected} checkout={checkout} onPaid={onPaid} onCancel={reset} />
      )}

      {phase === 'processing' && (
        <div className="getcredits__status" role="status" aria-live="polite">
          <CircularProgress size={40} />
          <p className="getcredits__status-title">Adding your credits…</p>
          <p className="muted">Payment received. Just a moment while we top up your balance.</p>
        </div>
      )}

      {phase === 'success' && (
        <div className="getcredits__status getcredits__status--ok" role="status" aria-live="polite">
          <div className="getcredits__confetti" aria-hidden>🎉</div>
          <p className="getcredits__status-title">You&rsquo;re all set!</p>
          <p className="muted">
            <strong>◈ {granted}</strong> credits added to your account.
          </p>
          <div className="getcredits__status-actions">
            <button className="btn" onClick={() => navigate('/cart')}>
              Back to cart
            </button>
            <button className="btn btn--ghost" onClick={reset}>
              Get more credits
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
          aria-label={`Get ${pack.credits} credits for $${pack.usd}`}
        >
          {pack.bestValue && <span className="pack__ribbon">Best value</span>}
          <span className="pack__credits">
            <span className="ico ico-credits pack__credits-ico" aria-hidden />{pack.credits}
          </span>
          <span className="pack__label">credits</span>
          <span className="pack__price">${pack.usd}</span>
          <span className="pack__cta">Get credits</span>
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
          <strong>◈ {pack.credits} credits</strong>
        </div>
        <div className="pay__summary-row pay__summary-row--total">
          <span>You pay</span>
          <strong>${pack.usd}</strong>
        </div>
      </div>

      <div className="pay__form">
        {!checkout ? (
          <div className="getcredits__status" role="status" aria-live="polite">
            <CircularProgress size={32} />
            <p className="muted">Getting the payment form ready…</p>
          </div>
        ) : checkout.mock ? (
          <MockCardForm onPaid={onPaid} amountUsd={pack.usd} />
        ) : (
          // Real Stripe embedded Checkout — mounted only when a live key/backend exists,
          // so the mock path above keeps the bundle free of Stripe at demo time.
          <Suspense
            fallback={
              <div className="getcredits__status" role="status" aria-live="polite">
                <CircularProgress size={32} />
                <p className="muted">Getting the payment form ready…</p>
              </div>
            }
          >
            <RealCheckout clientSecret={checkout.clientSecret} onComplete={onPaid} />
          </Suspense>
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
