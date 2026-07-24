import { useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useWallet } from '~/store/wallet'
import { fetchUserPurchases, fetchUserCreditOrders, type CreditOrder } from '~/lib/credits'
import { detailRouteFor } from '~/lib/routes'
import { fetchTradeDisplay, fetchAssetDisplay, fetchUserSales } from '~/lib/api'
import { foldOrderLines, type PurchaseOrder, type OrderLineItem } from '~/lib/purchases'
import { buildActivityFeed, filterActivity, type ActivityFilter, type ActivitySale } from '~/lib/activity'
import { useManaRate } from '~/hooks/useManaRate'
import { LoadMore } from '~/components/LoadMore'
import { useInfiniteGrid } from '~/hooks/useInfiniteGrid'
import { CurrencyIcon } from '~/components/CurrencyIcon'
import creditsProduct from '~/assets/credits-product.svg'
import manaSymbol from '~/assets/mana-matic.svg'
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

// MANA wei (1e18) → a compact MANA amount for display (up to 2 decimals, trailing zeros trimmed). Sale
// proceeds are small, so Number precision is fine here.
function formatMana(wei: string): string {
  const n = Number(wei) / 1e18
  return Number.isFinite(n) ? n.toLocaleString('en', { maximumFractionDigits: 2 }) : '0'
}

// "Polygon MANA" hover tooltip that mirrors the marketplace's Mana popup. The bubble is portaled to
// <body> and fixed-positioned under the trigger, so the card's overflow:hidden never clips it (z-index
// alone can't escape an overflow-clip). Hover-only, like the marketplace.
function ManaTooltip({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLSpanElement>(null)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const open = () => {
    const r = ref.current?.getBoundingClientRect()
    if (r) setPos({ top: r.bottom + 8, left: r.left + r.width / 2 })
  }
  return (
    <S.ManaTip ref={ref} onMouseEnter={open} onMouseLeave={() => setPos(null)}>
      {children}
      {pos
        ? createPortal(
            <S.ManaTipBubble style={{ top: pos.top, left: pos.left }} role="tooltip">
              Polygon MANA
            </S.ManaTipBubble>,
            document.body
          )
        : null}
    </S.ManaTip>
  )
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
  const to =
    detailRouteFor({ contractAddress: display?.contractAddress, tokenId: display?.tokenId, itemId: display?.itemId }) ??
    undefined

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
  const to =
    detailRouteFor({ contractAddress: sale.contractAddress, tokenId: sale.tokenId, itemId: sale.itemId }) ?? undefined

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
          {/* Secondary sales settle in MANA and the seller received MANA — show the exact MANA amount
              with the MANA symbol, never credits (they never got credits for a past sale). */}
          <S.Total data-kind="income">
            +{formatMana(sale.manaWei)}{' '}
            <ManaTooltip>
              <S.ManaSymbol src={manaSymbol} alt="MANA" />
            </ManaTooltip>
          </S.Total>
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

// One credit-pack top-up: the buyer paid money and received credits. No item metadata to resolve — a
// self-contained row showing what they got (+credits) and what they paid (USD), mirroring the sale
// card's income treatment.
function CreditPurchaseCard({ order }: { order: CreditOrder }) {
  const usd = `$${(order.usdCents / 100).toFixed(2)}`
  return (
    <S.Card data-testid="credit-order">
      <S.CardHead>
        {/* The "product" bought here is credits themselves — show the credits mark as the thumbnail
            (mirrors item purchases showing the NFT image), not a generic/NFT placeholder. */}
        <S.CreditThumb>
          <img src={creditsProduct} alt="" aria-hidden />
        </S.CreditThumb>
        <S.HeadLeft>
          <S.DateText>{formatDate(order.createdAt)}</S.DateText>
          <S.SubCount>
            {t('activity.creditPurchaseLabel')} · {t('activity.creditPaid', { usd })}
          </S.SubCount>
        </S.HeadLeft>
        <S.HeadRight>
          <S.Pill data-status={order.status}>
            {order.status === 'PENDING' ? t('activity.processing') : t('activity.completed')}
          </S.Pill>
          <S.Total data-kind="income">
            +<CurrencyIcon className="ccy-mark" /> {order.credits}
          </S.Total>
        </S.HeadRight>
      </S.CardHead>
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
  // Credit-pack (top-up) purchases, shown alongside item purchases. NOTE: the credits-server list
  // endpoint isn't live yet (see fetchUserCreditOrders) — this resolves to an empty page until it ships,
  // so no credit rows appear today and nothing is faked.
  const creditOrders = useInfiniteGrid(
    ['credit-orders', session?.address],
    skip => fetchUserCreditOrders(session!.address, session!.identity, { first: PAGE_SIZE, skip }),
    { enabled: purchasesEnabled }
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
      creditOrders: purchasesEnabled ? creditOrders.items : [],
      rate
    }),
    filter
  )

  const isLoading =
    (purchasesEnabled && (purchases.isLoading || creditOrders.isLoading)) || (salesEnabled && sales.isLoading)
  const isFetchingNextPage =
    (purchasesEnabled && (purchases.isFetchingNextPage || creditOrders.isFetchingNextPage)) ||
    (salesEnabled && sales.isFetchingNextPage)
  const hasNextPage =
    (purchasesEnabled && (purchases.hasNextPage || creditOrders.hasNextPage)) || (salesEnabled && sales.hasNextPage)

  function loadMore() {
    if (purchasesEnabled && purchases.hasNextPage) void purchases.fetchNextPage()
    if (purchasesEnabled && creditOrders.hasNextPage) void creditOrders.fetchNextPage()
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
          {Array.from({ length: 5 }).map((_, i) => (
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
              ) : entry.kind === 'credit' ? (
                <CreditPurchaseCard key={entry.id} order={entry.order} />
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
