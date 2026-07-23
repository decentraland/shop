import { Link } from 'react-router-dom'
import { Icon } from '~/components/Icon'
import { useQuery } from '@tanstack/react-query'
import { useWallet } from '~/store/wallet'
import { fetchUserPurchases, type PurchaseRecord } from '~/lib/credits'
import { fetchTradeDisplay } from '~/lib/api'
import { LoadMore } from '~/components/LoadMore'
import { useInfiniteGrid } from '~/hooks/useInfiniteGrid'
import { CurrencyIcon } from '~/components/CurrencyIcon'
import { useSeo } from '~/hooks/useSeo'
import { t } from '~/intl/i18n'
import * as S from './MyPurchases.styles'

const PAGE_SIZE = 24

function formatDate(ms: number): string {
  try {
    return new Date(ms).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
  } catch {
    return ''
  }
}

function StatusBadge({ status }: { status: PurchaseRecord['status'] }) {
  if (status === 'PENDING') return <S.Badge data-status="pending">{t('myPurchases.processing')}</S.Badge>
  return <S.Badge data-status="done">{t('myPurchases.completed')}</S.Badge>
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
      <S.Thumb>{thumbnail ? <img src={thumbnail} alt={name} /> : null}</S.Thumb>
      <S.Info>
        <S.Name title={name}>{name}</S.Name>
        <S.Date className="muted">{formatDate(purchase.createdAt)}</S.Date>
      </S.Info>
      <StatusBadge status={purchase.status} />
      <S.Price>
        <CurrencyIcon className="ccy-mark" /> {purchase.credits}
      </S.Price>
    </>
  )

  return to ? <S.Row to={to}>{body}</S.Row> : <S.RowStatic>{body}</S.RowStatic>
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
      <S.Empty>
        <Icon name="cart" size={40} color="var(--muted-2)" />
        <S.EmptyTitle>{t('myPurchases.signInTitle')}</S.EmptyTitle>
        <p className="muted">{t('myPurchases.signInBody')}</p>
      </S.Empty>
    )
  }

  // Hide released/cancelled (EXPIRED) intents — those never became purchases.
  const purchases = items.filter(p => p.status !== 'EXPIRED')

  if (!isLoading && purchases.length === 0) {
    return (
      <S.Empty>
        <Icon name="cart" size={40} color="var(--muted-2)" />
        <S.EmptyTitle>{t('myPurchases.emptyTitle')}</S.EmptyTitle>
        <p className="muted">{t('myPurchases.emptyBody')}</p>
        <S.EmptyCta as={Link} to="/assets" variant="purple">
          {t('notFound.cta')}
        </S.EmptyCta>
      </S.Empty>
    )
  }

  return (
    <S.Root>
      <S.Head>
        <h1>{t('nav.myPurchases')}</h1>
        {!isLoading ? <S.Count>{t('myPurchases.orderCount', { count: purchases.length })}</S.Count> : null}
      </S.Head>
      <S.List>
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => <S.Skeleton key={i} />)
        ) : (
          <>
            {purchases.map(p => (
              <PurchaseRow key={p.id} purchase={p} />
            ))}
            {isFetchingNextPage ? Array.from({ length: 2 }).map((_, i) => <S.Skeleton key={`m-${i}`} />) : null}
          </>
        )}
      </S.List>
      <LoadMore hasNextPage={hasNextPage} isFetching={isFetchingNextPage} onLoadMore={() => void fetchNextPage()} />
    </S.Root>
  )
}
