import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useWallet } from '~/store/wallet'
import { fetchUserPurchases } from '~/lib/credits'
import { fetchTradeDisplay } from '~/lib/api'
import { groupPurchases, foldOrderLines, type PurchaseOrder, type OrderLineItem } from '~/lib/purchases'
import { LoadMore } from '~/components/LoadMore'
import { useInfiniteGrid } from '~/hooks/useInfiniteGrid'
import { CurrencyIcon } from '~/components/CurrencyIcon'
import { Icon } from '~/components/Icon'
import { useSeo } from '~/hooks/useSeo'
import { t } from '~/intl/i18n'
import * as S from './MyPurchases.styles'

// Same styling as S.Line, but rendered as a router <Link> (emotion carries the styles onto Link's
// props so `to` type-checks — `as={Link}` only works on polymorphic components like Button).
const LineLink = S.Line.withComponent(Link)

const PAGE_SIZE = 24

function formatDate(ms: number): string {
  try {
    return new Date(ms).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
  } catch {
    return ''
  }
}

// One rendered line of an order. Resolves name + thumbnail from the trade (fixed: reads the real
// itemId/tokenId now, see lib/api.ts). While the just-purchased item is still being indexed we show a
// skeleton rather than a misleading blank "Item".
function OrderLine({ item }: { item: OrderLineItem }) {
  const { data: display, isLoading } = useQuery({
    queryKey: ['trade-display', item.tradeId],
    queryFn: () => fetchTradeDisplay(item.tradeId!),
    enabled: !!item.tradeId,
    staleTime: 5 * 60_000
  })

  const resolving = !!item.tradeId && isLoading
  const name = display?.name ?? t('myPurchases.itemFallback')
  const thumbnail = display?.thumbnail ?? ''
  // Only link when we can build a resolvable detail URL: BOTH a contract AND an id segment. A missing
  // id would produce a dead `/item/<contract>/` that renders nothing, so those stay plain rows.
  const seg = display?.tokenId ?? display?.itemId ?? ''
  const to = display?.contractAddress && seg ? `/item/${display.contractAddress}/${seg}` : undefined

  const body = (
    <>
      {resolving ? (
        <S.ThumbSkeleton />
      ) : (
        <S.Thumb>{thumbnail ? <img src={thumbnail} alt={name} /> : <Icon name="cart" size={20} />}</S.Thumb>
      )}
      <S.LineInfo>
        {resolving ? (
          <S.LineNamePlaceholder />
        ) : (
          <S.LineName title={name}>{name}</S.LineName>
        )}
        {item.quantity > 1 ? <S.LineMeta>{t('myPurchases.quantity', { count: item.quantity })}</S.LineMeta> : null}
      </S.LineInfo>
      <S.LinePrice>
        <CurrencyIcon className="ccy-mark" /> {item.credits}
      </S.LinePrice>
    </>
  )

  return to ? (
    <LineLink to={to} data-link="true">
      {body}
    </LineLink>
  ) : (
    <S.Line>{body}</S.Line>
  )
}

function OrderCard({ order }: { order: PurchaseOrder }) {
  const lineItems = foldOrderLines(order.lines)
  const itemCount = lineItems.reduce((n, l) => n + l.quantity, 0)

  return (
    <S.Card data-testid="purchase-order">
      <S.CardHead>
        <S.HeadLeft>
          <S.DateText>{formatDate(order.createdAt)}</S.DateText>
          <S.SubCount>{t('myPurchases.itemCount', { count: itemCount })}</S.SubCount>
        </S.HeadLeft>
        <S.HeadRight>
          <S.Pill data-status={order.status}>
            {order.status === 'PENDING' ? t('myPurchases.processing') : t('myPurchases.completed')}
          </S.Pill>
          <S.Total>
            <CurrencyIcon className="ccy-mark" /> {order.totalCredits}
          </S.Total>
        </S.HeadRight>
      </S.CardHead>
      <S.Lines>
        {lineItems.map(item => (
          <OrderLine key={item.key} item={item} />
        ))}
      </S.Lines>
    </S.Card>
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
      <S.Empty>
        <Icon name="cart" size={40} color="var(--muted-2)" />
        <S.EmptyTitle>{t('myPurchases.signInTitle')}</S.EmptyTitle>
        <p className="muted">{t('myPurchases.signInBody')}</p>
      </S.Empty>
    )
  }

  // Hide released/cancelled (EXPIRED) intents — those never became purchases — then fold the remaining
  // per-item records back into one order card per checkout.
  const orders = groupPurchases(items.filter(p => p.status !== 'EXPIRED'))

  if (!isLoading && orders.length === 0) {
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
    <S.Section>
      <S.Head>
        <S.Title>{t('nav.myPurchases')}</S.Title>
        {!isLoading ? <S.Count>{t('myPurchases.orderCount', { count: orders.length })}</S.Count> : null}
      </S.Head>
      <S.List>
        {isLoading ? (
          Array.from({ length: 3 }).map((_, i) => <S.CardSkeleton key={i} />)
        ) : (
          <>
            {orders.map(order => (
              <OrderCard key={order.id} order={order} />
            ))}
            {isFetchingNextPage ? <S.CardSkeleton /> : null}
          </>
        )}
      </S.List>
      <LoadMore hasNextPage={hasNextPage} isFetching={isFetchingNextPage} onLoadMore={() => void fetchNextPage()} />
    </S.Section>
  )
}
