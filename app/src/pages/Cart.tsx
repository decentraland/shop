import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { Trade } from '@dcl/schemas'
import { useCart } from '~/store/cart'
import { useWallet } from '~/store/wallet'
import { useBalance } from '~/hooks/useBalance'
import { authorizeUsdCredit, cancelUsdIntents, devMintUsd } from '~/lib/credits'
import { fetchTradeForItem, fetchTrade, fetchListings, usdWeiToCents } from '~/lib/api'
import { buyManyWithCredits, type CreditPurchase } from '~/lib/buy'
import { buyManyGasless, waitForSettlement, GaslessUnavailableError } from '~/lib/buy-gasless'
import { gaslessEnabled } from '~/lib/gasless-config'
import { CURRENCY } from '~/lib/currency'
import { CurrencyIcon } from '~/components/CurrencyIcon'
import { track, purchaseItemsProps, errorCode, isUserRejection, creditsToUsd } from '~/lib/analytics'
import { captureError } from '~/lib/monitoring'

function friendlyError(e: unknown): string {
  const err = e as { code?: number; message?: string }
  const msg = (err.message ?? '').toLowerCase()
  if (err.code === 4001 || msg.includes('reject') || msg.includes('denied') || msg.includes('cancel')) {
    return 'You cancelled the request.'
  }
  if (msg.includes('insufficient')) return `You don't have enough ${CURRENCY.name} — get more first.`
  if (msg.includes('no active listing')) return err.message as string
  return "Couldn't complete checkout — please try again."
}

// USD-pegged trade price (USD wei, 1e18 = $1) → cents (rounded up; see usdWeiToCents).
function usdCentsFromTrade(trade: Trade): number {
  return usdWeiToCents((trade.received[0] as { amount?: string }).amount)
}

export function Cart() {
  const items = useCart(s => s.items)
  const remove = useCart(s => s.remove)
  const clear = useCart(s => s.clear)
  const add = useCart(s => s.add)
  const setFittingOpen = useCart(s => s.setFittingOpen)
  const { session } = useWallet()

  // Try-on is only meaningful for wearables (emotes aren't "worn").
  const hasWearable = items.some(i => i.category !== 'emote')

  // Last-minute upsell: more credit-buyable listings not already in the cart.
  const { data: suggested } = useQuery({ queryKey: ['upsell-listings'], queryFn: () => fetchListings({ first: 40 }), staleTime: 60_000 })
  const { data: balance } = useBalance(session)
  const qc = useQueryClient()
  const navigate = useNavigate()

  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const total = items.reduce((sum, i) => sum + i.priceCredits, 0)
  const inCart = new Set(items.map(i => i.id))
  const upsell = (suggested?.items ?? []).filter(i => !inCart.has(i.id)).slice(0, 6)

  async function checkout() {
    if (!session) {
      setError('Sign in to check out.')
      return
    }
    setError(null)
    setBusy(true)
    track('Shop Started Checkout', {
      cart_size: items.length,
      cart_value_credits: total,
      cart_value_usd: creditsToUsd(total),
      has_sufficient_credits: (balance?.credits ?? 0) >= total
    })
    const purchased = items.slice() // snapshot for the success page
    const reservedSalts: string[] = [] // ephemeral credit ids to release if anything below fails
    let step: 'authorize' | 'submit' = 'authorize'
    let usedGasless = false
    try {
      // 1) Resolve each listing + authorize it: the server reserves the dollars and signs a one-time
      //    credit per item. We collect them, then spend them all in a single transaction.
      //    Authorized SEQUENTIALLY on purpose (not Promise.all): each authorize reserves against the
      //    running USD balance, so ordering is what makes the insufficient-credits guard correct —
      //    parallel calls would all read the pre-reservation balance and could over-authorize.
      setStatus('Preparing your order…')
      const purchases: CreditPurchase[] = []
      for (const item of items) {
        // Secondary listings carry their tradeId directly; catalog items resolve by itemId.
        const trade = item.tradeId
          ? await fetchTrade(item.tradeId)
          : await fetchTradeForItem(item.contractAddress, item.itemId ?? '')
        if (!trade) throw new Error(`No active listing for ${item.name}.`)

        const usdCents = usdCentsFromTrade(trade)
        const { credit, maxCreditedValue } = await authorizeUsdCredit(session.identity, usdCents, item.tradeId)
        reservedSalts.push(credit.id)
        purchases.push({ trade, credits: [credit], maxCreditedValue })
      }

      // 2) One confirmation: spend every credit via a single useCredits(accept([...])). When gasless
      //    is on, the buyer confirms off-chain and a relayer covers the fee (auto-fallback if down).
      setStatus('Confirming your purchase…')
      step = 'submit'
      let hashes: string[] = []
      if (gaslessEnabled()) {
        try {
          hashes = await buyManyGasless({ purchases, buyer: session.address, signer: session.signer })
          await Promise.all(hashes.map(h => waitForSettlement(h)))
          usedGasless = true
        } catch (gaslessErr) {
          if (!(gaslessErr instanceof GaslessUnavailableError)) throw gaslessErr
          hashes = await buyManyWithCredits({ purchases, buyer: session.address, signer: session.signer })
        }
      } else {
        hashes = await buyManyWithCredits({ purchases, buyer: session.address, signer: session.signer })
      }

      clear()
      setStatus('Purchased! 🎉')
      track('Shop Completed Purchase', {
        ...purchaseItemsProps(purchased),
        payment_type: 'credits',
        no_crypto_step: usedGasless,
        transaction_hash: hashes[0] ?? null
      })
      void qc.invalidateQueries({ queryKey: ['usd-balance'] })
      navigate('/success', { state: { items: purchased, txHash: hashes[0] } })
    } catch (e) {
      if (!isUserRejection(e)) captureError(e, { flow: 'cart_checkout', step, cart_size: items.length })
      track(isUserRejection(e) ? 'Shop Purchase Cancelled' : 'Shop Purchase Failed', {
        step,
        error_code: errorCode(e),
        value_usd: creditsToUsd(total),
        cart_size: items.length
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
      setError(friendlyError(e))
      setStatus(null)
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

  if (items.length === 0) {
    return (
      <div className="cart cart--empty">
        <span className="ico ico-cart cart-empty__ico" aria-hidden />
        <p className="cart-empty__title">Your cart is empty</p>
        <p className="muted">Find something you love and it&rsquo;ll show up here.</p>
        <Link className="btn btn--purple" to="/assets">Browse Collectibles</Link>
      </div>
    )
  }

  return (
    <div className="cart">
      <h1>Cart ({items.length})</h1>

      <div className="cart__list">
        {items.map(item => (
          <div className="cart__row" key={item.id}>
            <div className="cart__thumb">{item.thumbnail ? <img src={item.thumbnail} alt={item.name} /> : null}</div>
            <div className="cart__info">
              <div className="cart__name">{item.name}</div>
              <div className="muted">{item.creator ? `By ${item.creator}` : ''}</div>
            </div>
            <div className="cart__price"><CurrencyIcon className="ccy-mark" /> {item.priceCredits}</div>
            <button className="link" onClick={() => remove(item.id)} disabled={busy}>Remove</button>
          </div>
        ))}
      </div>

      <div className="cart__foot">
        <div className="cart__total">
          <div>Total <strong><CurrencyIcon className="ccy-mark" /> {total}</strong></div>
          {session ? <div className="muted cart__balance">Your balance: <CurrencyIcon className="ccy-mark" /> {balance?.credits ?? 0}</div> : null}
        </div>
        <div className="cart__actions">
          {hasWearable ? (
            <button className="btn btn--ghost" onClick={() => setFittingOpen(true)} disabled={busy}>Try on outfit</button>
          ) : null}
          <Link className="btn btn--ghost" to="/credits">Get {CURRENCY.name}</Link>
          {import.meta.env.DEV ? (
            <button className="btn btn--ghost" onClick={getTestCredits} disabled={busy || !session}>Get test {CURRENCY.name} (dev)</button>
          ) : null}
          <button className="btn btn--ghost" onClick={clear} disabled={busy}>Clear</button>
          <button className="btn btn--purple" onClick={checkout} disabled={busy}>Checkout</button>
        </div>
      </div>

      {status ? <p className="muted" style={{ marginTop: 12 }}>{status}</p> : null}
      {error ? <p className="error" style={{ marginTop: 12 }}>{error}</p> : null}

      {upsell.length > 0 ? (
        <div className="cart-upsell">
          <h2 className="cart-upsell__title">You might also like</h2>
          <div className="cart-upsell__row">
            {upsell.map(i => (
              <div className="cart-upsell__card" key={i.id}>
                <div className="cart-upsell__thumb">{i.thumbnail ? <img src={i.thumbnail} alt={i.name} /> : null}</div>
                <div className="cart-upsell__name" title={i.name}>{i.name}</div>
                <div className="cart-upsell__price"><CurrencyIcon className="ccy-mark" /> {i.priceCredits}</div>
                <button className="btn btn--sm cart-upsell__add" onClick={() => add(i, 'upsell')} disabled={busy}>
                  Add
                </button>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  )
}
