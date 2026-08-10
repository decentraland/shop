import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link, useSearchParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useWallet } from '~/store/wallet'
import {
  fetchUserPurchases,
  fetchUserCreditOrders,
  creditOrderPill,
  resumeCreditOrder,
  type CreditOrder
} from '~/lib/credits'
import { detailRouteFor } from '~/lib/routes'
import { fetchTradeDisplay, fetchAssetDisplay, fetchUserSales, type SaleRecord } from '~/lib/api'
import { foldOrderLines, purchaseOrderPill, type PurchaseOrder, type OrderLineItem } from '~/lib/purchases'
import { buildActivityFeed, filterActivity, type ActivityFilter, type ActivitySale } from '~/lib/activity'
import { indexPayouts, payoutForSale, type SalePayout } from '~/lib/payouts'
import { useManaRate } from '~/hooks/useManaRate'
import { useImportable } from '~/hooks/useImportable'
import { useListingCount } from '~/hooks/useListingCount'
import { LoadMore } from '~/components/LoadMore'
import { useInfiniteGrid } from '~/hooks/useInfiniteGrid'
import { CurrencyIcon } from '~/components/CurrencyIcon'
import { formatCredits } from '~/lib/currency'
import creditsProduct from '~/assets/credits-product.svg'
import manaSymbol from '~/assets/mana-matic.svg'
import nameGlyph from '~/assets/names/name-glyph.svg'
import { Icon } from '~/components/Icon'
import { useSeo } from '~/hooks/useSeo'
import { t } from '~/intl/i18n'
import { toast } from '~/store/toast'
import * as S from './Activity.styles'
import { theme } from '~/styles/theme'

// Same styling as S.Line, but rendered as a router <Link> (emotion carries the styles onto Link's
// props so `to` type-checks — `as={Link}` only works on polymorphic components like Button).
const LineLink = S.Line.withComponent(Link)

// Only loaded once the seller opens it: the tool drags in the migrate modal and the whole listing/
// signing path, which no ordinary visit to the feed has any use for.
const ImportListings = lazy(() => import('~/components/ImportListings').then(m => ({ default: m.ImportListings })))

const PAGE_SIZE = 24

const FILTERS: ActivityFilter[] = ['all', 'purchases', 'sales']

/**
 * The migration tool lives in the URL rather than in local state so the (redirected) /import link, a
 * bookmark and a reload all land on it — the feed is the default for everything else.
 *
 * `?section=listings` is the spelling to hand out: it says what the link opens, which matters because the
 * point of it is pasting it to creators. `?view=migrate` was the original and is still read, so the links
 * already in circulation (and the /import redirect) keep working — reading both costs one comparison,
 * while renaming outright would quietly 'work' by dropping people on the feed instead.
 */
const SECTION_PARAM = 'section'
const LISTINGS_SECTION = 'listings'
const LEGACY_VIEW_PARAM = 'view'
const LEGACY_MIGRATE_VIEW = 'migrate'

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
    <S.ManaTip
      ref={ref}
      tabIndex={0}
      onMouseEnter={open}
      onMouseLeave={() => setPos(null)}
      onFocus={open}
      onBlur={() => setPos(null)}
    >
      {children}
      {pos
        ? createPortal(
            <S.ManaTipBubble style={{ top: pos.top, left: pos.left }} role="tooltip">
              {t('activity.polygonMana')}
            </S.ManaTipBubble>,
            document.body
          )
        : null}
    </S.ManaTip>
  )
}

// One rendered line of a purchase order. Resolves name + thumbnail from whatever identifies what was
// bought: the trade when there is one (it reads the real itemId/tokenId), and the recorded item otherwise.
// The second path is what a CollectionStore mint needs — it has no trade, so resolving only through
// `tradeId` left every mint rendered as a nameless "Item" with no link to its detail page. While a
// just-purchased item is still being indexed we show a skeleton rather than a misleading blank "Item".
function OrderLine({ item }: { item: OrderLineItem }) {
  const byItem = !!item.contractAddress && !!item.itemId
  const resolvable = !!item.tradeId || byItem
  const { data: display, isLoading } = useQuery({
    queryKey: ['order-line-display', item.tradeId, item.contractAddress, item.itemId],
    queryFn: () =>
      item.tradeId
        ? fetchTradeDisplay(item.tradeId)
        : fetchAssetDisplay(item.contractAddress!, { itemId: item.itemId }),
    enabled: resolvable,
    staleTime: 5 * 60_000
  })

  const resolving = resolvable && isLoading
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

/**
 * A NAME registration. Its own component rather than a branch inside OrderLine, because it resolves
 * NOTHING: the intent carries the name itself, and there is no marketplace record to look up — a NAME is
 * not a collection item, and it mints on Ethereum rather than the chain the credit settled on.
 *
 * Not a link either. The detail route builds from a collection contract plus an id, which a NAME has
 * neither of, so there is nowhere for it to point.
 */
function NameOrderLine({ item }: { item: OrderLineItem }) {
  const label = `@${item.registeredName}`

  return (
    <S.Line data-testid="activity-name-line">
      <S.Thumb>
        <img src={nameGlyph} alt="" />
      </S.Thumb>
      <S.LineInfo>
        <S.LineName title={label}>{label}</S.LineName>
        <S.LineMeta>{t('activity.nameRegistration')}</S.LineMeta>
      </S.LineInfo>
      <S.LinePrice>
        <CurrencyIcon className="ccy-mark" /> {item.credits}
      </S.LinePrice>
    </S.Line>
  )
}

function OrderCard({ order }: { order: PurchaseOrder }) {
  const lineItems = foldOrderLines(order.lines)
  const itemCount = lineItems.reduce((n, l) => n + l.quantity, 0)
  const pill = purchaseOrderPill(order.status)
  const pillLabel =
    pill === 'SETTLED' ? t('activity.completed') : pill === 'FAILED' ? t('activity.failed') : t('activity.processing')

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
          <S.Pill data-status={pill}>{pillLabel}</S.Pill>
          <S.Total>
            <CurrencyIcon className="ccy-mark" /> {order.totalCredits}
          </S.Total>
        </S.HeadRight>
      </S.CardHead>
      {/* The pill alone says "Failed" and leaves the obvious question unanswered: where did the credits go.
          Answering it here is the point of showing the row at all — the balance did come back, and a buyer
          who cannot see that said so has no reason to believe it. */}
      {pill === 'FAILED' ? <S.FailedNote>{t('activity.purchaseFailedNote')}</S.FailedNote> : null}
      <S.Lines>
        {lineItems.map(item =>
          item.registeredName ? <NameOrderLine key={item.key} item={item} /> : <OrderLine key={item.key} item={item} />
        )}
      </S.Lines>
    </S.Card>
  )
}

// One item the user bought by paying MANA. It has no credits-server intent behind it (none is created
// when no credits are spent), so this is built from the BUYER side of the on-chain settlement — the only
// record such a purchase leaves. Shows the MANA actually paid, not an indicative credits figure.
function ManaPurchaseCard({ sale }: { sale: SaleRecord }) {
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
        <S.LineMeta>{t('activity.boughtFrom', { account: shortAccount(sale.seller) })}</S.LineMeta>
      </S.LineInfo>
    </>
  )

  return (
    <S.Card data-testid="activity-mana-purchase">
      <S.CardHead>
        <S.HeadLeft>
          <S.DateText>{formatDate(sale.createdAt)}</S.DateText>
          <S.SubCount>{t('activity.paidWithMana')}</S.SubCount>
        </S.HeadLeft>
        <S.HeadRight>
          <S.Pill data-status="SETTLED">{t('activity.completed')}</S.Pill>
          <S.Total>
            {formatMana(sale.manaWei)}{' '}
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

// One secondary sale the user made: the sold item + who bought it + what they earned (in indicative
// credits at the current rate). Item metadata is resolved from the contract + token (sales carry no
// tradeId), same fallback behavior as a purchase line.
function SaleCard({ sale, payout }: { sale: ActivitySale; payout: SalePayout }) {
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
        <S.LineMeta>
          {t('activity.soldTo', { account: shortAccount(sale.counterparty) })}
          {payout.kind === 'pending'
            ? ` · ${t('activity.payoutPendingOn', { date: formatDate(payout.availableAt) })}`
            : ''}
        </S.LineMeta>
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
          <S.Pill data-status={payout.kind === 'pending' ? 'PENDING' : 'SOLD'}>
            {payout.kind === 'pending' ? t('activity.payoutPending') : t('activity.sold')}
          </S.Pill>
          {/* WHAT THE SELLER ACTUALLY RECEIVED, which is no longer one thing. A sale whose proceeds were
              routed to the treasury pays the seller in credits and never sends them MANA, so showing the
              MANA figure there would report income they did not get. Only a sale with no payout row was
              settled directly in MANA — that is the pre-treasury behaviour, unchanged. */}
          {payout.kind === 'direct' ? (
            <S.Total data-kind="income">
              +{formatMana(sale.manaWei)}{' '}
              <ManaTooltip>
                <S.ManaSymbol src={manaSymbol} alt="MANA" />
              </ManaTooltip>
            </S.Total>
          ) : payout.credits !== null ? (
            <S.Total data-kind="income">
              <CurrencyIcon className="ccy-mark" /> +{formatCredits(payout.credits)}
            </S.Total>
          ) : (
            // One transaction, several of this seller's payouts: the state is certain, the per-sale
            // amount is not (see lib/payouts). Saying nothing beats attributing the wrong figure.
            <S.Total data-kind="income">{t('activity.payoutCredited')}</S.Total>
          )}
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
  // The credits-server speaks initiated/processing/crediting/credited/failed — mapped to the pill's own
  // vocabulary in lib/credits, so nothing here compares against a value the server cannot send.
  const pill = creditOrderPill(order.status)
  const pillLabel =
    pill === 'SETTLED'
      ? t('activity.completed')
      : pill === 'FAILED'
        ? t('activity.failed')
        : pill === 'UNFINISHED'
          ? t('activity.unfinished')
          : t('activity.processing')

  const session = useWallet(s => s.session)
  const queryClient = useQueryClient()
  const [resuming, setResuming] = useState(false)
  // Only an unpaid checkout can be picked back up, and only while its hosted session is alive — which
  // the server confirms with Stripe on the click. Rendering the action is therefore a guess; the click
  // is what settles it, and a session that turns out to be dead retires the order there and then.
  const canResume = order.status === 'initiated' && !!session

  // Leaving for Stripe deliberately keeps `resuming` set so the button cannot be pressed twice on the
  // way out. But pressing Back from Stripe is an ordinary thing to do, and bfcache restores this
  // component with its state intact — the button would come back permanently disabled reading
  // "Opening…" until a hard reload. `pageshow` fires on both a normal load and a bfcache restore, so
  // clearing it there covers the return without weakening the guard on the way out.
  useEffect(() => {
    const clear = () => setResuming(false)
    window.addEventListener('pageshow', clear)
    return () => window.removeEventListener('pageshow', clear)
  }, [])

  async function onResume() {
    if (!session || resuming) return
    setResuming(true)
    try {
      const result = await resumeCreditOrder(order.id, session.identity)

      if (result.kind === 'url') {
        // Only ever a Stripe-hosted page. `location.href` will happily run a `javascript:` URL, and
        // this string comes off the wire — the check costs nothing and means a compromised or
        // misbehaving response cannot turn a button in the buyer's history into script execution.
        if (/^https:\/\/([a-z0-9-]+\.)*stripe\.com\//i.test(result.url)) {
          window.location.href = result.url
          return // leave `resuming` set: the page is navigating away — see the pageshow reset below.
        }
        toast.error(t('activity.resumeUnavailable'))
      } else if (result.kind === 'expired') {
        // The checkout died while it sat in the feed. The server has already retired it, so refreshing
        // the list is what tells the buyer — rather than an error about something they cannot act on.
        toast.info(t('activity.resumeExpired'))
        void queryClient.invalidateQueries({ queryKey: ['credit-orders'] })
      } else if (result.kind === 'paid') {
        // They paid and the grant is in flight. Telling this buyer to "start again" would be inviting
        // a second charge for something already bought.
        toast.success(t('activity.resumePaid'))
        void queryClient.invalidateQueries({ queryKey: ['credit-orders'] })
      } else {
        // We could not find out. Say that, and leave the row exactly as it is — the checkout is very
        // possibly still fine and a retry costs the buyer nothing.
        toast.error(t('activity.resumeUnavailable'))
      }
      setResuming(false)
    } catch {
      setResuming(false)
    }
  }

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
          {canResume ? (
            <S.ResumeButton
              type="button"
              onClick={() => void onResume()}
              disabled={resuming}
              data-testid="resume-order"
            >
              {resuming ? t('activity.resuming') : t('activity.resume')}
            </S.ResumeButton>
          ) : null}
          <S.Pill data-status={pill}>{pillLabel}</S.Pill>
          {/* An unfinished checkout has gained the buyer nothing, so it does not get the income
              treatment — a bold green "+50" beside a quiet grey pill still reads as credits received,
              which is the exact misreading this whole change exists to remove. It shows the amount at
              stake, plainly, with no sign. */}
          <S.Total data-kind={pill === 'UNFINISHED' ? undefined : 'income'}>
            {pill === 'UNFINISHED' ? '' : '+'}
            <CurrencyIcon className="ccy-mark" /> {order.credits}
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
      <Icon name={copy.icon as 'cart'} size={40} color={theme.colors.muted2} />
      <S.EmptyTitle>{copy.title}</S.EmptyTitle>
      <S.EmptyBody>{copy.body}</S.EmptyBody>
      {filter !== 'sales' ? (
        <S.EmptyCta as={Link} to="/items" variant="white">
          {t('notFound.cta')}
        </S.EmptyCta>
      ) : null}
    </S.Empty>
  )
}

export function Activity() {
  const { session } = useWallet()
  const [filter, setFilter] = useState<ActivityFilter>('all')
  const [params, setParams] = useSearchParams()
  const migrating =
    params.get(SECTION_PARAM) === LISTINGS_SECTION || params.get(LEGACY_VIEW_PARAM) === LEGACY_MIGRATE_VIEW

  useSeo({ title: migrating ? t('seo.import.title') : t('nav.activity'), noindex: true })

  // How many classic listings this seller could still move. Undefined until known — the badge renders
  // nothing at all until then, so it never flashes in or badges a zero.
  const { count: importCount } = useImportable()
  // …and how many listings they have at all, on either pricing.
  const { count: listingCount } = useListingCount()

  /**
   * The chip is about HAVING listings, not about having migratable ones. Gating it on the migratable count
   * alone hid the section from the seller who had already moved everything — the one person for whom the
   * "you are all set" state was written — and there was no other way into it.
   *
   * ORed rather than swapped: `listingCount` is creator-scoped (the feed takes no seller filter), so it
   * cannot see a resale of someone else's item. Keeping the migratable count in the condition means a
   * reseller cannot lose a chip they have today.
   *
   * The chip also stays put while its own panel is open even once both counts reach zero, so finishing a
   * migration cannot leave the row with no selected chip and the panel orphaned above its own state.
   */
  // BOTH counts, not either: with "at least one known" the chip popped in when the second answer landed,
  // which is the flash the single-count version was written to avoid. They resolve together anyway — both
  // queries gate on the same address.
  const countsKnown = importCount !== undefined && listingCount !== undefined
  const showMigrate = countsKnown && (importCount > 0 || listingCount > 0 || migrating)

  // The feed's four reads are pointless behind the tool, and their skeletons would otherwise decide
  // what the migrate panel is allowed to render.
  const purchasesEnabled = !!session && !migrating && filter !== 'sales'
  const salesEnabled = !!session && !migrating && filter !== 'purchases'

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
  // MANA-paid purchases. The credits-server feed above only knows about credit SPENDS, so a purchase
  // settled entirely in MANA is invisible to it — this reads the buyer side of the chain instead.
  const manaPurchases = useInfiniteGrid(
    ['mana-purchases', session?.address],
    skip => fetchUserSales(session!.address, { role: 'buyer', first: PAGE_SIZE, skip }),
    { enabled: purchasesEnabled }
  )

  // The seller's treasury payouts, for matching against the sale rows. A SEPARATE read from the
  // paginated credit-orders grid above: that one walks pages alongside purchases, and a sale on page 2
  // needs a payout that may live on page 1. One flat read keeps the match independent of scroll.
  //
  // Capped at the endpoint's 200-row maximum. A seller past 200 payouts would see their oldest sales
  // fall back to the direct-MANA display; paging this is the follow-up.
  const { data: payouts } = useQuery({
    queryKey: ['sale-payouts', session?.address],
    queryFn: () => fetchUserCreditOrders(session!.address, session!.identity, { first: 200 }).then(r => r.payouts),
    enabled: salesEnabled,
    staleTime: 60_000
  })
  const payoutIndex = useMemo(() => indexPayouts(payouts), [payouts])

  // The oracle read is only needed to price sales in credits — skip it entirely on the purchases-only
  // view. When it errors/stales the sale rows just omit the amount (credits → null).
  const { data: rate } = useManaRate(salesEnabled)

  if (!session) {
    return (
      <S.Empty>
        <Icon name="clock" size={40} color={theme.colors.muted2} />
        <S.EmptyTitle>{t('activity.signInTitle')}</S.EmptyTitle>
        <S.EmptyBody>{t('activity.signInBody')}</S.EmptyBody>
      </S.Empty>
    )
  }

  const feed = filterActivity(
    buildActivityFeed({
      purchases: purchasesEnabled ? purchases.items : [],
      sales: salesEnabled ? sales.items : [],
      creditOrders: purchasesEnabled ? creditOrders.items : [],
      manaPurchases: purchasesEnabled ? manaPurchases.items : [],
      rate
    }),
    filter
  )

  const isLoading =
    (purchasesEnabled && (purchases.isLoading || creditOrders.isLoading || manaPurchases.isLoading)) ||
    (salesEnabled && sales.isLoading)
  const isFetchingNextPage =
    (purchasesEnabled &&
      (purchases.isFetchingNextPage || creditOrders.isFetchingNextPage || manaPurchases.isFetchingNextPage)) ||
    (salesEnabled && sales.isFetchingNextPage)
  const hasNextPage =
    (purchasesEnabled && (purchases.hasNextPage || creditOrders.hasNextPage || manaPurchases.hasNextPage)) ||
    (salesEnabled && sales.hasNextPage)

  function loadMore() {
    if (purchasesEnabled && purchases.hasNextPage) void purchases.fetchNextPage()
    if (purchasesEnabled && creditOrders.hasNextPage) void creditOrders.fetchNextPage()
    if (purchasesEnabled && manaPurchases.hasNextPage) void manaPurchases.fetchNextPage()
    if (salesEnabled && sales.hasNextPage) void sales.fetchNextPage()
  }

  // `replace` on both: flipping chips is not navigation the back button should have to walk back
  // through, which is also how the filter chips have always behaved.
  function selectFilter(next: ActivityFilter) {
    setFilter(next)
    if (!migrating) return
    const q = new URLSearchParams(params)
    // Clear both spellings, or leaving via a legacy link would keep re-opening the section.
    q.delete(SECTION_PARAM)
    q.delete(LEGACY_VIEW_PARAM)
    setParams(q, { replace: true })
  }
  function openMigrate() {
    const q = new URLSearchParams(params)
    q.set(SECTION_PARAM, LISTINGS_SECTION)
    q.delete(LEGACY_VIEW_PARAM)
    setParams(q, { replace: true })
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
            aria-selected={!migrating && filter === f}
            data-active={!migrating && filter === f}
            data-testid={`activity-filter-${f}`}
            onClick={() => selectFilter(f)}
          >
            {t(`activity.filter.${f}`)}
          </S.Tab>
        ))}
        {showMigrate ? (
          <S.MigrateTab
            type="button"
            role="tab"
            aria-selected={migrating}
            data-active={migrating}
            data-testid="activity-filter-migrate"
            // Spelled out only when there IS a number, so the name never reads as "0 left"; the badge
            // is then hidden from the reader rather than announced twice.
            aria-label={importCount ? t('activity.migrate.chipAria', { count: importCount }) : undefined}
            onClick={openMigrate}
          >
            {t('activity.migrate.chip')}
            {importCount ? (
              <S.MigrateBadge data-testid="activity-migrate-count" aria-hidden>
                {importCount}
              </S.MigrateBadge>
            ) : null}
          </S.MigrateTab>
        ) : null}
      </S.Tabs>
      {migrating ? (
        <Suspense fallback={<S.PanelFallback aria-busy="true" />}>
          <ImportListings />
        </Suspense>
      ) : isLoading ? (
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
              ) : entry.kind === 'mana-purchase' ? (
                <ManaPurchaseCard key={entry.id} sale={entry.sale} />
              ) : (
                <SaleCard key={entry.id} sale={entry.sale} payout={payoutForSale(payoutIndex, entry.sale)} />
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
