import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useWallet } from '~/store/wallet'
import { fetchUserPurchases } from '~/lib/credits'
import { fetchTradeDisplay, fetchAssetDisplay, fetchUserSales } from '~/lib/api'
import { foldOrderLines, type PurchaseOrder, type OrderLineItem } from '~/lib/purchases'
import { buildActivityFeed, filterActivity, type ActivityFilter, type ActivitySale } from '~/lib/activity'
import { useManaRate } from '~/hooks/useManaRate'
import { LoadMore } from '~/components/LoadMore'
import { useInfiniteGrid } from '~/hooks/useInfiniteGrid'
import { CurrencyIcon } from '~/components/CurrencyIcon'
import { Icon } from '~/components/Icon'
import { useSeo } from '~/hooks/useSeo'
import { t } from '~/intl/i18n'
import * as S from './Activity.styles'

// Same styling as S.Line, but rendered as a router <Link> (emotion carries the styles onto Link's
// props so `to` type-checks — `as={Link}` only works on polymorphic components like Button).
const LineLink = S.Line.withComponent(Link)

const PAGE_SIZE = 24

const FILTERS: ActivityFilter[] = ['all', 'purchases', 'sales']

function formatDate(ms: number): string {
  try {
    return new Date(ms).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
  } catch {
    return ''
  }
}

// 0x1234…abcd — a compact, non-jargon label for the counterparty's account (web2-first: an "account",
// never a "wallet address").
function shortAccount(address: string): string {
  return address.length > 10 ? `${address.slice(0, 6)}…${address.slice(-4)}` : address
}

// One rendered line of a purchase order. Resolves name + thumbnail from the trade (reads the real
// itemId/tokenId). While a just-purchased item is still being indexed we show a skeleton rather than a
// misleading blank "Item".
function OrderLine({ item }: { item: OrderLineItem }) {
  const { data: display, isLoading } = useQuery({
    queryKey: ['trade-display', item.tradeId],
    queryFn: () => fetchTradeDisplay(item.tradeId!),
    enabled: !!item.tradeId,
    staleTime: 5 * 60_000
  })

  const resolving = !!item.tradeId && isLoading
  const name = display?.name ?? t('activity.itemFallback')
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
        {resolving ? <S.LineNamePlaceholder /> : <S.LineName title={name}>{name}</S.LineName>}
        {item.quantity > 1 ? <S.LineMeta>{t('activity.quantity', { count: item.quantity })}</S.LineMeta> : null}
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
          <S.SubCount>
            {t('activity.purchaseLabel')} · {t('activity.itemCount', { count: itemCount })}
          </S.SubCount>
        </S.HeadLeft>
        <S.HeadRight>
          <S.Pill data-status={order.status}>
            {order.status === 'PENDING' ? t('activity.processing') : t('activity.completed')}
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

// One secondary sale the user made: the sold item + who bought it + what they earned (in indicative
// credits at the current rate). Item metadata is resolved from the contract + token (sales carry no
// tradeId), same fallback behavior as a purchase line.
function SaleCard({ sale }: { sale: ActivitySale }) {
  const { data: display, isLoading } = useQuery({
    queryKey: ['asset-display', sale.contractAddress, sale.tokenId, sale.itemId],
    queryFn: () => fetchAssetDisplay(sale.contractAddress, { tokenId: sale.tokenId, itemId: sale.itemId }),
    enabled: !!sale.contractAddress,
    staleTime: 5 * 60_000
  })

  const name = display?.name ?? t('activity.itemFallback')
  const thumbnail = display?.thumbnail ?? ''
  const seg = sale.tokenId || sale.itemId || ''
  const to = sale.contractAddress && seg ? `/item/${sale.contractAddress}/${seg}` : undefined

  const body = (
    <>
      {isLoading ? (
        <S.ThumbSkeleton />
      ) : (
        <S.Thumb>{thumbnail ? <img src={thumbnail} alt={name} /> : <Icon name="offer" size={20} />}</S.Thumb>
      )}
      <S.LineInfo>
        {isLoading ? <S.LineNamePlaceholder /> : <S.LineName title={name}>{name}</S.LineName>}
        <S.LineMeta>{t('activity.soldTo', { account: shortAccount(sale.counterparty) })}</S.LineMeta>
      </S.LineInfo>
    </>
  )

  return (
    <S.Card data-testid="activity-sale">
      <S.CardHead>
        <S.HeadLeft>
          <S.DateText>{formatDate(sale.createdAt)}</S.DateText>
          <S.SubCount>{t('activity.saleLabel')}</S.SubCount>
        </S.HeadLeft>
        <S.HeadRight>
          <S.Pill data-status="SOLD">{t('activity.sold')}</S.Pill>
          {sale.credits != null ? (
            <S.Total data-kind="income" title={t('activity.approxValue')}>
              +<CurrencyIcon className="ccy-mark" /> {sale.credits}
            </S.Total>
          ) : null}
        </S.HeadRight>
      </S.CardHead>
      <S.Lines>
        {to ? (
          <LineLink to={to} data-link="true">
            {body}
          </LineLink>
        ) : (
          <S.Line>{body}</S.Line>
        )}
      </S.Lines>
    </S.Card>
  )
}

function EmptyState({ filter }: { filter: ActivityFilter }) {
  const copy = {
    all: { icon: 'clock', title: t('activity.emptyAllTitle'), body: t('activity.emptyAllBody') },
    purchases: { icon: 'cart', title: t('activity.emptyPurchasesTitle'), body: t('activity.emptyPurchasesBody') },
    sales: { icon: 'offer', title: t('activity.emptySalesTitle'), body: t('activity.emptySalesBody') }
  }[filter]

  return (
    <S.Empty>
      <Icon name={copy.icon as 'cart'} size={40} color="var(--muted-2)" />
      <S.EmptyTitle>{copy.title}</S.EmptyTitle>
      <p className="muted">{copy.body}</p>
      {filter !== 'sales' ? (
        <S.EmptyCta as={Link} to="/assets" variant="purple">
          {t('notFound.cta')}
        </S.EmptyCta>
      ) : null}
    </S.Empty>
  )
}

export function Activity() {
  useSeo({ title: t('nav.activity'), noindex: true })
  const { session } = useWallet()
  const [filter, setFilter] = useState<ActivityFilter>('all')

  const purchasesEnabled = !!session && filter !== 'sales'
  const salesEnabled = !!session && filter !== 'purchases'

  const purchases = useInfiniteGrid(
    ['purchases', session?.address],
    skip => fetchUserPurchases(session!.address, session!.identity, { all: true, first: PAGE_SIZE, skip }),
    { enabled: purchasesEnabled }
  )
  const sales = useInfiniteGrid(
    ['sales', session?.address],
    skip => fetchUserSales(session!.address, { role: 'seller', first: PAGE_SIZE, skip }),
    { enabled: salesEnabled }
  )

  // The oracle read is only needed to price sales in credits — skip it entirely on the purchases-only
  // view. When it errors/stales the sale rows just omit the amount (credits → null).
  const { data: rate } = useManaRate(salesEnabled)

  if (!session) {
    return (
      <S.Empty>
        <Icon name="clock" size={40} color="var(--muted-2)" />
        <S.EmptyTitle>{t('activity.signInTitle')}</S.EmptyTitle>
        <p className="muted">{t('activity.signInBody')}</p>
      </S.Empty>
    )
  }

  const feed = filterActivity(
    buildActivityFeed({
      purchases: purchasesEnabled ? purchases.items : [],
      sales: salesEnabled ? sales.items : [],
      rate
    }),
    filter
  )

  const isLoading = (purchasesEnabled && purchases.isLoading) || (salesEnabled && sales.isLoading)
  const isFetchingNextPage =
    (purchasesEnabled && purchases.isFetchingNextPage) || (salesEnabled && sales.isFetchingNextPage)
  const hasNextPage = (purchasesEnabled && purchases.hasNextPage) || (salesEnabled && sales.hasNextPage)

  function loadMore() {
    if (purchasesEnabled && purchases.hasNextPage) void purchases.fetchNextPage()
    if (salesEnabled && sales.hasNextPage) void sales.fetchNextPage()
  }

  return (
    <S.Section>
      <S.Head>
        <S.Title>{t('nav.activity')}</S.Title>
      </S.Head>
      <S.Tabs role="tablist" aria-label={t('nav.activity')}>
        {FILTERS.map(f => (
          <S.Tab
            key={f}
            type="button"
            role="tab"
            aria-selected={filter === f}
            data-active={filter === f}
            data-testid={`activity-filter-${f}`}
            onClick={() => setFilter(f)}
          >
            {t(`activity.filter.${f}`)}
          </S.Tab>
        ))}
      </S.Tabs>
      {isLoading ? (
        <S.List>
          {Array.from({ length: 3 }).map((_, i) => (
            <S.CardSkeleton key={i} />
          ))}
        </S.List>
      ) : feed.length === 0 ? (
        <EmptyState filter={filter} />
      ) : (
        <>
          <S.List>
            {feed.map(entry =>
              entry.kind === 'purchase' ? (
                <OrderCard key={entry.id} order={entry.order} />
              ) : (
                <SaleCard key={entry.id} sale={entry.sale} />
              )
            )}
            {isFetchingNextPage ? <S.CardSkeleton /> : null}
          </S.List>
          <LoadMore hasNextPage={hasNextPage} isFetching={isFetchingNextPage} onLoadMore={loadMore} />
        </>
      )}
    </S.Section>
  )
}
