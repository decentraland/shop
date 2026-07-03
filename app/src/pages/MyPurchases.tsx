import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useWallet } from '~/store/wallet'
import { fetchUserPurchases, type PurchaseRecord } from '~/lib/credits'
import { fetchTradeDisplay } from '~/lib/api'
import { CURRENCY } from '~/lib/currency'

function formatDate(ms: number): string {
  try {
    return new Date(ms).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
  } catch {
    return ''
  }
}

function StatusBadge({ status }: { status: PurchaseRecord['status'] }) {
  if (status === 'PENDING') return <span className="purchase__badge purchase__badge--pending">Processing</span>
  return <span className="purchase__badge purchase__badge--done">Completed</span>
}

function PurchaseRow({ purchase }: { purchase: PurchaseRecord }) {
  const { data: display } = useQuery({
    queryKey: ['trade-display', purchase.tradeId],
    queryFn: () => fetchTradeDisplay(purchase.tradeId!),
    enabled: !!purchase.tradeId,
    staleTime: 5 * 60_000
  })

  const name = display?.name ?? 'Item'
  const thumbnail = display?.thumbnail ?? ''
  const to = display?.contractAddress
    ? `/item/${display.contractAddress}/${display.tokenId ?? display.itemId ?? ''}`
    : undefined

  const body = (
    <>
      <div className="purchase__thumb">{thumbnail ? <img src={thumbnail} alt={name} /> : null}</div>
      <div className="purchase__info">
        <div className="purchase__name" title={name}>{name}</div>
        <div className="muted purchase__date">{formatDate(purchase.createdAt)}</div>
      </div>
      <StatusBadge status={purchase.status} />
      <div className="purchase__price">{CURRENCY.symbol} {purchase.credits}</div>
    </>
  )

  return to ? (
    <Link className="purchase" to={to}>{body}</Link>
  ) : (
    <div className="purchase">{body}</div>
  )
}

export function MyPurchases() {
  const { session } = useWallet()
  const { data, isLoading } = useQuery({
    queryKey: ['purchases', session?.address],
    queryFn: () => fetchUserPurchases(session!.address, session!.identity, { all: true }),
    enabled: !!session
  })

  if (!session) {
    return (
      <div className="purchases-empty">
        <span className="ico ico-cart purchases-empty__ico" aria-hidden />
        <p className="purchases-empty__title">Sign in to see your purchases</p>
        <p className="muted">Your order history shows up here once you sign in.</p>
      </div>
    )
  }

  // Hide released/cancelled (EXPIRED) intents — those never became purchases.
  const purchases = (data ?? []).filter(p => p.status !== 'EXPIRED')

  if (!isLoading && purchases.length === 0) {
    return (
      <div className="purchases-empty">
        <span className="ico ico-cart purchases-empty__ico" aria-hidden />
        <p className="purchases-empty__title">No purchases yet</p>
        <p className="muted">When you buy something it&rsquo;ll appear here.</p>
        <Link className="btn btn--purple" to="/assets">Browse the shop</Link>
      </div>
    )
  }

  return (
    <section className="purchases">
      <div className="purchases__head">
        <h1>My Purchases</h1>
        {!isLoading ? (
          <span className="purchases__count">{purchases.length} order{purchases.length > 1 ? 's' : ''}</span>
        ) : null}
      </div>
      <div className="purchases__list">
        {isLoading
          ? Array.from({ length: 4 }).map((_, i) => <div className="purchase purchase--skeleton" key={i} />)
          : purchases.map(p => <PurchaseRow key={p.id} purchase={p} />)}
      </div>
    </section>
  )
}
