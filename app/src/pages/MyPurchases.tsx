import { Link } from 'react-router-dom'
import { Icon } from '~/components/Icon'
import { useQuery } from '@tanstack/react-query'
import { useWallet } from '~/store/wallet'
import { fetchUserPurchases, type PurchaseRecord } from '~/lib/credits'
import { fetchTradeDisplay } from '~/lib/api'
import { LoadMore } from '~/components/LoadMore'
import { useInfiniteGrid } from '~/hooks/useInfiniteGrid'
import { CurrencyIcon } from '~/components/CurrencyIcon'
import { Button } from '~/components/Button'
import { useSeo } from '~/hooks/useSeo'
import { t } from '~/intl/i18n'
import styled from '@emotion/styled'

const EmptyCta = styled(Button)`
  margin-top: 12px;
`

const PAGE_SIZE = 24

function formatDate(ms: number): string {
  try {
    return new Date(ms).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
  } catch {
    return ''
  }
}

function StatusBadge({ status }: { status: PurchaseRecord['status'] }) {
  if (status === 'PENDING')
    return <span className="purchase__badge purchase__badge--pending">{t('myPurchases.processing')}</span>
  return <span className="purchase__badge purchase__badge--done">{t('myPurchases.completed')}</span>
}

function PurchaseRow({ purchase }: { purchase: PurchaseRecord }) {
  const { data: display } = useQuery({
    queryKey: ['trade-display', purchase.tradeId],
    queryFn: () => fetchTradeDisplay(purchase.tradeId!),
    enabled: !!purchase.tradeId,
    staleTime: 5 * 60_000
  })

  const name = display?.name ?? t('myPurchases.itemFallback')
  const thumbnail = display?.thumbnail ?? ''
  // Only link when we can build a resolvable detail URL: BOTH a contract AND an id segment.
  // Legacy/market purchases often resolve to a contract with no tokenId/itemId — linking those
  // produced a dead `/item/<contract>/` (empty segment) that rendered nothing. No id → plain row.
  const seg = display?.tokenId ?? display?.itemId ?? ''
  const to = display?.contractAddress && seg ? `/item/${display.contractAddress}/${seg}` : undefined

  const body = (
    <>
      <div className="purchase__thumb">{thumbnail ? <img src={thumbnail} alt={name} /> : null}</div>
      <div className="purchase__info">
        <div className="purchase__name" title={name}>
          {name}
        </div>
        <div className="muted purchase__date">{formatDate(purchase.createdAt)}</div>
      </div>
      <StatusBadge status={purchase.status} />
      <div className="purchase__price">
        <CurrencyIcon className="ccy-mark" /> {purchase.credits}
      </div>
    </>
  )

  return to ? (
    <Link className="purchase" to={to}>
      {body}
    </Link>
  ) : (
    <div className="purchase">{body}</div>
  )
}

export function MyPurchases() {
  useSeo({ title: t('nav.myPurchases'), noindex: true })
  const { session } = useWallet()
  const { items, isLoading, hasNextPage, isFetchingNextPage, fetchNextPage } = useInfiniteGrid(
    ['purchases', session?.address],
    skip => fetchUserPurchases(session!.address, session!.identity, { all: true, first: PAGE_SIZE, skip }),
    { enabled: !!session }
  )

  if (!session) {
    return (
      <div className="purchases-empty">
        <Icon name="cart" size={40} color="var(--muted-2)" />
        <p className="purchases-empty__title">{t('myPurchases.signInTitle')}</p>
        <p className="muted">{t('myPurchases.signInBody')}</p>
      </div>
    )
  }

  // Hide released/cancelled (EXPIRED) intents — those never became purchases.
  const purchases = items.filter(p => p.status !== 'EXPIRED')

  if (!isLoading && purchases.length === 0) {
    return (
      <div className="purchases-empty">
        <Icon name="cart" size={40} color="var(--muted-2)" />
        <p className="purchases-empty__title">{t('myPurchases.emptyTitle')}</p>
        <p className="muted">{t('myPurchases.emptyBody')}</p>
        <EmptyCta as={Link} to="/assets" variant="purple">
          {t('notFound.cta')}
        </EmptyCta>
      </div>
    )
  }

  return (
    <section className="purchases">
      <div className="purchases__head">
        <h1>{t('nav.myPurchases')}</h1>
        {!isLoading ? (
          <span className="purchases__count">{t('myPurchases.orderCount', { count: purchases.length })}</span>
        ) : null}
      </div>
      <div className="purchases__list">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => <div className="purchase purchase--skeleton" key={i} />)
        ) : (
          <>
            {purchases.map(p => (
              <PurchaseRow key={p.id} purchase={p} />
            ))}
            {isFetchingNextPage
              ? Array.from({ length: 2 }).map((_, i) => <div className="purchase purchase--skeleton" key={`m-${i}`} />)
              : null}
          </>
        )}
      </div>
      <LoadMore hasNextPage={hasNextPage} isFetching={isFetchingNextPage} onLoadMore={() => void fetchNextPage()} />
    </section>
  )
}
