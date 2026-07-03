import { useMemo } from 'react'
import { loadStripe, type Stripe } from '@stripe/stripe-js'
import { EmbeddedCheckout, EmbeddedCheckoutProvider } from '@stripe/react-stripe-js'
import { config } from '~/config'

// Real Stripe embedded Checkout. Rendered ONLY when a live publishable key + shop-server
// are configured (see payments.ts isMockPayments); otherwise the mock card form is used,
// keeping the demo path from ever needing a live Stripe backend.
//
// The publishable key is created once (loadStripe returns a singleton promise). The
// clientSecret comes from POST /credits/checkout on shop-server (embedded ui_mode).
// onComplete fires when Stripe reports the card charge succeeded — the parent then polls
// the backend for the credit grant (payments.pollCreditGrant).

let stripePromise: Promise<Stripe | null> | null = null
function getStripe(): Promise<Stripe | null> {
  if (!stripePromise) stripePromise = loadStripe(config.stripePublishableKey)
  return stripePromise
}

export function RealCheckout({ clientSecret, onComplete }: { clientSecret: string; onComplete: () => void }) {
  const options = useMemo(() => ({ clientSecret, onComplete }), [clientSecret, onComplete])
  return (
    <div className="stripe-embed">
      <EmbeddedCheckoutProvider stripe={getStripe()} options={options}>
        <EmbeddedCheckout />
      </EmbeddedCheckoutProvider>
    </div>
  )
}

export default RealCheckout
