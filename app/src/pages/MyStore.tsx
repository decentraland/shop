import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from 'react'
import { Link, Navigate, useHref, useSearchParams } from 'react-router-dom'
import type { Session } from '~/lib/auth'
import { useWallet } from '~/store/wallet'
import { useSeo } from '~/hooks/useSeo'
import { useStoreStats, type StoreCollection, type StoreItem } from '~/hooks/useStoreStats'
import { RANGE_KEYS, resolveRange, type RangeKey, type ResolvedRange, type StoreRange } from '~/lib/storeRange'
import { StoreSalesPanel } from '~/components/StoreSalesPanel'
import { useCreatorSales } from '~/hooks/useCreatorSales'
import { isSaleCapped, liveSaleStatus, type CreatorSale } from '~/lib/coupons'
import { useCreatorSalesEnabled } from '~/hooks/useCreatorSalesEnabled'
import { useMyStoreAccess } from '~/hooks/useMyStoreEnabled'
import { CollectionThumb } from '~/components/CollectionThumb'
import { CreatorSaleModal } from '~/components/CreatorSaleModal'
import { CurrencyMark } from '~/components/CurrencyMark'
import { ManaPricingBanner } from '~/components/ManaPricingBanner'
import { track } from '~/lib/analytics'
import { Price } from '~/components/Price'
import { Tooltip } from '~/components/Tooltip'
import { Icon, type IconName } from '~/components/Icon'
import { Button } from '~/components/Button'
import { ErrorNotice } from '~/components/ErrorNotice'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { IssueModal } from '~/components/IssueModal'
import { CreatorSales } from '~/components/CreatorSales'
import { SortHeader } from '~/components/SortHeader'
import { RewardOwnersModal } from '~/components/RewardOwnersModal'
import { RangePicker, type RangePickerHandle } from '~/components/RangePicker'
import { nextSort, sortRows, type ColumnSort, type SortDir } from '~/lib/tableSort'
import { pageWindow } from '~/lib/pageWindow'
import { fetchTopOwners, TopOwnersReadError, TopOwnersUnavailableError, type TopOwnersSort } from '~/lib/owners'
import { captureError } from '~/lib/monitoring'
import {
  fetchManaUsdRates,
  formatUsd,
  rememberCurrency,
  storedCurrency,
  usdBy,
  usdOfSale,
  usdOfWei,
  type RateBook,
  type StoreCurrency
} from '~/lib/manaUsd'
import { rarityColor, rarityDescription, rarityLabel, rarityMedia } from '~/lib/rarity'
import { fetchProfiles, type ProfileAvatar } from '~/lib/profile'
import { useProfile } from '~/hooks/useProfile'
import { fetchRoyalties, fetchSalesPage, weiOf } from '~/lib/sales'
import { bestSellers, deltaOf } from '~/lib/storeMetrics'
import type { Delta } from '~/lib/storeMetrics'
import { config } from '~/config'
import { shortAddress } from '~/lib/address'
import { capitalizeFirst } from '~/lib/text'
import {
  mockBuyers,
  mockTopOwners,
  mockChartRows,
  mockCollectors,
  mockRateBook,
  mockRoyalties,
  mockSaleRows,
  mockSales,
  mockSaleable,
  mockSaves,
  mockStats
} from '~/lib/storeMock'
import { useStore } from '~/hooks/useStore'
import { LINK_TYPES, type LinkType } from '~/lib/store'
import { theme } from '~/styles/theme'
import { activeLocale, t, tNode } from '~/intl/i18n'
import { EmptyState, EmptyStateCentered } from '~/components/EmptyState'
import signInIllustration from '~/assets/empty/signin-empty.svg'
import * as A from '~/styles/browseLayout.styles'
import * as S from './MyStore.styles'

/** A prolific creator has dozens of collections; the list opens on the ones that sold. */
/**
 * Six, not the whole list, and fewer than it used to be.
 *
 * The list has the full width of the page now rather than a column beside a shorter panel, so nothing is
 * balanced against it and the only question left is how much of a long list belongs above the fold. The
 * rest is one click away underneath.
 */
const COLLECTIONS_SHOWN = 8

/** Rows of the buyers table per page. Five fills the band beside the two figures without dwarfing them. */
const BUYERS_PER_PAGE = 5

const BEST_PER_PAGE = 5

const OWNERS_PER_PAGE = 5
const DISCOUNTS_PER_PAGE = 5

const STORE_TABS = ['overview', 'collections', 'discounts', 'audience'] as const
type StoreTab = (typeof STORE_TABS)[number]

/** A link straight to a tab (`?tab=audience`) opens it; anything else opens the overview. */
function storedTab(raw: string | null): StoreTab {
  return (STORE_TABS as readonly string[]).includes(raw ?? '') ? (raw as StoreTab) : 'overview'
}

const ROYALTIES_PER_PAGE = 5

const EMPTY_RATES: RateBook = new Map()
/** The invented store's rate for figures that are not tied to a day. */
const MOCK_TODAY_RATE = 0.093

const OWNER_COLUMNS: { key: TopOwnersSort; label: string; first: SortDir }[] = [
  { key: 'nfts', label: 'myStore.colOwned', first: 'desc' },
  { key: 'items', label: 'myStore.colItems', first: 'desc' },
  { key: 'collections', label: 'myStore.colCollections', first: 'desc' },
  { key: 'recent', label: 'myStore.colAcquired', first: 'desc' },
  { key: 'spent', label: 'myStore.colSpent', first: 'desc' }
]

type Sort = 'sold' | 'earned' | 'newest' | 'name'
type CollectionColumn = 'name' | 'claimed' | 'earnings' | 'sold'
type BestColumn = 'name' | 'collection' | 'sold' | 'earnings'
type BuyerColumn = 'items' | 'collections' | 'last' | 'spent'
type StoreBuyer = ReturnType<typeof useStoreStats>['trend']['buyers'][number]

const SORT_KEY = 'shop.my-store.sort'
const SORTS: Sort[] = ['sold', 'earned', 'newest', 'name']

/**
 * The order the creator last chose, remembered per browser.
 *
 * A convenience, not state anything depends on: a blocked or cleared store simply opens on the default,
 * which is why every access is wrapped rather than guarded once. Private windows throw on the read itself.
 */
function storedSort(): Sort {
  try {
    const saved = localStorage.getItem(SORT_KEY)
    return SORTS.includes(saved as Sort) ? (saved as Sort) : 'sold'
  } catch {
    return 'sold'
  }
}

function rememberSort(sort: Sort): void {
  try {
    localStorage.setItem(SORT_KEY, sort)
  } catch {
    // A browser that will not store it is not a reason to refuse the sort.
  }
}

function rangeLabel(from: number, to: number): string {
  const sameYear = new Date(from).getFullYear() === new Date(to).getFullYear()
  const start = new Intl.DateTimeFormat(activeLocale(), {
    month: 'short',
    day: 'numeric',
    ...(sameYear ? {} : { year: 'numeric' })
  })
  const end = new Intl.DateTimeFormat(activeLocale(), { month: 'short', day: 'numeric', year: 'numeric' })
  return `${start.format(from)} – ${end.format(to)}`
}

function ariaSort(dir: SortDir | undefined): 'ascending' | 'descending' | undefined {
  return dir === 'asc' ? 'ascending' : dir === 'desc' ? 'descending' : undefined
}

function dirOf<K extends string>(sort: ColumnSort<K> | null, key: K): SortDir | undefined {
  return sort?.key === key ? sort.dir : undefined
}

/** How the collections list is ordered. `newest` only appears when the source dates the items. */
function sortCollections(
  collections: StoreCollection[],
  by: Sort,
  currency: StoreCurrency = 'mana'
): StoreCollection[] {
  const sorted = [...collections]
  if (by === 'name') return sorted.sort((a, b) => a.name.localeCompare(b.name))
  if (by === 'earned') return sortRows(sorted, c => (currency === 'usd' ? c.earningsUsd : c.earningsWei), 'desc')
  if (by === 'newest') return sorted.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))
  return sorted.sort((a, b) => b.sold - a.sold || a.name.localeCompare(b.name))
}

/**
 * An item's page, carrying the environment the current page is reading.
 *
 * A new tab resolves its environment from the hostname, so a link opened from localhost would land on the
 * dev catalogue however the page that produced it was pointed. Passing `env` through keeps the tab on the
 * same data as the row it came from.
 */
function itemHref(contractAddress: string, itemId: string, env: string | null): string {
  return withEnv(`/item/${contractAddress}/${itemId}`, env)
}

function withEnv(path: string, env: string | null): string {
  if (!env) return path
  return `${path}${path.includes('?') ? '&' : '?'}env=${env}`
}

/** Copies that exist without ever having been sold: issued straight to someone. */
function issued(item: StoreItem, lifetimeSold: number | null | undefined): number | null {
  if (lifetimeSold == null) return null
  const gap = item.minted - lifetimeSold
  return gap > 0 ? gap : null
}

/** The social links a store can carry, and the glyph each one wears. Same set the creator page shows. */
const LINK_ICON: Record<LinkType, IconName> = {
  website: 'website',
  twitter: 'x-twitter',
  discord: 'discord',
  facebook: 'facebook'
}

/**
 * Rows per page of the sales table.
 *
 * Five, because the table now shares its row with the best sellers and the two are read side by side; the
 * feed is still paged rather than capped, so all of it is reachable without leaving the page, and "view
 * all" is the way to the full history where it can be filtered.
 */
const SALES_PER_PAGE = 5

/**
 * One pager, used by every table on the page.
 *
 * Arrows rather than the words, which is both what the design draws and what keeps the control the same
 * width in any language; the label they lose is carried on `aria-label` instead.
 */
function Pager({
  page,
  pages,
  onChange,
  name
}: {
  page: number
  pages: number
  onChange: (next: number) => void
  name: string
}) {
  if (pages <= 1) return null
  return (
    <S.Pager aria-label={t('myStore.pagination')}>
      <S.PageBtn
        type="button"
        onClick={() => onChange(Math.max(0, page - 1))}
        disabled={page === 0}
        aria-label={t('myStore.prev')}
        data-testid={`store-${name}-prev`}
      >
        <Icon name="chevron-down" size={16} aria-hidden style={{ transform: 'rotate(90deg)' }} />
      </S.PageBtn>
      {pageWindow(page, pages).map((n, i) =>
        n === 'gap' ? (
          <S.PageGap key={`gap-${i}`}>…</S.PageGap>
        ) : (
          <S.PageNum
            key={n}
            type="button"
            aria-current={n === page ? 'page' : undefined}
            onClick={() => onChange(n)}
            data-testid={`store-${name}-page-${n + 1}`}
          >
            {(n + 1).toLocaleString()}
          </S.PageNum>
        )
      )}
      <S.PageBtn
        type="button"
        onClick={() => onChange(Math.min(pages - 1, page + 1))}
        disabled={page >= pages - 1}
        aria-label={t('myStore.next')}
        data-testid={`store-${name}-next`}
      >
        <Icon name="chevron-down" size={16} aria-hidden style={{ transform: 'rotate(-90deg)' }} />
      </S.PageBtn>
    </S.Pager>
  )
}

/** One page of the seller's sales, and how many there are. */
function useSalesPage(address: string | undefined, range: ResolvedRange, page: number) {
  const { from, to } = range
  const query = useQuery({
    queryKey: ['store-sales-page', address, from ?? null, to, page],
    enabled: !!address,
    // Keeps the previous page on screen while the next one loads, so the table does not blink empty.
    placeholderData: previous => previous,
    queryFn: () => fetchSalesPage({ seller: address, from, to }, { first: SALES_PER_PAGE, skip: page * SALES_PER_PAGE })
  })
  const total = query.data?.total ?? 0
  return { rows: query.data?.rows ?? [], total, pages: Math.ceil(total / SALES_PER_PAGE) }
}

/** Who bought, for the handful of rows on screen — one batched profile read, not one per row. */
function useBuyerNames(addresses: string[]) {
  return useQuery({
    queryKey: ['store-buyers', addresses],
    enabled: addresses.length > 0,
    staleTime: 5 * 60_000,
    queryFn: () => fetchProfiles(addresses)
  })
}

/**
 * Where a buyer or owner opens: the classic Marketplace account, which lists what the account holds. The
 * profile page shows only what is equipped, and what a customer collects is what a creator is looking for.
 */
function accountHref(address: string): string {
  return `${config.marketplaceUrl}/accounts/${address.toLowerCase()}`
}

function buyerName(address: string, profiles?: Map<string, ProfileAvatar>): string {
  const name = profiles?.get(address.toLowerCase())?.name
  return name ? capitalizeFirst(name) : shortAddress(address)
}

/**
 * `?mock=1` — the invented store, for looking at states no real account shows at once. Gated on
 * {@link config.previewHost}: on everywhere but the live Shop and staging. The data is invented, so it
 * shows nobody's store.
 *
 * There is deliberately no way to open ANOTHER creator's store here. Everything on this page can be
 * rebuilt from public feeds, but the page is what makes that effortless — and it includes who bought
 * from the creator and how much each of them spent. A store is its owner's to read.
 */
/** A stand-in for the invented store's modal; never reaches a signature, which the preview cannot make. */
const MOCK_SESSION = { address: '0xmockcreator0000000000000000000000000001', chainId: 80002 } as unknown as Session

function previewMock(raw: string | null): boolean {
  return config.previewHost && raw === '1'
}

/**
 * The creator's cut of a resale.
 *
 * `royaltiesRate` on the Polygon marketplace, read from the live contract (0xa40b…716f) rather than taken
 * from a doc: 25_000 of 1_000_000, i.e. 2.5%. Approximate on purpose — a resale settled through the legacy
 * marketplace splits its fees differently, and the royalty is paid to the item's beneficiary, who is the
 * creator only when nobody set another one.
 */
const ROYALTY_RATE_PPM = 25_000n

function royaltyOf(volumeWei: bigint): bigint {
  return (volumeWei * ROYALTY_RATE_PPM) / 1_000_000n
}

/**
 * Holds a paged table at the tallest height it has reached, so a short last page leaves room below instead of
 * shrinking and pulling the pager up under the pointer. Off for a table that fits on one page; the reset key
 * starts over when what the table lists changes (another period, a different number of pages).
 */
function useStableHeight<T extends HTMLElement>(active: boolean, resetKey: string) {
  const ref = useRef<T>(null)
  const [tallest, setTallest] = useState(0)
  useEffect(() => setTallest(0), [resetKey])
  useLayoutEffect(() => {
    if (!active || !ref.current) return
    const height = ref.current.offsetHeight
    if (height > tallest) setTallest(height)
  })
  return { ref, style: active && tallest > 0 ? { minHeight: tallest } : undefined }
}

/** Which currency the page's amounts are written in; read by every {@link Amount} without threading it through. */
const CurrencyContext = createContext<StoreCurrency>('mana')

/**
 * An amount in MANA, or in dollars when the creator switched to them. Without a dollar figure (a day the
 * server has no rate for, or a total it does not price) it says so with a dash rather than showing MANA
 * under a dollar heading.
 */
function Amount({ wei, usd }: { wei: bigint; usd: number | null | undefined }) {
  const currency = useContext(CurrencyContext)
  if (currency === 'usd') {
    return usd == null ? (
      <span title={t('myStore.noUsd')}>—</span>
    ) : (
      <>
        <S.Dollar aria-hidden>$</S.Dollar>
        {formatUsd(usd, activeLocale())}
      </>
    )
  }
  return (
    <>
      <CurrencyMark kind="mana" />
      {mana(wei)}
    </>
  )
}

/** MANA wei to a readable figure. Two decimals under ten, none above: a creator reads 0.37 and 1,204. */
function mana(wei: bigint): string {
  const whole = Number(wei / 10n ** 14n) / 10_000
  return whole >= 10 ? Math.round(whole).toLocaleString() : whole.toFixed(2)
}

function ago(ms: number): string {
  const mins = Math.max(1, Math.round((Date.now() - ms) / 60_000))
  if (mins < 60) return t('myStore.agoMinutes', { n: mins })
  const hours = Math.round(mins / 60)
  if (hours < 24) return t('myStore.agoHours', { n: hours })
  return t('myStore.agoDays', { n: Math.round(hours / 24) })
}

/**
 * The collection's sales across the window.
 *
 * Drawn to its own peak rather than to a shared scale: these sit one per row and the question each answers
 * is "is this picking up or dying", not "is this bigger than the row above". A flat line is a real answer,
 * so a run of zeroes draws the baseline instead of nothing.
 */
function Sparkline({ series }: { series: number[] }) {
  // SVG ids are document-scoped: one shared id would make every chart on the page use whichever
  // definition the browser resolved first.
  const gradientId = useId()
  const peak = Math.max(...series, 0)
  const step = series.length > 1 ? 92 / (series.length - 1) : 0
  const y = (n: number) => (peak === 0 ? 27 : 27 - (n / peak) * 22)
  const points = series.map((n, i) => `${(2 + i * step).toFixed(1)} ${y(n).toFixed(1)}`)
  const line = points.join(' L ')

  if (peak === 0) {
    return (
      <S.Spark viewBox="0 0 96 30" role="img" aria-label={t('myStore.trendNone')}>
        <path d="M2 27 L94 27" fill="none" stroke={theme.colors.cardLine} strokeWidth="2" strokeLinecap="round" />
      </S.Spark>
    )
  }

  return (
    <S.Spark viewBox="0 0 96 30" role="img" aria-label={t('myStore.trendAria', { n: peak })}>
      <defs>
        <linearGradient id={gradientId} gradientUnits="userSpaceOnUse" x1="78.9" y1="-19.5" x2="35.3" y2="40.4">
          <stop stopColor={theme.colors.dclRed} />
          <stop offset="1" stopColor={theme.colors.flareAmber} />
        </linearGradient>
        <linearGradient id={`${gradientId}-fill`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={theme.colors.dclRed} stopOpacity="0.26" />
          <stop offset="1" stopColor={theme.colors.dclRed} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`M ${line} L 94 29 L 2 29 Z`} fill={`url(#${gradientId}-fill)`} />
      <path
        d={`M ${line}`}
        fill="none"
        stroke={`url(#${gradientId})`}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </S.Spark>
  )
}

function CollectionRow({
  collection,
  discount,
  savesByKey,
  open,
  onToggle,
  onManage,
  onIssue,
  env
}: {
  collection: StoreCollection
  discount: CreatorSale | null
  /** Saves by item key, for the expanded rows. */
  savesByKey: Map<string, number>
  open: boolean
  onToggle: () => void
  onManage: () => void
  /** Absent when no one is signed in to issue as. */
  onIssue?: (item: StoreItem) => void
  env: string | null
}) {
  const panelId = `store-items-${collection.contractAddress}`
  return (
    <>
      <S.CollRow data-testid="store-collection" data-exhausted={collection.exhausted || undefined}>
        <S.Chevron
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          aria-label={t(open ? 'myStore.collapse' : 'myStore.expand', { name: collection.name })}
          onClick={onToggle}
          data-testid="store-collection-toggle"
        >
          <S.ChevronIcon name="chevron-down" className="ico" aria-hidden />
        </S.Chevron>
        <S.Mosaic data-testid="store-collection-thumb">
          <CollectionThumb contractAddress={collection.contractAddress} />
        </S.Mosaic>
        <S.CollName>
          <S.NameLine>
            <Link to={withEnv(`/collection/${collection.contractAddress}`, env)} data-testid="store-collection-name">
              {collection.name}
            </Link>
            {collection.exhausted ? (
              <S.SoldOutChip data-testid="store-collection-soldout">{t('myStore.collExhausted')}</S.SoldOutChip>
            ) : null}
          </S.NameLine>
          <S.CollMeta>
            {t('myStore.itemsCount', { count: collection.items.length })}
            {collection.listed > 0 ? ` · ${t('myStore.listedCount', { count: collection.listed })}` : ''}
            {/* A whole collection gone wears the chip beside its name instead, so the grey line stays a
                line of counts and the one fact that changes how to read them is not hidden in it. */}
            {!collection.exhausted && collection.soldOut > 0
              ? ` · ${t('myStore.soldOutCount', { count: collection.soldOut })}`
              : ''}
          </S.CollMeta>
        </S.CollName>
        <S.DiscountCell data-testid="store-collection-discount">
          {discount ? (
            <>
              <S.DiscountTop>
                <S.Pct pct={discount.discount / 10_000} />
                <S.Window until={discount.checks.expiration} />
              </S.DiscountTop>
              <S.DiscountFoot>
                {isSaleCapped(discount)
                  ? t('myStore.discountUsed', {
                      used: discount.state?.uses ?? 0,
                      total: discount.checks.uses
                    })
                  : t('myStore.discountUsedUncapped', { used: discount.state?.uses ?? 0 })}
              </S.DiscountFoot>
            </>
          ) : (
            t('myStore.noDiscountShort')
          )}
        </S.DiscountCell>
        {/* How much of the run has gone, not what sold in the window: a fraction of supply does not move
            when the period selector does, and the trend further along is what answers for the window. */}
        <S.Claimed data-testid="store-collection-claimed">
          {collection.claimed.toLocaleString()}
          <small>/{collection.runTotal.toLocaleString()}</small>
        </S.Claimed>
        <S.Earned data-testid="store-collection-earned">
          <Amount wei={collection.earningsWei} usd={collection.earningsUsd} />
        </S.Earned>
        <S.SparkCell>
          <Sparkline series={collection.trend} />
        </S.SparkCell>
        <S.ManageBtn
          as="a"
          href={`${config.builderUrl}/collections${collection.collectionId ? `/${collection.collectionId}` : ''}`}
          target="_blank"
          rel="noopener noreferrer"
          onClick={onManage}
          data-testid="store-manage"
        >
          {t('myStore.manage')}
          <Icon name="external-link" size={14} aria-hidden />
        </S.ManageBtn>
      </S.CollRow>

      {open ? (
        <S.Items id={panelId} data-testid="store-items">
          <S.CollStats data-testid="store-collection-stats">
            <span>
              <b>
                <Amount wei={collection.earningsWei} usd={collection.earningsUsd} />
              </b>
              {t('myStore.collEarned')}
            </span>
            <span>
              <b>{collection.sold.toLocaleString()}</b>
              {t('myStore.collSold')}
            </span>
            <span>
              <b>{collection.items.length}</b>
              {t('myStore.collItems', { count: collection.items.length })}
            </span>
            <span>
              <b>{collection.listed + collection.classic}</b>
              {t('myStore.collListed')}
            </span>
          </S.CollStats>
          {collection.items.map(item => {
            // Copies that exist with no sale behind them. Only over the whole life of the item, where it is
            // the other half of what sold: against a 30-day count it would read as though the two should
            // add up to the run, and they never would.
            const sentDirectly = issued(item, item.lifetimeSold)
            return (
              <S.ItemRow key={item.key} data-testid="store-item">
                <S.ItemThumb style={{ backgroundImage: rarityMedia(item.rarity) }}>
                  {item.thumbnail ? <img src={item.thumbnail} alt="" loading="lazy" /> : null}
                </S.ItemThumb>
                <S.ItemCell>
                  <S.ItemName to={withEnv(`/item/${collection.contractAddress}/${item.itemId}`, env)} title={item.name}>
                    {item.name}
                  </S.ItemName>
                  <S.ItemMeta>
                    <S.RarityChip
                      style={{ background: rarityColor(item.rarity) }}
                      title={rarityDescription(item.rarity)}
                    >
                      {rarityLabel(item.rarity)}
                    </S.RarityChip>
                    <S.ItemState data-state={item.state}>
                      {item.state === 'soldout' ? null : item.state === 'unlisted' ? (
                        t('myStore.stateUnlisted')
                      ) : item.state === 'unknown' ? (
                        t('myStore.stateUnknown')
                      ) : (
                        <>
                          <S.OnSaleFor>{t('myStore.onSaleFor')}</S.OnSaleFor>
                          {item.manaWei ? (
                            <>
                              <CurrencyMark kind="mana" />
                              {mana(weiOf(item.manaWei))}
                            </>
                          ) : (
                            <>
                              <CurrencyMark kind="credits" />
                              <Price credits={item.priceCredits ?? 0} />
                            </>
                          )}
                        </>
                      )}
                    </S.ItemState>
                    {onIssue && item.left > 0 ? (
                      <S.IssueBtn type="button" onClick={() => onIssue(item)} data-testid="store-item-issue">
                        {t('myStore.issueCopies')}
                      </S.IssueBtn>
                    ) : null}
                  </S.ItemMeta>
                </S.ItemCell>
                <S.ItemNum>
                  {item.sold.toLocaleString()}
                  <small> {t('myStore.sold')}</small>
                </S.ItemNum>
                {/* Saves, beside what actually sold: the pair is the reading, not either number alone. */}
                <S.Saves
                  data-testid="store-item-saves"
                  title={t('myStore.savesHint', { count: savesByKey.get(item.key) ?? 0 })}
                >
                  <Icon name="heart" className="ico" aria-hidden />
                  {(savesByKey.get(item.key) ?? 0).toLocaleString()}
                </S.Saves>
                {/* The run, not the offer: how much of this item's supply is gone. */}
                <S.Run
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={item.minted + item.left}
                  aria-valuenow={item.minted}
                  aria-label={t('myStore.runAria', { minted: item.minted, total: item.minted + item.left })}
                >
                  <i style={{ width: `${Math.round((item.minted / Math.max(1, item.minted + item.left)) * 100)}%` }} />
                </S.Run>
                {/* Copies left against the whole run, always — including at zero, where the run is the only
                    thing that says whether this was a 1-of-1 or a drop of a thousand. */}
                <S.StockCell
                  title={
                    item.lifetimeSold == null
                      ? undefined
                      : t('myStore.runBreakdown', {
                          total: item.minted + item.left,
                          sold: item.lifetimeSold,
                          sent: item.minted - item.lifetimeSold,
                          left: item.left
                        })
                  }
                >
                  <S.Stock data-out={item.left === 0} data-testid="store-item-stock">
                    {tNode(item.left === 0 ? 'myStore.stockNone' : 'myStore.stockLeft', {
                      b: (c: ReactNode) => <b>{c}</b>,
                      left: item.left.toLocaleString(),
                      total: (item.minted + item.left).toLocaleString()
                    })}
                  </S.Stock>
                  {sentDirectly ? (
                    <S.Issued data-testid="store-item-issued">
                      {t('myStore.sentDirectly', { count: sentDirectly.toLocaleString() })}
                    </S.Issued>
                  ) : null}
                </S.StockCell>
              </S.ItemRow>
            )
          })}
        </S.Items>
      ) : null}
    </>
  )
}

/**
 * The page while it loads, drawn in its own containers.
 *
 * Built from the real tiles, panels and rows rather than a stack of generic cards, so every box is exactly
 * where its figure will be and nothing moves when the data lands.
 */
/**
 * Which way a figure moved, beside the figure itself.
 *
 * Renders nothing at all when there is nothing to say: a store that sold nothing in either window is not
 * "flat", it is quiet, and a row of grey zeroes reading "no change" is noise on a page whose whole job is
 * to point at what changed.
 */
/** Whether {@link DeltaTag} will draw anything, so a tile's bottom row knows if it is already spoken for. */
function hasDelta(delta: Delta | null): boolean {
  return !!delta && !(delta.current === 0 && delta.previous === 0)
}

function DeltaTag({ delta, period }: { delta: Delta | null; period: RangeKey }) {
  if (!delta || (delta.current === 0 && delta.previous === 0)) return null
  const against =
    period === 'all'
      ? ''
      : period === '7d' || period === '30d' || period === '90d'
        ? t(`myStore.vs${period}`)
        : t('myStore.vsPrevious')
  if (delta.pct === null) {
    return (
      <S.Delta data-dir="new" data-testid="store-delta">
        {t('myStore.deltaNew')}
        {against ? <span className="delta__against">{against}</span> : null}
      </S.Delta>
    )
  }
  const rounded = Math.round(delta.pct)
  if (rounded === 0) {
    return (
      <S.Delta data-dir="flat" data-testid="store-delta">
        {t('myStore.deltaFlat')}
        {against ? <span className="delta__against">{against}</span> : null}
      </S.Delta>
    )
  }
  const up = rounded > 0
  /**
   * Past a point a percentage stops being a reading. A store that earned almost nothing one month and
   * something the next scores "24,411%", which tells a creator nothing they did not already know and does
   * not fit in the tile either. A multiple does both jobs: shorter, and the right shape for the size of the
   * jump. Only ever upward, since a fall cannot pass -100%.
   */
  const asMultiple = rounded >= 1000
  // Read off the percentage rather than off the two raw figures: for earnings those are wei narrowed to a
  // number and past what one holds exactly, while the percentage was worked out in bigint first.
  const amount = asMultiple
    ? t('myStore.deltaTimes', { times: Math.round(rounded / 100 + 1).toLocaleString() })
    : `${Math.abs(rounded)}%`
  return (
    <S.Delta
      data-dir={up ? 'up' : 'down'}
      data-testid="store-delta"
      aria-label={t(up ? 'myStore.deltaUpAria' : 'myStore.deltaDownAria', { pct: amount, against })}
    >
      <span className="delta__arrow" aria-hidden>
        {up ? '\u25b2' : '\u25bc'}
      </span>
      {amount}
      {against ? <span className="delta__against">{against}</span> : null}
    </S.Delta>
  )
}

function StoreSkeleton() {
  return (
    <div data-testid="store-skeleton" aria-hidden>
      <S.Tiles>
        {[0, 1, 2, 3].map(i => (
          <S.Tile key={i}>
            <S.Bar style={{ width: '46%' }} />
            <S.Bar style={{ width: '32%', height: 38 }} />
            <S.Bar style={{ width: '64%', height: 15 }} />
          </S.Tile>
        ))}
      </S.Tiles>

      {/* The shape the loaded page takes. A skeleton laid out differently is a jump dressed as a state. */}
      <S.Panel style={{ marginTop: 22 }}>
        <S.PanelHead>
          <S.Bar style={{ width: 96, height: 14 }} />
          <S.Bar style={{ width: 120 }} />
        </S.PanelHead>
        {/* Inside the same run the rows land in, with one bone per track: a skeleton that is a column short
            snaps its cells sideways the moment the data arrives. */}
        <S.List>
          <S.ColHead aria-hidden>
            <span />
            <span />
            <S.Bar style={{ width: 84, height: 12 }} />
            <S.Bar style={{ width: 74, height: 12 }} />
            <S.Bar style={{ width: 62, height: 12 }} />
            <S.Bar style={{ width: 68, height: 12 }} />
            <S.Bar style={{ width: 82, height: 12 }} />
            <S.Bar style={{ width: 60, height: 12 }} />
          </S.ColHead>
          {Array.from({ length: COLLECTIONS_SHOWN }, (_, i) => (
            <S.CollRow key={i}>
              <span />
              <S.Dot />
              <S.Bar style={{ width: '82%', height: 14 }} />
              <S.Bar style={{ width: '70%', height: 20 }} />
              <S.Bar style={{ width: 72 }} />
              <S.Bar style={{ width: 76 }} />
              <S.Bar style={{ height: 20 }} />
              <S.Bar style={{ width: 96, height: 32, borderRadius: 8 }} />
            </S.CollRow>
          ))}
        </S.List>
        {/* The list's own way out: a store past the first page keeps this row, and the panel keeps its
            height when the rows arrive. */}
        <S.More as="div">
          <S.Bar style={{ width: 150, height: 13, margin: '0 auto' }} />
        </S.More>
      </S.Panel>

      <S.Duo style={{ marginTop: 22 }}>
        {[0, 1].map(panel => (
          <S.Panel key={panel}>
            <S.PanelHead>
              <S.Bar style={{ width: 110, height: 14 }} />
              <S.Bar style={{ width: 80 }} />
            </S.PanelHead>
            <S.FeedHeadBone>
              {[0, 1, 2, 3].map(i => (
                <S.Bar key={i} style={{ width: 46, height: 9 }} />
              ))}
            </S.FeedHeadBone>
            {Array.from({ length: SALES_PER_PAGE }, (_, i) => (
              <S.FeedBone key={i}>
                <S.Bar style={{ width: '38%' }} />
                <S.Bar style={{ width: '24%' }} />
                <S.Bar style={{ width: 56 }} />
                <S.Bar style={{ width: 64 }} />
              </S.FeedBone>
            ))}
          </S.Panel>
        ))}
      </S.Duo>

      <S.Panel style={{ marginTop: 22 }}>
        <S.PanelHead>
          <S.Bar style={{ width: 104, height: 14 }} />
          <S.Bar style={{ width: 90 }} />
        </S.PanelHead>
        <S.FeedHeadBone>
          {[0, 1, 2, 3, 4].map(i => (
            <S.Bar key={i} style={{ width: 46, height: 9 }} />
          ))}
        </S.FeedHeadBone>
        {Array.from({ length: BUYERS_PER_PAGE }, (_, i) => (
          <S.FeedBone key={i}>
            <S.Bar style={{ width: '30%' }} />
            <S.Bar style={{ width: '18%' }} />
            <S.Bar style={{ width: 72, height: 18 }} />
            <S.Bar style={{ width: '14%' }} />
            <S.Bar style={{ width: 54 }} />
          </S.FeedBone>
        ))}
      </S.Panel>
    </div>
  )
}

export function MyStore() {
  useSeo({ title: t('myStore.title'), noindex: true })
  const { session, error, signIn } = useWallet()
  const [params, setParams] = useSearchParams()
  const [range, setRange] = useState<StoreRange>({ key: '30d' })
  const [rangeOpen, setRangeOpen] = useState(false)
  const picker = useRef<RangePickerHandle>(null)
  const [currency, setCurrency] = useState<StoreCurrency>(storedCurrency)
  const closeRange = useCallback(() => setRangeOpen(false), [])
  const period = range.key
  // Recomputed with the range, not per render, so the query keys stay put for the whole visit.
  const resolved = useMemo(() => resolveRange(range, Date.now()), [range])
  const periodLabel =
    period === 'custom' && resolved.from != null ? rangeLabel(resolved.from, resolved.to) : t(`myStore.period${period}`)
  // A set, not one id: opening a second collection to compare it with the first should not close the first.
  const [open, setOpen] = useState<ReadonlySet<string>>(() => new Set())
  const [collectionPage, setCollectionPage] = useState(0)
  const [page, setPage] = useState(0)
  const [saleOpen, setSaleOpen] = useState(false)
  const [sort, setSort] = useState<Sort>(storedSort)
  const [buyerPage, setBuyerPage] = useState(0)
  // A header click overrides the dropdown until the dropdown is used again. Not remembered: it is a
  // look at the table, not a preference.
  const [collectionSort, setCollectionSort] = useState<ColumnSort<CollectionColumn> | null>(null)
  const [bestSort, setBestSort] = useState<ColumnSort<BestColumn> | null>(null)
  const [bestPage, setBestPage] = useState(0)
  const [buyerSort, setBuyerSort] = useState<ColumnSort<BuyerColumn> | null>(null)
  const [ownerSort, setOwnerSort] = useState<ColumnSort<TopOwnersSort>>({ key: 'nfts', dir: 'desc' })
  const [ownerPage, setOwnerPage] = useState(0)
  const [discountPage, setDiscountPage] = useState(0)
  const [royaltiesOpen, setRoyaltiesOpen] = useState(false)
  const [royaltyPage, setRoyaltyPage] = useState(0)
  const [issuing, setIssuing] = useState<{
    item: Pick<StoreItem, 'itemId' | 'name' | 'thumbnail' | 'left'>
    contractAddress: string
    recipients?: string[]
  } | null>(null)
  const [rewardOpen, setRewardOpen] = useState(false)
  const queryClient = useQueryClient()
  /**
   * Dismissing the pricing nudge lasts this visit only, deliberately not persisted: the listings it is
   * about are still priced in MANA tomorrow, and a creator who waved it away last week should not be left
   * wondering why a discount will not reach them. Same rule My Items applies to the same banner.
   */
  const [pricingDismissed, setPricingDismissed] = useState(false)
  const creatorSalesEnabled = useCreatorSalesEnabled()
  const access = useMyStoreAccess()
  const mock = previewMock(params.get('mock'))
  const env = params.get('env')
  /**
   * The router's own root, so a plain anchor into the app keeps the basename.
   *
   * Deployed, the Shop lives at <domain>/shop and the router is mounted there; a raw href of "/items/…"
   * skips that and lands on the domain's own 404. Links rendered by <Link> get it for free — these are
   * anchors because they open a new tab, so they have to be given it.
   */
  const routerRoot = useHref('/').replace(/\/$/, '')
  const appHref = (path: string) => `${routerRoot}${path}`
  /** The invented store is not a creator using theirs; recording it would put fake clicks into the funnel. */
  const preview = mock
  function trackStore(event: string, props: Record<string, unknown> = {}) {
    if (!preview) track(event, props)
  }
  const { data: profile } = useProfile(session?.address)
  const storeAddress = session?.address
  const { data: storeProfile } = useStore(storeAddress)
  /** Only the links the creator actually filled in, in the order the public page shows them. */
  const storeLinks = LINK_TYPES.filter(type => storeProfile?.links[type])
  const face = profile?.avatar?.snapshots?.face256
  const creatorName = profile?.name ? capitalizeFirst(profile.name) : null
  const {
    stats: liveStats,
    trend: liveTrend,
    savesByKey: liveSaves,
    saleable,
    sales: liveSales,
    previousEarnedUsd,
    isLoading: liveLoading,
    error: statsError
  } = useStoreStats(session, resolved)
  // The invented store replaces what the reads return, not the page that draws them: every state below
  // is exercised by the same code a real creator gets.
  const stats = mock ? mockStats : liveStats
  const trend = mock ? { ...liveTrend, collectors: mockCollectors, buyers: mockBuyers, quietDays: 12 } : liveTrend
  const isLoading = mock ? false : liveLoading
  const savesByKey = mock ? mockSaves : liveSaves
  const sales = useSalesPage(session?.address, resolved, page)
  const salesRows = mock ? mockSaleRows : sales.rows
  const chartRows = mock ? mockChartRows : liveSales.rows

  // The daily closes behind every dollar figure. Read only once the creator asks for dollars, and wide enough
  // for the chart's year-over-year line; the server has nothing before the feed started in July 2021.
  // Back far enough for either comparison: a year earlier, or a previous period as long as the range itself.
  const ratesFrom =
    (resolved.from ?? Date.parse('2021-07-08T00:00:00Z')) - Math.max(400, (resolved.days ?? 0) + 31) * 86_400_000
  const ratesRead = useQuery({
    queryKey: ['mana-usd-rates', ratesFrom, resolved.to],
    enabled: currency === 'usd' && !mock,
    staleTime: 60 * 60_000,
    queryFn: () => fetchManaUsdRates(ratesFrom, resolved.to)
  })
  const rateBook: RateBook = mock ? mockRateBook : (ratesRead.data ?? EMPTY_RATES)
  const itemUsd = useMemo(
    () =>
      mock
        ? new Map(
            (stats?.collections ?? []).flatMap(c =>
              c.items.map(i => [i.key.toLowerCase(), usdOfWei(i.earnedWei, MOCK_TODAY_RATE)] as const)
            )
          )
        : usdBy(liveSales.rows, rateBook, row =>
            // First sales only, like the MANA figure beside it: a resale moves a copy that already sold.
            row.itemId === null || row.type !== 'mint' ? null : `${row.contractAddress.toLowerCase()}-${row.itemId}`
          ).totals,
    [mock, stats, liveSales.rows, rateBook]
  )
  const buyerTotals = useMemo(
    () => usdBy(liveSales.rows, rateBook, row => row.buyer.toLowerCase()).totals,
    [liveSales.rows, rateBook]
  )
  // In dollars the delta compares dollars: a flat month in MANA can be a bad one in dollars, and the reverse.
  const earningsDelta =
    currency === 'usd'
      ? stats?.earningsUsd != null && previousEarnedUsd != null
        ? deltaOf(stats.earningsUsd, previousEarnedUsd)
        : null
      : trend.earnings
  const buyerUsd = (buyer: { address: string; spentWei: bigint }) =>
    mock ? usdOfWei(buyer.spentWei, MOCK_TODAY_RATE) : (buyerTotals.get(buyer.address.toLowerCase()) ?? null)
  const saleAddresses = useMemo(() => [...new Set(salesRows.map(row => row.buyer.toLowerCase()))].sort(), [salesRows])
  const { data: buyers, isLoading: buyersLoading } = useBuyerNames(saleAddresses)
  const buyerPages = Math.max(1, Math.ceil(trend.buyers.length / BUYERS_PER_PAGE))
  /**
   * Clamped on READ rather than reset on every change that could shrink the list.
   *
   * Switching from all time to seven days can take forty buyers down to three. A page index kept from the
   * longer list then slices past the end — no rows, and because the list is not empty the empty state does
   * not show either, so the panel is a header over nothing with no pager left to click back with.
   */
  const buyerPageShown = Math.min(buyerPage, buyerPages - 1)
  const buyersSorted = useMemo(() => {
    if (!buyerSort) return trend.buyers
    const value = {
      items: (b: StoreBuyer) => b.items,
      collections: (b: StoreBuyer) => b.collections,
      last: (b: StoreBuyer) => b.lastAt,
      spent: (b: StoreBuyer) => b.spentWei
    }[buyerSort.key]
    return sortRows(trend.buyers, value, buyerSort.dir)
  }, [trend.buyers, buyerSort])
  const buyersShown = useMemo(
    () => buyersSorted.slice(buyerPageShown * BUYERS_PER_PAGE, (buyerPageShown + 1) * BUYERS_PER_PAGE),
    [buyersSorted, buyerPageShown]
  )
  // Only the faces on screen: a store with hundreds of customers would otherwise ask for hundreds of
  // profiles to draw a page of five rows.
  const audienceAddresses = useMemo(() => buyersShown.map(b => b.address).sort(), [buyersShown])
  const { data: audience } = useBuyerNames(audienceAddresses)
  // Who holds the store's items now, ranked on the server: the list can run to thousands, so it is sorted
  // and paged there rather than here.
  const ownersRead = useQuery({
    queryKey: ['store-top-owners', session?.address, ownerSort.key, ownerSort.dir, ownerPage],
    enabled: !mock && !!session,
    // Holders change slowly, and the server caches them for ten minutes anyway.
    staleTime: 5 * 60_000,
    placeholderData: previous => previous,
    retry: (count, error) => !(error instanceof TopOwnersUnavailableError) && count < 1,
    queryFn: () =>
      fetchTopOwners(session!.address, {
        sortBy: ownerSort.key,
        orderDirection: ownerSort.dir,
        first: OWNERS_PER_PAGE,
        skip: ownerPage * OWNERS_PER_PAGE
      })
  })
  // A server error is reported; a 404 is the endpoint not deployed yet, and a 503 is a store too large to rank.
  useEffect(() => {
    const error = ownersRead.error
    if (!error || error instanceof TopOwnersUnavailableError) return
    if (error instanceof TopOwnersReadError && error.status < 500) return
    captureError(error, { flow: 'my_store', step: 'top_owners' })
  }, [ownersRead.error])
  const owners = mock ? mockTopOwners(ownerSort, ownerPage, OWNERS_PER_PAGE) : ownersRead.data
  const ownerPages = Math.max(1, Math.ceil((owners?.total ?? 0) / OWNERS_PER_PAGE))
  // Each resale of the creator's items and the royalty it paid, read only once the creator opens the list.
  const royaltiesRead = useQuery({
    queryKey: ['store-royalties', session?.address, resolved.from ?? null, resolved.to, royaltyPage],
    enabled: royaltiesOpen && !mock && !!session,
    placeholderData: previous => previous,
    queryFn: () =>
      fetchRoyalties({
        creator: session!.address,
        from: resolved.from,
        to: resolved.to,
        first: ROYALTIES_PER_PAGE,
        skip: royaltyPage * ROYALTIES_PER_PAGE
      })
  })
  const royalties = mock ? mockRoyalties(royaltyPage, ROYALTIES_PER_PAGE) : royaltiesRead.data
  const royaltyPages = Math.max(1, Math.ceil((royalties?.total ?? 0) / ROYALTIES_PER_PAGE))
  const royaltyBuyers = useMemo(
    () => [...new Set((royalties?.data ?? []).map(r => r.buyer.toLowerCase()))].sort(),
    [royalties]
  )
  const { data: royaltyProfiles } = useBuyerNames(royaltyBuyers)
  /** The catalogue by item, so a resale row can show the item it moved, not just its ids. */
  const itemsByKey = useMemo(
    () =>
      new Map(
        (stats?.collections ?? []).flatMap(c =>
          c.items.map(i => [`${c.contractAddress.toLowerCase()}-${i.itemId}`, { item: i, collection: c.name }] as const)
        )
      ),
    [stats]
  )
  /** What a reward can be issued from: every item of the store with copies left, most left first. */
  const rewardItems = useMemo(
    () =>
      (stats?.collections ?? [])
        .flatMap(collection =>
          collection.items
            .filter(item => item.left > 0)
            .map(item => ({
              contractAddress: collection.contractAddress,
              itemId: item.itemId,
              name: item.name,
              thumbnail: item.thumbnail,
              collectionName: collection.name,
              left: item.left
            }))
        )
        .sort((a, b) => b.left - a.left),
    [stats]
  )
  // The total can shrink between reads (an owner sells everything); a page past the end steps back.
  useEffect(() => {
    if (ownerPage > ownerPages - 1) setOwnerPage(ownerPages - 1)
  }, [ownerPage, ownerPages])
  const ownerAddresses = useMemo(() => (owners?.data ?? []).map(o => o.address).sort(), [owners])
  const { data: ownerProfiles } = useBuyerNames(ownerAddresses)
  const discountsRead = useCreatorSales(session?.address, creatorSalesEnabled && !!session)
  const discounts = discountsRead.data
  useEffect(() => {
    if (discountsRead.error) captureError(discountsRead.error, { flow: 'my_store', step: 'discounts' })
  }, [discountsRead.error])
  // The tab lives in the URL, so a refresh, the back button and a shared link all land on it. A creator
  // without discounts has no Discounts tab, and a link to it opens the overview.
  const visibleTabs = STORE_TABS.filter(key => key !== 'discounts' || mock || creatorSalesEnabled)
  // `?tabs=off` lays every section out on one page, so the two layouts can be compared side by side.
  const tabbed = params.get('tabs') !== 'off'
  const chosenTab = storedTab(params.get('tab'))
  const tab: StoreTab = visibleTabs.includes(chosenTab) ? chosenTab : 'overview'
  function setTab(next: StoreTab) {
    setParams(
      prev => {
        const query = new URLSearchParams(prev)
        if (next === 'overview') query.delete('tab')
        else query.set('tab', next)
        return query
      },
      { replace: true }
    )
  }

  // The flag closes the page, not just the nav entry — otherwise the link is off and the URL is still live.
  // Only once the read has ANSWERED no: a pending read is not an answer, and bouncing on it would send
  // every visitor home before the flag file arrives, or before the wallet an allowlist is checked against
  // has been read back.
  /** Sorted once per change rather than on every render; a store can carry a few dozen collections. */
  const collectionPages = Math.max(1, Math.ceil((stats?.collections.length ?? 0) / COLLECTIONS_SHOWN))
  const sortedCollections = useMemo(() => {
    const collections = stats?.collections ?? []
    if (!collectionSort) return sortCollections(collections, sort, currency)
    const value = {
      name: (c: StoreCollection) => c.name,
      claimed: (c: StoreCollection) => c.claimed,
      earnings: (c: StoreCollection) => (currency === 'usd' ? c.earningsUsd : c.earningsWei),
      sold: (c: StoreCollection) => c.sold
    }[collectionSort.key]
    return sortRows(collections, value, collectionSort.dir)
  }, [stats, sort, collectionSort, currency])

  /**
   * Over all time a store's best seller is the item that brought in the most, not the one that moved the
   * most copies; over a week or a month, copies are the better read. Either way a header click overrides it.
   */
  const bestSortInForce: ColumnSort<BestColumn> | null =
    bestSort ?? (period === 'all' ? { key: 'earnings', dir: 'desc' } : null)
  const best = useMemo(() => {
    const entries = bestSellers(stats?.collections ?? [], Infinity)
    const value = {
      name: (e: (typeof entries)[number]) => e.name,
      collection: (e: (typeof entries)[number]) => e.collectionName,
      sold: (e: (typeof entries)[number]) => e.sold,
      earnings: (e: (typeof entries)[number]) =>
        currency === 'usd' ? (itemUsd.get(e.key.toLowerCase()) ?? null) : e.earnedWei
    }
    // The rank is the position in the default order (copies, or earnings over all time), taken before any
    // header sort and carried with the row.
    const byDefault = period === 'all' ? sortRows(entries, value.earnings, 'desc') : entries
    const ranked = byDefault.map((entry, index) => ({ ...entry, rank: index + 1 }))
    if (!bestSort) return ranked
    return sortRows(ranked, value[bestSort.key], bestSort.dir)
  }, [stats, bestSort, currency, itemUsd, period])
  function sortBest(key: BestColumn, first: SortDir) {
    const next = nextSort(bestSortInForce, key, first)
    trackStore('Shop Sorted Store Table', { table: 'best_sellers', column: next.key, direction: next.dir })
    setBestSort(next)
    setBestPage(0)
  }
  const bestPages = Math.max(1, Math.ceil(best.length / BEST_PER_PAGE))
  // Clamped on read, like the buyers: a shorter period can leave the kept page past the end.
  const bestPageShown = Math.min(bestPage, bestPages - 1)
  const bestShown = useMemo(
    () => best.slice(bestPageShown * BEST_PER_PAGE, (bestPageShown + 1) * BEST_PER_PAGE),
    [best, bestPageShown]
  )

  /** One page of that order, so a store with fifty collections opens on eight rather than on all of them. */
  const collectionPageShown = Math.min(collectionPage, collectionPages - 1)
  const collectionsShown = useMemo(
    () =>
      sortedCollections.slice(collectionPageShown * COLLECTIONS_SHOWN, (collectionPageShown + 1) * COLLECTIONS_SHOWN),
    [sortedCollections, collectionPageShown]
  )

  const heightKey = `${resolved.from ?? 'all'}-${resolved.to}`
  // Opening a collection grows the list by its items; the height held for paging must not outlive that.
  const openKey = [...open].sort().join(',')
  const collectionsHeight = useStableHeight<HTMLDivElement>(
    collectionPages > 1,
    `${heightKey}-${collectionPages}-${openKey}`
  )
  const bestHeight = useStableHeight<HTMLDivElement>(bestPages > 1, `${heightKey}-${bestPages}`)
  const salesHeight = useStableHeight<HTMLDivElement>((mock ? 1 : sales.pages) > 1, `${heightKey}-${sales.pages}`)
  const buyersHeight = useStableHeight<HTMLDivElement>(buyerPages > 1, `${heightKey}-${buyerPages}`)
  const ownersHeight = useStableHeight<HTMLDivElement>(ownerPages > 1, `${ownerSort.key}-${ownerPages}`)
  const royaltiesHeight = useStableHeight<HTMLDivElement>(royaltyPages > 1, `${heightKey}-${royaltyPages}`)

  if (access === 'off') return <Navigate to="/" replace />

  if (!session && !mock) {
    return (
      <EmptyStateCentered>
        <EmptyState
          testId="my-store-signin"
          icon={signInIllustration}
          title={t('myStore.signInTitle')}
          body={t('myStore.signInBody')}
          cta={{ label: t('storeSettings.signIn'), onClick: () => signIn() }}
          ctaVariant="solid"
          fill
        />
        <ErrorNotice message={error} />
      </EmptyStateCentered>
    )
  }

  /** Which collections a discount covers right now, so a row can wear its tag. */
  // One source for both the rows' chips and the panel below them, so the two cannot disagree about
  // whether anything is running.
  const liveDiscounts = mock ? mockSales : discounts
  const discountByCollection = new Map<string, CreatorSale>()
  for (const sale of liveDiscounts ?? []) {
    if (sale.status !== 'active' && sale.status !== 'scheduled') continue
    for (const address of sale.collections) discountByCollection.set(address.toLowerCase(), sale)
  }

  const running = (liveDiscounts ?? []).filter(s => s.status === 'active' || s.status === 'scheduled')
  // Every discount the creator has run, what is still on first and then newest first, so the past ones stay
  // findable once My Items stops listing them for a creator with this page.
  const liveNow = (sale: CreatorSale) => {
    const status = liveSaleStatus(sale)
    return status === 'active' || status === 'scheduled'
  }
  const discountHistory = [...(liveDiscounts ?? [])].sort(
    (a, b) => Number(liveNow(b)) - Number(liveNow(a)) || b.createdAt - a.createdAt
  )
  const discountPages = Math.max(1, Math.ceil(discountHistory.length / DISCOUNTS_PER_PAGE))
  const discountPageShown = Math.min(discountPage, discountPages - 1)
  const collectionNames: Record<string, string> = Object.fromEntries(
    (stats?.collections ?? []).map(c => [c.contractAddress.toLowerCase(), c.name])
  )

  /** How long the chosen window is, where it has a length at all. All time does not. */
  const windowDays = resolved.days

  const items = (stats?.collections ?? []).reduce((n, c) => n + c.items.length, 0)

  // One panel, two homes: its own tab, or its place in the page laid out without tabs.
  const discountsPanel = (
    <S.Panel aria-labelledby="store-discounts-h" data-testid="store-discounts-panel">
      <S.ListHead>
        <div>
          <S.PanelTitle id="store-discounts-h">{t('myStore.discountsTitle')}</S.PanelTitle>
          <S.PanelSub>{t('myStore.discountsHint')}</S.PanelSub>
        </div>
        {mock || (creatorSalesEnabled && session && saleable.length > 0) ? (
          <Button variant="red" size="sm" onClick={() => setSaleOpen(true)} data-testid="store-tab-new-discount">
            <span aria-hidden>🔥</span>
            {t('myStore.newDiscount')}
          </Button>
        ) : null}
      </S.ListHead>
      {!mock && discountsRead.isLoading ? (
        <S.Empty data-testid="store-discounts-loading">{t('myStore.discountsLoading')}</S.Empty>
      ) : !mock && discountsRead.isError && !discounts ? (
        <S.Empty data-testid="store-discounts-error">{t('myStore.discountsError')}</S.Empty>
      ) : discountHistory.length === 0 ? (
        <S.Empty data-testid="store-discounts-empty">
          {saleable.length > 0 ? t('myStore.discountsEmpty') : t('myStore.discountsEmptyNoCredits')}
        </S.Empty>
      ) : (
        <CreatorSales
          sales={discountHistory.slice(
            discountPageShown * DISCOUNTS_PER_PAGE,
            (discountPageShown + 1) * DISCOUNTS_PER_PAGE
          )}
          session={mock ? null : session}
          names={collectionNames}
          tone="dark"
        />
      )}
      {discountPages > 1 ? (
        <S.ListFoot>
          <span>{t('myStore.discountsCount', { count: discountHistory.length })}</span>
          <Pager
            page={discountPageShown}
            pages={discountPages}
            onChange={next => {
              trackStore('Shop Paged Store Table', { table: 'discounts', page: next + 1 })
              setDiscountPage(next)
            }}
            name="discounts"
          />
        </S.ListFoot>
      ) : null}
    </S.Panel>
  )

  return (
    <A.Root>
      <A.Main>
        <CurrencyContext.Provider value={currency}>
          <S.Root data-testid="my-store">
            {rewardOpen && owners ? (
              <RewardOwnersModal
                creator={session?.address ?? 'mock'}
                ownerCount={owners.total}
                items={rewardItems}
                loadOwners={async (count, sortBy) =>
                  mock
                    ? mockTopOwners({ key: sortBy, dir: 'desc' }, 0, count).data
                    : (
                        await fetchTopOwners(session!.address, {
                          sortBy,
                          orderDirection: 'desc',
                          first: count,
                          skip: 0
                        })
                      ).data
                }
                onClose={() => setRewardOpen(false)}
                onTrack={trackStore}
                onContinue={({ item, recipients }) => {
                  setRewardOpen(false)
                  // The invented store has no account to issue from; the choice is as far as it goes.
                  if (!session) return
                  setIssuing({ item, contractAddress: item.contractAddress, recipients })
                }}
              />
            ) : null}
            {issuing && session ? (
              <IssueModal
                item={{
                  contractAddress: issuing.contractAddress,
                  chainId: config.chainId,
                  itemId: issuing.item.itemId,
                  name: issuing.item.name,
                  thumbnail: issuing.item.thumbnail,
                  available: issuing.item.left
                }}
                session={session}
                initialRecipients={issuing.recipients}
                onClose={() => {
                  setIssuing(null)
                  void queryClient.invalidateQueries({ queryKey: ['store-catalogue'] })
                  void queryClient.invalidateQueries({ queryKey: ['store-public-catalogue'] })
                }}
              />
            ) : null}
            {saleOpen && (mock || session) ? (
              <CreatorSaleModal
                // The invented store signs as nobody, even with a creator signed in: only signing it fails.
                session={mock ? MOCK_SESSION : (session as Session)}
                collections={mock ? mockSaleable : saleable}
                onClose={() => setSaleOpen(false)}
                source="my_store"
                silent={preview}
              />
            ) : null}

            <S.Masthead>
              <S.Identity>
                <S.Avatar
                  style={face ? { backgroundImage: `url(${face})` } : undefined}
                  data-testid="store-avatar"
                  aria-hidden
                />
                <S.IdentityText>
                  {creatorName ? <S.Eyebrow>{creatorName}</S.Eyebrow> : null}
                  <S.TitleBlock>
                    <S.Title>{t('myStore.title')}</S.Title>
                    {/* The line holds its place while the figures load, so the masthead does not grow a row under
                  the reader. */}
                    {stats ? (
                      <S.Sub>
                        {t('myStore.summary', { collections: stats.collections.length, items })}
                        {storeLinks.length > 0 ? (
                          <S.Socials data-testid="store-socials">
                            {storeLinks.map(type => (
                              <S.Social
                                key={type}
                                href={storeProfile?.links[type] ?? ''}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={() =>
                                  trackStore('Shop Clicked Store Action', { action: 'social_link', link_type: type })
                                }
                                title={t(`creator.link.${type}`)}
                                aria-label={t(`creator.link.${type}`)}
                              >
                                <Icon name={LINK_ICON[type]} className="ico" aria-hidden />
                              </S.Social>
                            ))}
                          </S.Socials>
                        ) : null}
                      </S.Sub>
                    ) : (
                      <S.Sub>
                        <S.Bar style={{ width: 170, background: 'rgba(252, 252, 252, 0.18)', animation: 'none' }} />
                      </S.Sub>
                    )}
                  </S.TitleBlock>
                </S.IdentityText>
              </S.Identity>
              <S.StoreActions>
                {storeAddress ? (
                  <S.ViewPublic
                    href={appHref(withEnv(`/items/creator/${storeAddress}`, env))}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => trackStore('Shop Clicked Store Action', { action: 'view_public_store' })}
                    data-testid="store-view-public"
                  >
                    {t('myStore.viewPublicStore')}
                    <Icon name="external-link" className="ico" aria-hidden />
                  </S.ViewPublic>
                ) : null}
                {/* Carries where it came from, so the settings page's back arrow returns HERE rather than
                    to the public page it was reached from before. */}
                <S.EditStore
                  to={withEnv('/store-settings', env)}
                  state={{ from: tab === 'overview' ? '/my-store' : `/my-store?tab=${tab}` }}
                  onClick={() => trackStore('Shop Clicked Store Action', { action: 'edit_store' })}
                  data-testid="store-edit"
                >
                  <Icon name="pen" className="ico" aria-hidden />
                  {t('myStore.editStore')}
                </S.EditStore>
              </S.StoreActions>
            </S.Masthead>

            <S.PerfHead>
              {tabbed ? null : <S.PerfTitle>{t('myStore.performance')}</S.PerfTitle>}
              <S.Tabs
                hidden={!tabbed}
                role="tablist"
                aria-label={t('myStore.tabsAria')}
                onKeyDown={event => {
                  // Arrows move between tabs, the way a tab list is operated from the keyboard.
                  const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0
                  if (!step) return
                  event.preventDefault()
                  const next = visibleTabs[(visibleTabs.indexOf(tab) + step + visibleTabs.length) % visibleTabs.length]
                  trackStore('Shop Changed Store Tab', { tab: next, previous_tab: tab, from: 'keyboard' })
                  setTab(next)
                  document.getElementById(`store-tab-${next}`)?.focus()
                }}
              >
                {visibleTabs.map(key => (
                  <S.Tab
                    key={key}
                    type="button"
                    role="tab"
                    id={`store-tab-${key}`}
                    aria-selected={tab === key}
                    aria-controls="store-tab-panel"
                    tabIndex={tab === key ? 0 : -1}
                    aria-label={
                      key === 'discounts' && running.length > 0
                        ? t('myStore.tabDiscountsRunning', { count: running.length })
                        : undefined
                    }
                    onClick={() => {
                      if (key !== tab) trackStore('Shop Changed Store Tab', { tab: key, previous_tab: tab })
                      setTab(key)
                    }}
                    data-testid={`store-tab-${key}`}
                  >
                    {t(`myStore.tab.${key}`)}
                    {key === 'discounts' && running.length > 0 ? (
                      <S.TabCount aria-hidden>{running.length}</S.TabCount>
                    ) : null}
                  </S.Tab>
                ))}
              </S.Tabs>
              {/* A discount is not read over a period: its history has its own dates. */}
              <S.PerfControls data-hidden={tabbed && tab === 'discounts' ? '' : undefined}>
                <S.CurrencySwitch role="group" aria-label={t('myStore.currency')}>
                  {(['mana', 'usd'] as StoreCurrency[]).map(option => (
                    <S.Period
                      key={option}
                      type="button"
                      aria-pressed={currency === option}
                      aria-label={t(option === 'usd' ? 'myStore.currencyUsd' : 'myStore.currencyPaid')}
                      title={t(option === 'usd' ? 'myStore.currencyUsd' : 'myStore.currencyPaid')}
                      onClick={() => {
                        if (option === currency) return
                        trackStore('Shop Changed Store Currency', { currency: option })
                        setCurrency(option)
                        rememberCurrency(option)
                      }}
                      data-testid={`store-currency-${option}`}
                    >
                      {option === 'usd' ? '$' : <CurrencyMark kind="mana" />}
                    </S.Period>
                  ))}
                </S.CurrencySwitch>
                <S.PeriodsWrap>
                  <S.RangeTrigger
                    type="button"
                    aria-expanded={rangeOpen}
                    aria-haspopup="dialog"
                    data-range-trigger=""
                    aria-label={t('myStore.periodTrigger', { period: periodLabel })}
                    onClick={() => (rangeOpen ? picker.current?.close() : setRangeOpen(true))}
                    data-testid="store-period-trigger"
                  >
                    <Icon name="calendar" size={16} aria-hidden />
                    <span>{periodLabel}</span>
                    <Icon name="chevron-down" size={16} aria-hidden data-open={rangeOpen ? '' : undefined} />
                  </S.RangeTrigger>
                  {rangeOpen ? (
                    <RangePicker
                      handle={picker}
                      from={resolved.from ?? resolved.to - 29 * 86_400_000}
                      to={resolved.to}
                      max={Date.now()}
                      presets={RANGE_KEYS.filter(key => key !== 'custom').map(key => ({
                        key,
                        label: t(`myStore.period${key}`),
                        active: period === key,
                        onPick: () => {
                          if (key !== period)
                            trackStore('Shop Changed Store Period', { period: key, previous_period: period })
                          setRange({ key })
                          setRangeOpen(false)
                          setPage(0)
                        }
                      }))}
                      onClose={closeRange}
                      onApply={(from, to) => {
                        trackStore('Shop Changed Store Period', {
                          period: 'custom',
                          previous_period: period,
                          days: Math.round((to - from) / 86_400_000) + 1
                        })
                        setRange({ key: 'custom', from, to })
                        setRangeOpen(false)
                        setPage(0)
                      }}
                    />
                  ) : null}
                </S.PeriodsWrap>
              </S.PerfControls>
            </S.PerfHead>
            {currency === 'usd' && !mock && ratesRead.isError ? (
              <S.CurrencyNote data-testid="store-usd-unavailable">{t('myStore.usdUnavailable')}</S.CurrencyNote>
            ) : currency === 'usd' && stats && stats.unpricedSales > 0 ? (
              <S.CurrencyNote data-testid="store-usd-unpriced">
                {t('myStore.usdUnpriced', { count: stats.unpricedSales })}
              </S.CurrencyNote>
            ) : null}

            <ErrorNotice message={statsError ? t('myStore.error') : null} testId="my-store-error" />

            <S.TabPanel
              role={tabbed ? 'tabpanel' : undefined}
              id="store-tab-panel"
              aria-labelledby={tabbed ? `store-tab-${tab}` : undefined}
            >
              {/* Its own read with its own states: the store's figures loading are no reason to wait. */}
              {tabbed && tab === 'discounts' ? discountsPanel : null}
              {tabbed && tab === 'discounts' ? null : isLoading || !stats ? (
                <StoreSkeleton />
              ) : (
                <>
                  {!tabbed || tab === 'overview' ? (
                    <>
                      <S.Tiles aria-label={t('myStore.summaryAria')}>
                        <S.Tile>
                          <S.TileKey>
                            {t('myStore.tileSold')}
                            <S.TileMark aria-hidden>🛍️</S.TileMark>
                          </S.TileKey>
                          <S.TileValue>
                            <span data-testid="store-sold">{stats.sold.toLocaleString()}</span>
                          </S.TileValue>
                          {/* The bottom line is the movement where there is one. A store with nothing to compare
                      against keeps the breakdown there instead, so the tile never ends on its figure. */}
                          <S.TileFoot>
                            <DeltaTag delta={trend.sold} period={period} />
                            {!hasDelta(trend.sold) &&
                              (stats.sold === 0
                                ? t('myStore.tileSoldNone')
                                : stats.resales === 0
                                  ? // "0 resold by you" is a fact about nothing. Most stores never resell, so for
                                    // most of them that clause was half the line and all of it noise.
                                    t('myStore.tileSoldFootMintsOnly', { mints: stats.mints })
                                  : t('myStore.tileSoldFoot', { mints: stats.mints, resales: stats.resales }))}
                          </S.TileFoot>
                        </S.Tile>
                        <S.Tile>
                          <S.TileKey>
                            {t('myStore.tileEarnings')}
                            <S.TileMark aria-hidden>💰</S.TileMark>
                          </S.TileKey>
                          <S.TileValue data-testid="store-earnings">
                            <Amount wei={stats.earningsWei} usd={stats.earningsUsd} />
                            {currency === 'usd' ? null : <S.TileUnit>{t('myStore.manaUnit')}</S.TileUnit>}
                          </S.TileValue>
                          <S.TileFoot>
                            <DeltaTag delta={earningsDelta} period={period} />
                            {stats.partial ? (
                              <>
                                <S.Estimate>{t('myStore.estimate')}</S.Estimate> {t('myStore.tileEarningsPartial')}
                              </>
                            ) : hasDelta(earningsDelta) ? null : (
                              t('myStore.tileEarningsFoot')
                            )}
                          </S.TileFoot>
                        </S.Tile>
                        <S.Tile>
                          <S.TileKey>
                            {t('myStore.tileListed')}
                            <S.TileMark aria-hidden>🏷️</S.TileMark>
                          </S.TileKey>
                          <S.TileValue>
                            {stats.listed + stats.classic}
                            <S.TileUnit>{t('myStore.ofTotal', { n: items })}</S.TileUnit>
                          </S.TileValue>
                          <S.TileFoot>
                            {items === 0
                              ? t('myStore.tileListedNone')
                              : t('myStore.tileListedFoot', { count: stats.neverListed })}
                          </S.TileFoot>
                        </S.Tile>
                        <S.Tile>
                          <S.TileKey>
                            {t('myStore.tileDiscounts')}
                            <S.TileMark aria-hidden>🔥</S.TileMark>
                          </S.TileKey>
                          <S.TileValue data-testid="store-discounts">{running.length}</S.TileValue>
                          {running.length > 0 && !tabbed ? (
                            <S.TileFoot>{t('myStore.tileDiscountsFoot')}</S.TileFoot>
                          ) : running.length > 0 ? (
                            <S.TileAction
                              type="button"
                              onClick={() => {
                                trackStore('Shop Changed Store Tab', {
                                  tab: 'discounts',
                                  previous_tab: tab,
                                  from: 'tile'
                                })
                                setTab('discounts')
                              }}
                              data-testid="store-discounts-open"
                            >
                              {t('myStore.tileDiscountsOpen')}
                              <Icon name="chevron-down" size={14} aria-hidden style={{ transform: 'rotate(-90deg)' }} />
                            </S.TileAction>
                          ) : (
                            <S.TileFoot>{t('myStore.tileDiscountsNone')}</S.TileFoot>
                          )}
                        </S.Tile>
                      </S.Tiles>

                      <S.Panel aria-labelledby="store-chart-h" data-testid="store-chart-panel">
                        <StoreSalesPanel
                          heading={
                            <div>
                              <S.PanelTitle id="store-chart-h">{t('myStore.chart.title')}</S.PanelTitle>
                              <S.PanelSub>{t('myStore.chart.sub')}</S.PanelSub>
                            </div>
                          }
                          address={session?.address}
                          range={resolved}
                          rows={chartRows}
                          truncated={liveSales.truncated}
                          // The rates count too: until they land every sale would read as unpriced and the line as zero.
                          fetching={liveSales.isFetching || (currency === 'usd' && !mock && ratesRead.isFetching)}
                          collections={stats.collections}
                          onTrack={trackStore}
                          comparisonRows={mock ? mockChartRows : undefined}
                          currency={currency}
                          rateBook={rateBook}
                        />
                      </S.Panel>

                      <S.Duo>
                        <S.Panel aria-labelledby="store-best-h">
                          <S.PanelHeadStack>
                            <div>
                              <S.PanelTitle id="store-best-h">{t('myStore.bestSellers')}</S.PanelTitle>
                              <S.PanelSub>
                                {t('myStore.bestSellersSub', { n: best.length })}
                                {/* Earnings here are summed from the rows the cap allowed, never from the server's
                            exact aggregate, which answers per collection and not per item. The list below
                            carries the same seam and must not be the only place that admits it. */}
                                {stats.breakdownPartial ? (
                                  <> · {t('myStore.soldPartial', { n: stats.fetched.toLocaleString() })}</>
                                ) : null}
                              </S.PanelSub>
                            </div>
                          </S.PanelHeadStack>
                          {best.length === 0 ? (
                            <S.Empty>{t('myStore.noBestSellers')}</S.Empty>
                          ) : (
                            <S.FeedWrap ref={bestHeight.ref} style={bestHeight.style}>
                              <S.BestFeed>
                                <thead>
                                  <tr>
                                    <th scope="col" aria-sort={ariaSort(dirOf(bestSortInForce, 'name'))}>
                                      <S.RankCell>
                                        <S.Rank aria-hidden>#</S.Rank>
                                        <SortHeader
                                          label={t('myStore.colItem')}
                                          dir={dirOf(bestSortInForce, 'name')}
                                          testId="store-sort-best-name"
                                          onSort={() => sortBest('name', 'asc')}
                                        />
                                      </S.RankCell>
                                    </th>
                                    <th scope="col" aria-sort={ariaSort(dirOf(bestSortInForce, 'collection'))}>
                                      <SortHeader
                                        label={t('myStore.colCollection')}
                                        dir={dirOf(bestSortInForce, 'collection')}
                                        testId="store-sort-best-collection"
                                        onSort={() => sortBest('collection', 'asc')}
                                      />
                                    </th>
                                    <th
                                      scope="col"
                                      style={{ textAlign: 'center' }}
                                      aria-sort={ariaSort(dirOf(bestSortInForce, 'sold'))}
                                    >
                                      <SortHeader
                                        label={t('myStore.colSold')}
                                        dir={dirOf(bestSortInForce, 'sold')}
                                        testId="store-sort-best-sold"
                                        onSort={() => sortBest('sold', 'desc')}
                                      />
                                    </th>
                                    <th
                                      scope="col"
                                      style={{ textAlign: 'right' }}
                                      aria-sort={ariaSort(dirOf(bestSortInForce, 'earnings'))}
                                    >
                                      <SortHeader
                                        label={t('myStore.colEarnings')}
                                        dir={dirOf(bestSortInForce, 'earnings')}
                                        align="right"
                                        testId="store-sort-best-earnings"
                                        onSort={() => sortBest('earnings', 'desc')}
                                      />
                                    </th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {bestShown.map(entry => (
                                    <tr key={entry.key} data-testid="store-best">
                                      <td>
                                        <S.RankCell>
                                          <S.Rank>{entry.rank}</S.Rank>
                                          <S.SaleItem
                                            as="a"
                                            {...{
                                              href: appHref(itemHref(entry.contractAddress, entry.itemId, env)),
                                              target: '_blank',
                                              rel: 'noopener noreferrer',
                                              onClick: () =>
                                                trackStore('Shop Clicked Store Action', {
                                                  action: 'open_item',
                                                  table: 'best_sellers',
                                                  rank: entry.rank
                                                }),
                                              'data-testid': 'store-best-item'
                                            }}
                                          >
                                            <S.SaleThumb style={{ backgroundImage: rarityMedia(entry.rarity) }}>
                                              {entry.thumbnail ? (
                                                <img src={entry.thumbnail} alt="" loading="lazy" />
                                              ) : null}
                                            </S.SaleThumb>
                                            <span>{entry.name}</span>
                                          </S.SaleItem>
                                        </S.RankCell>
                                      </td>
                                      <td data-dim>{entry.collectionName}</td>
                                      <td
                                        style={{ textAlign: 'center', fontWeight: 600 }}
                                        data-testid="store-best-sold"
                                      >
                                        {entry.sold.toLocaleString()}
                                      </td>
                                      <td data-money>
                                        <S.Money>
                                          <Amount
                                            wei={entry.earnedWei}
                                            usd={itemUsd.get(entry.key.toLowerCase()) ?? null}
                                          />
                                        </S.Money>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </S.BestFeed>
                            </S.FeedWrap>
                          )}
                          {bestPages > 1 ? (
                            <S.ListFoot>
                              <span />
                              <Pager
                                page={bestPageShown}
                                pages={bestPages}
                                onChange={next => {
                                  trackStore('Shop Paged Store Table', { table: 'best_sellers', page: next + 1 })
                                  setBestPage(next)
                                }}
                                name="best"
                              />
                            </S.ListFoot>
                          ) : null}
                        </S.Panel>

                        <S.Panel aria-labelledby="store-feed-h">
                          <S.PanelHeadStack>
                            <div>
                              <S.PanelTitle id="store-feed-h">{t('myStore.recentSales')}</S.PanelTitle>
                              <S.PanelSub>{t('myStore.recentSalesSub')}</S.PanelSub>
                            </div>
                            <S.ViewAll
                              to="/activity"
                              onClick={() => trackStore('Shop Clicked Store Action', { action: 'view_all_sales' })}
                            >
                              {t('myStore.viewAll')}
                              <Icon name="arrow-up-right" size={14} aria-hidden />
                            </S.ViewAll>
                          </S.PanelHeadStack>
                          {salesRows.length === 0 ? (
                            <S.Empty>{t('myStore.noSales')}</S.Empty>
                          ) : (
                            <S.FeedWrap ref={salesHeight.ref} style={salesHeight.style}>
                              <S.SaleFeed>
                                <thead>
                                  <tr>
                                    <th scope="col">{t('myStore.colItem')}</th>
                                    <th scope="col">{t('myStore.colCollection')}</th>
                                    <th scope="col" style={{ textAlign: 'right' }}>
                                      {t('myStore.colPrice')}
                                    </th>
                                    <th scope="col">{t('myStore.colBuyer')}</th>
                                    <th scope="col">{t('myStore.colDate')}</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {salesRows.map(row => {
                                    const collection = stats.collections.find(
                                      c => c.contractAddress === row.contractAddress.toLowerCase()
                                    )
                                    const item = collection?.items.find(i => i.itemId === row.itemId)
                                    const buyer = buyers?.get(row.buyer.toLowerCase())
                                    const face = buyer?.avatar?.snapshots?.face256
                                    return (
                                      <tr key={row.id} data-testid="store-sale">
                                        <td>
                                          <S.SaleItem
                                            as={row.itemId ? 'a' : 'span'}
                                            {...(row.itemId
                                              ? {
                                                  href: appHref(itemHref(row.contractAddress, row.itemId, env)),
                                                  target: '_blank',
                                                  rel: 'noopener noreferrer',
                                                  onClick: () =>
                                                    trackStore('Shop Clicked Store Action', {
                                                      action: 'open_item',
                                                      table: 'recent_sales'
                                                    }),
                                                  'data-testid': 'store-sale-item'
                                                }
                                              : {})}
                                          >
                                            <S.SaleThumb style={{ backgroundImage: rarityMedia(item?.rarity) }}>
                                              {item?.thumbnail ? (
                                                <img src={item.thumbnail} alt="" loading="lazy" />
                                              ) : null}
                                            </S.SaleThumb>
                                            <S.SaleLines>
                                              <span>
                                                {item?.name ??
                                                  collection?.name ??
                                                  row.itemId ??
                                                  t('myStore.unknownItem')}
                                              </span>
                                              {/* The kind lost its own column to the collection, and it is the one fact
                                          about a row that nothing else on the page can answer. */}
                                              <Tooltip content={t('myStore.kindHint')}>
                                                <S.Kind data-kind={row.type} data-testid="store-kind-hint">
                                                  {row.type === 'mint'
                                                    ? t('myStore.kindMint')
                                                    : t('myStore.kindResale')}
                                                </S.Kind>
                                              </Tooltip>
                                            </S.SaleLines>
                                          </S.SaleItem>
                                        </td>
                                        <td data-dim>{collection?.name ?? '—'}</td>
                                        <td data-money>
                                          <S.Money>
                                            <Amount wei={weiOf(row.price)} usd={usdOfSale(row, rateBook)} />
                                          </S.Money>
                                        </td>
                                        <td>
                                          {/* A shortened address is the ANSWER for a buyer with no profile name, not a
                                      loading state — writing it first and swapping it for the real name reads
                                      as a glitch, so the row holds its place until the lookup answers. */}
                                          {buyersLoading ? (
                                            <S.FaceSkeleton aria-hidden>
                                              <i />
                                              <b />
                                            </S.FaceSkeleton>
                                          ) : (
                                            <S.Buyer
                                              href={accountHref(row.buyer)}
                                              target="_blank"
                                              rel="noopener noreferrer"
                                              onClick={() =>
                                                trackStore('Shop Clicked Store Action', {
                                                  action: 'open_buyer',
                                                  table: 'recent_sales'
                                                })
                                              }
                                              data-testid="store-sale-buyer"
                                            >
                                              <S.Face
                                                style={face ? { backgroundImage: `url(${face})` } : undefined}
                                                aria-hidden
                                              />
                                              {buyerName(row.buyer, buyers)}
                                            </S.Buyer>
                                          )}
                                        </td>
                                        <td data-dim>{ago(row.timestamp)}</td>
                                      </tr>
                                    )
                                  })}
                                </tbody>
                              </S.SaleFeed>
                            </S.FeedWrap>
                          )}
                          {sales.pages > 1 ? (
                            <S.ListFoot>
                              <span />
                              <Pager
                                page={page}
                                pages={sales.pages}
                                onChange={next => {
                                  trackStore('Shop Paged Store Table', { table: 'recent_sales', page: next + 1 })
                                  setPage(next)
                                }}
                                name="sales"
                              />
                            </S.ListFoot>
                          ) : null}
                        </S.Panel>
                      </S.Duo>
                    </>
                  ) : null}

                  {!tabbed || tab === 'collections' ? (
                    <>
                      {/* The standing nudge, above the list it is about. Only the copy differs from the one the
                 migration tool shows: here the reason to switch is that a discount cannot re-price a
                 listing quoted in MANA. */}
                      {stats.classic > 0 && !pricingDismissed ? (
                        <ManaPricingBanner
                          count={stats.classic}
                          reason="discounts"
                          to={withEnv('/activity?section=listings', env)}
                          onDismiss={() => {
                            trackStore('Shop Clicked Store Action', {
                              action: 'dismiss_pricing_banner',
                              classic_items: stats.classic
                            })
                            setPricingDismissed(true)
                          }}
                          onCta={() =>
                            trackStore('Shop Clicked Store Action', {
                              action: 'update_prices',
                              classic_items: stats.classic
                            })
                          }
                        />
                      ) : null}

                      <S.Panel aria-labelledby="store-coll-h">
                        <S.ListHead>
                          <S.PanelTitle id="store-coll-h">
                            {t('myStore.collectionsCount', { count: stats.collections.length })}
                          </S.PanelTitle>
                          <S.HeadActions>
                            {stats.collections.length > 1 ? (
                              <S.Sort
                                options={[
                                  { value: 'sold', label: t('myStore.sortSold') },
                                  { value: 'earned', label: t('myStore.sortEarned') },
                                  ...(stats.collections.some(c => c.createdAt)
                                    ? [{ value: 'newest', label: t('myStore.sortNewest') }]
                                    : []),
                                  { value: 'name', label: t('myStore.sortName') }
                                ]}
                                value={collectionSort ? undefined : sort}
                                placeholder={t('myStore.sortCustom')}
                                onChange={value => {
                                  trackStore('Shop Sorted Store Collections', { sort: value })
                                  setSort(value as Sort)
                                  setCollectionSort(null)
                                  setCollectionPage(0)
                                  rememberSort(value as Sort)
                                }}
                                align="right"
                                ariaLabel={t('myStore.sortBy')}
                                className="store-sort"
                              />
                            ) : null}
                            {/* The list's own call to action, where the design puts it: a creator who has just
                        read how their collections are doing is the one deciding to discount one. */}
                            {mock || (creatorSalesEnabled && session && saleable.length > 0) ? (
                              <Button
                                variant="red"
                                size="sm"
                                onClick={() => setSaleOpen(true)}
                                data-testid="store-new-discount"
                              >
                                {/* Decorative, and hidden from the accessible name: a reader announcing "fire,
                            create a discount" is worse than one that just says what the button does. */}
                                <span aria-hidden>🔥</span>
                                {t('myStore.newDiscount')}
                              </Button>
                            ) : null}
                          </S.HeadActions>
                        </S.ListHead>
                        {stats.collections.length === 0 ? (
                          <S.Empty>{t('myStore.noCollections')}</S.Empty>
                        ) : (
                          <>
                            <S.List ref={collectionsHeight.ref} style={collectionsHeight.style}>
                              <S.ColHead>
                                <span />
                                <span />
                                {(
                                  [
                                    ['name', t('myStore.colCollection'), 'asc'],
                                    null,
                                    ['claimed', t('myStore.colClaimed'), 'desc'],
                                    ['earnings', t('myStore.colEarnings'), 'desc'],
                                    [
                                      'sold',
                                      windowDays
                                        ? t('myStore.colTrend', { days: windowDays })
                                        : t('myStore.colTrendAll'),
                                      'desc'
                                    ]
                                  ] as ([CollectionColumn, string, SortDir] | null)[]
                                ).map((column, index) =>
                                  column ? (
                                    <span key={column[0]}>
                                      <SortHeader
                                        label={column[1]}
                                        dir={dirOf(collectionSort, column[0])}
                                        testId={`store-sort-collections-${column[0]}`}
                                        onSort={() => {
                                          const next = nextSort(collectionSort, column[0], column[2])
                                          trackStore('Shop Sorted Store Table', {
                                            table: 'collections',
                                            column: next.key,
                                            direction: next.dir
                                          })
                                          setCollectionSort(next)
                                          setCollectionPage(0)
                                        }}
                                      />
                                    </span>
                                  ) : (
                                    <span key={`plain-${index}`}>{t('myStore.colDiscounts')}</span>
                                  )
                                )}
                                <span>{t('myStore.colActions')}</span>
                              </S.ColHead>
                              {collectionsShown.map(collection => (
                                <CollectionRow
                                  key={collection.contractAddress}
                                  collection={collection}
                                  discount={discountByCollection.get(collection.contractAddress) ?? null}
                                  savesByKey={savesByKey}
                                  env={env}
                                  open={open.has(collection.contractAddress)}
                                  onToggle={() => {
                                    // Opening only: a collapse says nothing about what the creator went looking for.
                                    if (!open.has(collection.contractAddress)) {
                                      trackStore('Shop Expanded Store Collection', {
                                        contract_address: collection.contractAddress,
                                        items: collection.items.length,
                                        exhausted: collection.exhausted,
                                        has_discount: discountByCollection.has(collection.contractAddress)
                                      })
                                    }
                                    setOpen(current => {
                                      const next = new Set(current)
                                      if (!next.delete(collection.contractAddress)) next.add(collection.contractAddress)
                                      return next
                                    })
                                  }}
                                  onManage={() =>
                                    trackStore('Shop Clicked Store Action', {
                                      action: 'manage_collection',
                                      contract_address: collection.contractAddress
                                    })
                                  }
                                  onIssue={
                                    session
                                      ? item => {
                                          trackStore('Shop Clicked Store Action', {
                                            action: 'issue_copies',
                                            contract_address: collection.contractAddress
                                          })
                                          setIssuing({ item, contractAddress: collection.contractAddress })
                                        }
                                      : undefined
                                  }
                                />
                              ))}
                            </S.List>
                          </>
                        )}
                        {stats.collections.length > 0 ? (
                          <S.ListFoot>
                            <span data-testid="store-showing">
                              {t('myStore.showingOf', {
                                shown: collectionsShown.length.toLocaleString(),
                                total: stats.collections.length.toLocaleString()
                              })}
                              {/* The seam the old panel hint carried. A store past the fetch cap has trends and
                          per-collection figures built from part of the window, and saying so belongs
                          next to the count rather than nowhere. */}
                              {stats.breakdownPartial ? (
                                <> · {t('myStore.soldPartial', { n: stats.fetched.toLocaleString() })}</>
                              ) : null}
                            </span>
                            <Pager
                              page={collectionPageShown}
                              pages={collectionPages}
                              onChange={next => {
                                trackStore('Shop Paged Store Table', { table: 'collections', page: next + 1 })
                                setCollectionPage(next)
                              }}
                              name="collections"
                            />
                          </S.ListFoot>
                        ) : null}
                      </S.Panel>
                    </>
                  ) : null}

                  {!tabbed && (mock || creatorSalesEnabled) ? discountsPanel : null}

                  {!tabbed || tab === 'audience' ? (
                    <>
                      {tabbed ? null : (
                        <S.SectionHead>
                          <S.SectionTitle id="store-audience-h">{t('myStore.audience')}</S.SectionTitle>
                          <S.SectionSub>{t('myStore.audienceSub')}</S.SectionSub>
                        </S.SectionHead>
                      )}
                      <S.AudienceTiles>
                        <S.Tile>
                          <S.TileKey>
                            <span>
                              {t('myStore.tileCollectors')}
                              <Tooltip content={t('myStore.collectorsHint')}>
                                <S.Info
                                  type="button"
                                  aria-label={t('myStore.tileCollectors')}
                                  data-testid="store-collectors-hint"
                                >
                                  <Icon name="info" className="ico" aria-hidden />
                                </S.Info>
                              </Tooltip>
                            </span>
                            <S.TileMark aria-hidden>👥</S.TileMark>
                          </S.TileKey>
                          <S.TileValue data-testid="store-collectors">
                            {trend.collectors.total.toLocaleString()}
                          </S.TileValue>
                          <S.TileFoot>
                            {trend.collectors.total === 0 ? (
                              t('myStore.tileCollectorsNone')
                            ) : (
                              <>
                                {stats.breakdownPartial ? (
                                  <>
                                    <S.Estimate>{t('myStore.estimate')}</S.Estimate>{' '}
                                  </>
                                ) : null}
                                {trend.collectors.topSharePct >= 50
                                  ? t('myStore.tileCollectorsConcentrated', {
                                      // Rounded DOWN: a store where one address took 2,202 of 2,206 sales is not
                                      // "100% of your sales" while four other people are standing right there.
                                      pct: Math.floor(trend.collectors.topSharePct)
                                    })
                                  : t('myStore.tileCollectorsFoot', {
                                      repeat: trend.collectors.repeat,
                                      pct: Math.round(trend.collectors.repeatPct)
                                    })}
                              </>
                            )}
                          </S.TileFoot>
                        </S.Tile>
                        {stats.royalties ? (
                          <S.Tile>
                            <S.TileKey>
                              <span>
                                {t('myStore.tileRoyalties')}
                                <Tooltip content={t('myStore.royaltiesHint')}>
                                  <S.Info
                                    type="button"
                                    aria-label={t('myStore.tileRoyalties')}
                                    data-testid="store-royalties-hint"
                                  >
                                    <Icon name="info" className="ico" aria-hidden />
                                  </S.Info>
                                </Tooltip>
                              </span>
                              <S.TileMark aria-hidden>🤝</S.TileMark>
                            </S.TileKey>
                            <S.TileValue data-testid="store-royalties">
                              {/* Exact once the server reports what each resale paid; an estimate from volume before. */}
                              {stats.royalties.paidWei != null ? null : <S.Approx>≈</S.Approx>}
                              <CurrencyMark kind="mana" />
                              {mana(stats.royalties.paidWei ?? royaltyOf(stats.royalties.volumeWei))}
                              <S.TileUnit>{t('myStore.manaUnit')}</S.TileUnit>
                            </S.TileValue>
                            <S.TileFoot>
                              <DeltaTag delta={trend.royalties} period={period} />
                              {hasDelta(trend.royalties) ? null : (
                                <span>
                                  {tNode('myStore.tileRoyaltiesFoot', {
                                    m: (c: ReactNode) => (
                                      <>
                                        <CurrencyMark kind="mana" />
                                        {c}
                                      </>
                                    ),
                                    count: stats.royalties.resales,
                                    volume: mana(stats.royalties.volumeWei)
                                  })}
                                </span>
                              )}
                            </S.TileFoot>
                            {stats.royalties.resales > 0 ? (
                              <S.TileAction
                                type="button"
                                aria-expanded={royaltiesOpen}
                                aria-controls="store-royalties-panel"
                                onClick={() => {
                                  if (!royaltiesOpen)
                                    trackStore('Shop Clicked Store Action', { action: 'open_royalties' })
                                  setRoyaltiesOpen(open => !open)
                                  setRoyaltyPage(0)
                                }}
                                data-testid="store-royalties-open"
                              >
                                {t(royaltiesOpen ? 'myStore.royaltiesHide' : 'myStore.royaltiesShow')}
                                <Icon
                                  name="chevron-down"
                                  size={14}
                                  aria-hidden
                                  style={{ transform: royaltiesOpen ? 'rotate(180deg)' : undefined }}
                                />
                              </S.TileAction>
                            ) : null}
                          </S.Tile>
                        ) : null}
                      </S.AudienceTiles>

                      {royaltiesOpen ? (
                        <S.Panel
                          id="store-royalties-panel"
                          aria-labelledby="store-royalties-h"
                          data-testid="store-royalties-panel"
                        >
                          <S.PanelHead>
                            <S.PanelTitle id="store-royalties-h">{t('myStore.royaltiesTitle')}</S.PanelTitle>
                            <S.PanelHint>{t('myStore.royaltiesSub')}</S.PanelHint>
                          </S.PanelHead>
                          {!royalties ? (
                            royaltiesRead.isError ? (
                              <S.Empty data-testid="store-royalties-error">{t('myStore.royaltiesError')}</S.Empty>
                            ) : (
                              <S.Empty>{t('myStore.royaltiesLoading')}</S.Empty>
                            )
                          ) : royalties.total === 0 ? (
                            <S.Empty data-testid="store-royalties-none">{t('myStore.royaltiesNone')}</S.Empty>
                          ) : (
                            <S.FeedWrap ref={royaltiesHeight.ref} style={royaltiesHeight.style}>
                              <S.RoyaltyFeed>
                                <thead>
                                  <tr>
                                    <th scope="col">{t('myStore.colItem')}</th>
                                    <th scope="col">{t('myStore.colDate')}</th>
                                    <th scope="col">{t('myStore.colBuyer')}</th>
                                    <th scope="col" style={{ textAlign: 'right' }}>
                                      {t('myStore.colResoldFor')}
                                    </th>
                                    <th scope="col" style={{ textAlign: 'right' }}>
                                      {t('myStore.colRoyalty')}
                                    </th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {royalties.data.map(row => {
                                    const found =
                                      row.itemId === null
                                        ? undefined
                                        : itemsByKey.get(`${row.contractAddress.toLowerCase()}-${row.itemId}`)
                                    const face = royaltyProfiles?.get(row.buyer.toLowerCase())?.avatar?.snapshots
                                      ?.face256
                                    const at = { timestamp: row.timestamp }
                                    return (
                                      <tr key={row.id} data-testid="store-royalty">
                                        <td>
                                          <S.SaleItem
                                            as="a"
                                            {...(row.itemId
                                              ? {
                                                  href: appHref(itemHref(row.contractAddress, row.itemId, env)),
                                                  target: '_blank',
                                                  rel: 'noopener noreferrer'
                                                }
                                              : {})}
                                          >
                                            <S.SaleThumb style={{ backgroundImage: rarityMedia(found?.item.rarity) }}>
                                              {found?.item.thumbnail ? (
                                                <img src={found.item.thumbnail} alt="" loading="lazy" />
                                              ) : null}
                                            </S.SaleThumb>
                                            <S.SaleLines>
                                              <span>{found?.item.name ?? t('myStore.unknownItem')}</span>
                                              {found ? <small>{found.collection}</small> : null}
                                            </S.SaleLines>
                                          </S.SaleItem>
                                        </td>
                                        <td data-dim>{ago(row.timestamp)}</td>
                                        <td>
                                          <S.Buyer
                                            href={accountHref(row.buyer)}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                          >
                                            <S.Face
                                              style={face ? { backgroundImage: `url(${face})` } : undefined}
                                              aria-hidden
                                            />
                                            {buyerName(row.buyer, royaltyProfiles)}
                                          </S.Buyer>
                                        </td>
                                        <td data-money data-dim>
                                          <S.Money>
                                            <Amount
                                              wei={weiOf(row.priceWei)}
                                              usd={usdOfSale({ ...at, price: row.priceWei }, rateBook)}
                                            />
                                          </S.Money>
                                        </td>
                                        <td data-money data-testid="store-royalty-amount">
                                          <S.Money>
                                            <Amount
                                              wei={weiOf(row.royaltyWei)}
                                              usd={usdOfSale({ ...at, price: row.royaltyWei }, rateBook)}
                                            />
                                          </S.Money>
                                        </td>
                                      </tr>
                                    )
                                  })}
                                </tbody>
                              </S.RoyaltyFeed>
                            </S.FeedWrap>
                          )}
                          {royalties && royaltyPages > 1 ? (
                            <S.ListFoot>
                              <span>
                                {t('myStore.royaltiesCount', { count: royalties.total })}
                                {' · '}
                                <CurrencyMark kind="mana" />
                                {mana(weiOf(royalties.royaltiesWei))}
                              </span>
                              <Pager
                                page={Math.min(royaltyPage, royaltyPages - 1)}
                                pages={royaltyPages}
                                onChange={next => {
                                  trackStore('Shop Paged Store Table', { table: 'royalties', page: next + 1 })
                                  setRoyaltyPage(next)
                                }}
                                name="royalties"
                              />
                            </S.ListFoot>
                          ) : null}
                        </S.Panel>
                      ) : null}

                      <S.Panel aria-labelledby="store-buyers-h">
                        <S.PanelHead>
                          <S.PanelTitle id="store-buyers-h">{t('myStore.buyers')}</S.PanelTitle>
                          <S.PanelHint>{t('myStore.buyersHint')}</S.PanelHint>
                        </S.PanelHead>
                        {trend.buyers.length === 0 ? (
                          <S.Empty data-testid="store-buyers-none">{t('myStore.noBuyers')}</S.Empty>
                        ) : (
                          <S.FeedWrap ref={buyersHeight.ref} style={buyersHeight.style}>
                            <S.BuyerFeed>
                              <thead>
                                <tr>
                                  <th scope="col">{t('myStore.colBuyer')}</th>
                                  {(
                                    [
                                      ['items', t('myStore.colItems'), 'desc'],
                                      ['collections', t('myStore.colCollections'), 'desc'],
                                      ['last', t('myStore.colLast'), 'desc'],
                                      ['spent', t('myStore.colSpent'), 'desc']
                                    ] as [BuyerColumn, string, SortDir][]
                                  ).map(([key, label, first]) => (
                                    <th
                                      key={key}
                                      scope="col"
                                      style={key === 'spent' ? { textAlign: 'right' } : undefined}
                                      aria-sort={ariaSort(dirOf(buyerSort, key))}
                                    >
                                      <SortHeader
                                        label={label}
                                        dir={dirOf(buyerSort, key)}
                                        align={key === 'spent' ? 'right' : 'left'}
                                        testId={`store-sort-buyers-${key}`}
                                        onSort={() => {
                                          const next = nextSort(buyerSort, key, first)
                                          trackStore('Shop Sorted Store Table', {
                                            table: 'buyers',
                                            column: next.key,
                                            direction: next.dir
                                          })
                                          setBuyerSort(next)
                                          setBuyerPage(0)
                                        }}
                                      />
                                    </th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody>
                                {buyersShown.map(buyer => {
                                  const face = audience?.get(buyer.address)?.avatar?.snapshots?.face256
                                  return (
                                    <tr key={buyer.address} data-testid="store-buyer">
                                      <td>
                                        <S.Buyer
                                          href={accountHref(buyer.address)}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          onClick={() =>
                                            trackStore('Shop Clicked Store Action', {
                                              action: 'open_buyer',
                                              table: 'buyers'
                                            })
                                          }
                                          data-testid="store-buyer-name"
                                        >
                                          <S.Face
                                            style={face ? { backgroundImage: `url(${face})` } : undefined}
                                            aria-hidden
                                          />
                                          {buyerName(buyer.address, audience)}
                                        </S.Buyer>
                                      </td>
                                      {/* Distinct items and collections, not sales: nine copies of one item and
                                    one thing from each of nine collections are different customers, and the
                                    count of sales reads them the same. */}
                                      <td data-dim>{t('myStore.buyerItems', { count: buyer.items })}</td>
                                      <td data-dim>{t('myStore.buyerCollections', { count: buyer.collections })}</td>
                                      <td data-dim>{ago(buyer.lastAt)}</td>
                                      <td data-money>
                                        <S.Money>
                                          <Amount wei={buyer.spentWei} usd={buyerUsd(buyer)} />
                                        </S.Money>
                                      </td>
                                    </tr>
                                  )
                                })}
                              </tbody>
                            </S.BuyerFeed>
                          </S.FeedWrap>
                        )}
                        {buyerPages > 1 ? (
                          <S.ListFoot>
                            <span />
                            <Pager
                              page={buyerPageShown}
                              pages={buyerPages}
                              onChange={next => {
                                trackStore('Shop Paged Store Table', { table: 'buyers', page: next + 1 })
                                setBuyerPage(next)
                              }}
                              name="buyers"
                            />
                          </S.ListFoot>
                        ) : null}
                      </S.Panel>

                      {/* Hidden when the read fails for any reason other than size: before the server ships the
                  endpoint there is nothing to show, and a panel that only ever says "unavailable" is noise. */}
                      {owners || ownersRead.error instanceof TopOwnersUnavailableError ? (
                        <S.Panel aria-labelledby="store-owners-h" data-testid="store-owners-panel">
                          <S.PanelHead>
                            <S.PanelTitle id="store-owners-h">{t('myStore.owners')}</S.PanelTitle>
                            <S.HeadRight>
                              <S.PanelHint>{t('myStore.ownersHint')}</S.PanelHint>
                              {(session || mock) && owners && owners.total > 0 ? (
                                <Button
                                  variant="red"
                                  size="sm"
                                  onClick={() => {
                                    trackStore('Shop Clicked Store Action', { action: 'reward_owners' })
                                    setRewardOpen(true)
                                  }}
                                  data-testid="store-reward-owners"
                                >
                                  <span aria-hidden>🎁</span>
                                  {t('myStore.rewardOwners')}
                                </Button>
                              ) : null}
                            </S.HeadRight>
                          </S.PanelHead>
                          {!owners ? (
                            <S.Empty data-testid="store-owners-unavailable">{t('myStore.ownersUnavailable')}</S.Empty>
                          ) : owners.total === 0 ? (
                            <S.Empty data-testid="store-owners-none">{t('myStore.noOwners')}</S.Empty>
                          ) : (
                            <S.FeedWrap ref={ownersHeight.ref} style={ownersHeight.style}>
                              <S.OwnerFeed>
                                <thead>
                                  <tr>
                                    <th scope="col">{t('myStore.colOwner')}</th>
                                    {OWNER_COLUMNS.map(({ key, label, first }) => (
                                      <th
                                        key={key}
                                        scope="col"
                                        style={key === 'spent' ? { textAlign: 'right' } : undefined}
                                        aria-sort={ariaSort(dirOf(ownerSort, key))}
                                      >
                                        <SortHeader
                                          label={t(label)}
                                          dir={dirOf(ownerSort, key)}
                                          align={key === 'spent' ? 'right' : 'left'}
                                          testId={`store-sort-owners-${key}`}
                                          onSort={() => {
                                            const next = nextSort(ownerSort, key, first)
                                            trackStore('Shop Sorted Store Table', {
                                              table: 'owners',
                                              column: next.key,
                                              direction: next.dir
                                            })
                                            setOwnerSort(next)
                                            setOwnerPage(0)
                                          }}
                                        />
                                      </th>
                                    ))}
                                  </tr>
                                </thead>
                                <tbody>
                                  {owners.data.map(owner => {
                                    const face = ownerProfiles?.get(owner.address)?.avatar?.snapshots?.face256
                                    return (
                                      <tr key={owner.address} data-testid="store-owner">
                                        <td>
                                          <S.Buyer
                                            href={accountHref(owner.address)}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            onClick={() =>
                                              trackStore('Shop Clicked Store Action', {
                                                action: 'open_owner',
                                                table: 'owners'
                                              })
                                            }
                                            data-testid="store-owner-name"
                                          >
                                            <S.Face
                                              style={face ? { backgroundImage: `url(${face})` } : undefined}
                                              aria-hidden
                                            />
                                            {buyerName(owner.address, ownerProfiles)}
                                          </S.Buyer>
                                        </td>
                                        <td data-testid="store-owner-nfts">{owner.nfts.toLocaleString()}</td>
                                        <td data-dim>{t('myStore.buyerItems', { count: owner.items })}</td>
                                        <td data-dim>{t('myStore.buyerCollections', { count: owner.collections })}</td>
                                        <td data-dim>{ago(owner.lastAcquiredAt)}</td>
                                        <td data-money>
                                          <S.Money>
                                            <CurrencyMark kind="mana" />
                                            {mana(weiOf(owner.spentWei))}
                                          </S.Money>
                                        </td>
                                      </tr>
                                    )
                                  })}
                                </tbody>
                              </S.OwnerFeed>
                            </S.FeedWrap>
                          )}
                          {owners && ownerPages > 1 ? (
                            <S.ListFoot>
                              <span>{t('myStore.ownersCount', { count: owners.total })}</span>
                              <Pager
                                page={ownerPage}
                                pages={ownerPages}
                                onChange={next => {
                                  trackStore('Shop Paged Store Table', { table: 'owners', page: next + 1 })
                                  setOwnerPage(next)
                                }}
                                name="owners"
                              />
                            </S.ListFoot>
                          ) : null}
                        </S.Panel>
                      ) : null}
                    </>
                  ) : null}
                </>
              )}
            </S.TabPanel>
          </S.Root>
        </CurrencyContext.Provider>
      </A.Main>
    </A.Root>
  )
}

export default MyStore
