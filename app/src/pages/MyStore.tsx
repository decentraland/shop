import { useId, useMemo, useState, type ReactNode } from 'react'
import { Link, Navigate, useSearchParams } from 'react-router-dom'
import { useWallet } from '~/store/wallet'
import { useSeo } from '~/hooks/useSeo'
import { useStoreStats, type StoreCollection, type StoreItem, type StorePeriod } from '~/hooks/useStoreStats'
import { useCreatorSales } from '~/hooks/useCreatorSales'
import { isSaleCapped, type CreatorSale } from '~/lib/coupons'
import { useCreatorSalesEnabled } from '~/hooks/useCreatorSalesEnabled'
import { useMyStoreAccess } from '~/hooks/useMyStoreEnabled'
import { CollectionThumb } from '~/components/CollectionThumb'
import { CreatorSaleModal } from '~/components/CreatorSaleModal'
import { SaleTag } from '~/components/SaleTag'
import { SaleTimer } from '~/components/SaleTimer'
import { CurrencyMark } from '~/components/CurrencyMark'
import { ManaPricingBanner } from '~/components/ManaPricingBanner'
import { Price } from '~/components/Price'
import { Tooltip } from '~/components/Tooltip'
import { Icon } from '~/components/Icon'
import { Button } from '~/components/Button'
import { ErrorNotice } from '~/components/ErrorNotice'
import { useQuery } from '@tanstack/react-query'
import { rarityColor, rarityDescription, rarityLabel, rarityMedia } from '~/lib/rarity'
import { fetchProfiles, type ProfileAvatar } from '~/lib/profile'
import { useProfile } from '~/hooks/useProfile'
import { fetchSalesPage, weiOf } from '~/lib/sales'
import { bestSellers } from '~/lib/storeMetrics'
import type { Delta } from '~/lib/storeMetrics'
import { config } from '~/config'
import { shortAddress } from '~/lib/address'
import { capitalizeFirst } from '~/lib/text'
import { mockBuyers, mockCollectors, mockSaleRows, mockSales, mockSaves, mockStats } from '~/lib/storeMock'
import { theme } from '~/styles/theme'
import { t, tNode } from '~/intl/i18n'
import { EmptyState, EmptyStateCentered } from '~/components/EmptyState'
import signInIllustration from '~/assets/empty/signin-empty.svg'
import * as A from '~/styles/browseLayout.styles'
import * as S from './MyStore.styles'

const PERIODS: StorePeriod[] = ['7d', '30d', 'all']

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

type Sort = 'sold' | 'selling' | 'newest' | 'name'

const SORT_KEY = 'shop.my-store.sort'
const SORTS: Sort[] = ['sold', 'selling', 'newest', 'name']

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

/** How the collections list is ordered. `newest` only appears when the source dates the items. */
function sortCollections(collections: StoreCollection[], by: Sort): StoreCollection[] {
  const sorted = [...collections]
  if (by === 'name') return sorted.sort((a, b) => a.name.localeCompare(b.name))
  if (by === 'newest') return sorted.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))
  // Collections with nothing left to sell go last whatever they once sold: they are the rows a creator
  // has no move left on, and at the top they push down the ones they do.
  if (by === 'selling') {
    return sorted.sort(
      (a, b) => Number(a.exhausted) - Number(b.exhausted) || b.sold - a.sold || a.name.localeCompare(b.name)
    )
  }
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

/**
 * Rows per page of the sales table.
 *
 * Five, because the table now shares its row with the best sellers and the two are read side by side; the
 * feed is still paged rather than capped, so all of it is reachable without leaving the page, and "view
 * all" is the way to the full history where it can be filtered.
 */
const SALES_PER_PAGE = 5

/**
 * The page numbers to draw around the current one.
 *
 * A store with 183 pages cannot show them all, so it shows the ends, the neighbours, and an ellipsis for
 * whatever is skipped — the reader always knows where they are and how far it goes.
 */
/**
 * Which page numbers to draw. Five slots at most: past that the row stops reading as a control and starts
 * reading as a list of its own.
 */
function pageWindow(page: number, pages: number): (number | 'gap')[] {
  if (pages <= 5) return Array.from({ length: pages }, (_, i) => i)
  const around = [page - 1, page, page + 1].filter(n => n > 0 && n < pages - 1)
  const out: (number | 'gap')[] = [0]
  if (around[0] > 1) out.push('gap')
  out.push(...around)
  if (around[around.length - 1] < pages - 2) out.push('gap')
  out.push(pages - 1)
  return out
}

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
function useSalesPage(address: string | undefined, period: StorePeriod, page: number) {
  const days = { '7d': 7, '30d': 30, all: null }[period]
  const now = useMemo(() => Math.floor(Date.now() / 86_400_000) * 86_400_000 + 86_400_000 - 1, [])
  const from = days ? now - days * 86_400_000 : undefined
  const query = useQuery({
    queryKey: ['store-sales-page', address, period, page],
    enabled: !!address,
    // Keeps the previous page on screen while the next one loads, so the table does not blink empty.
    placeholderData: previous => previous,
    queryFn: () => fetchSalesPage({ seller: address, from }, { first: SALES_PER_PAGE, skip: page * SALES_PER_PAGE })
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

function buyerName(address: string, profiles?: Map<string, ProfileAvatar>): string {
  const name = profiles?.get(address.toLowerCase())?.name
  return name ? capitalizeFirst(name) : shortAddress(address)
}

/**
 * `?mock=1` — the invented store, for looking at states no real account shows at once.
 *
 * Gated on {@link config.previewHost} together with `?viewAs=` below: on everywhere but the live Shop and
 * staging. Neither override reaches anything private — the public catalogue is the same feed the
 * marketplace serves to anybody, and the invented store is invented.
 */
function previewMock(raw: string | null): boolean {
  return config.previewHost && raw === '1'
}

/**
 * `?viewAs=0x…` — read another creator's store from the public feeds.
 *
 * It exists because the page cannot otherwise be judged: the only store a signed-in creator can open is
 * their own, and a test account with no sales is the one shape this design must not be tuned for. It is
 * also how a preview link shows a real store to somebody who does not own it, which is what review needs.
 */
function previewViewAs(raw: string | null): string | null {
  if (!config.previewHost || !raw) return null
  const address = raw.trim().toLowerCase()
  return /^0x[0-9a-f]{40}$/.test(address) ? address : null
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
  env
}: {
  collection: StoreCollection
  discount: CreatorSale | null
  /** Saves by item key, for the expanded rows. */
  savesByKey: Map<string, number>
  open: boolean
  onToggle: () => void
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
        {/* How much of the run has gone, not what sold in the window: a fraction of supply does not move
            when the period selector does, and the trend beside it is what answers for the window. */}
        <S.Claimed data-testid="store-collection-claimed">
          {collection.claimed.toLocaleString()}
          <small>/{collection.runTotal.toLocaleString()}</small>
        </S.Claimed>
        <S.SparkCell>
          <Sparkline series={collection.trend} />
        </S.SparkCell>
        <S.Earned data-testid="store-collection-earned">
          <CurrencyMark kind="mana" />
          {mana(collection.earningsWei)}
        </S.Earned>
        <S.DiscountCell data-testid="store-collection-discount">
          {discount ? (
            <>
              <S.DiscountTop>
                {/* Wrapped rather than reached into: the tag pins itself to the start of a column so it
                    hugs its content elsewhere, and a centred cell needs a flex item it owns. */}
                <span>
                  <SaleTag pct={discount.discount / 10_000} />
                </span>
                <SaleTimer until={discount.checks.expiration} />
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
        <S.ManageBtn
          as="a"
          href={`${config.builderUrl}/collections/${collection.collectionId}`}
          target="_blank"
          rel="noopener noreferrer"
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
                <CurrencyMark kind="mana" />
                {mana(collection.earningsWei)}
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
function DeltaTag({ delta, period }: { delta: Delta | null; period: StorePeriod }) {
  if (!delta || (delta.current === 0 && delta.previous === 0)) return null
  const against = period === 'all' ? '' : t(`myStore.vs${period}`)
  if (delta.pct === null) {
    return (
      <S.Delta data-dir="new" data-testid="store-delta" title={against}>
        {t('myStore.deltaNew')}
      </S.Delta>
    )
  }
  const rounded = Math.round(delta.pct)
  if (rounded === 0) {
    return (
      <S.Delta data-dir="flat" data-testid="store-delta" title={against}>
        {t('myStore.deltaFlat')}
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
      title={against}
      aria-label={t(up ? 'myStore.deltaUpAria' : 'myStore.deltaDownAria', { pct: amount, against })}
    >
      <span aria-hidden>{up ? '\u25b2' : '\u25bc'}</span>
      {amount}
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
      <S.Columns style={{ marginTop: 22 }}>
        <S.Panel>
          <S.PanelHead>
            <S.Bar style={{ width: 96, height: 14 }} />
            <S.Bar style={{ width: 120 }} />
          </S.PanelHead>
          {Array.from({ length: COLLECTIONS_SHOWN }, (_, i) => (
            <S.CollRow key={i}>
              <span />
              <S.Dot />
              <S.Bar style={{ width: '58%', height: 14 }} />
              <S.Bar />
              <S.Bar style={{ height: 20 }} />
              <S.Bar style={{ width: 96, height: 32, borderRadius: 8 }} />
            </S.CollRow>
          ))}
          {/* The list's own way out: a store past the first page keeps this row, and the panel keeps its
              height when the rows arrive. */}
          <S.More as="div">
            <S.Bar style={{ width: 150, height: 13, margin: '0 auto' }} />
          </S.More>
        </S.Panel>

        <S.Side>
          <S.Panel>
            <S.PanelHead>
              <S.Bar style={{ width: 110, height: 14 }} />
            </S.PanelHead>
            {[0, 1, 2].map(i => (
              <S.AttnRow key={i}>
                <S.Stripe />
                <S.AttnText>
                  <S.Bar style={{ width: '44%', height: 13 }} />
                  <S.Bar style={{ width: '70%', marginTop: 6 }} />
                </S.AttnText>
                <S.Bar style={{ width: 22, height: 18 }} />
              </S.AttnRow>
            ))}
          </S.Panel>
        </S.Side>
      </S.Columns>

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
        {Array.from({ length: SALES_PER_PAGE }, (_, i) => (
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
  const [params] = useSearchParams()
  const [period, setPeriod] = useState<StorePeriod>('30d')
  // A set, not one id: opening a second collection to compare it with the first should not close the first.
  const [open, setOpen] = useState<ReadonlySet<string>>(() => new Set())
  const [collectionPage, setCollectionPage] = useState(0)
  const [page, setPage] = useState(0)
  const [saleOpen, setSaleOpen] = useState(false)
  const [sort, setSort] = useState<Sort>(storedSort)
  const [buyerPage, setBuyerPage] = useState(0)
  /**
   * Dismissing the pricing nudge lasts this visit only, deliberately not persisted: the listings it is
   * about are still priced in MANA tomorrow, and a creator who waved it away last week should not be left
   * wondering why a discount will not reach them. Same rule My Items applies to the same banner.
   */
  const [pricingDismissed, setPricingDismissed] = useState(false)
  const creatorSalesEnabled = useCreatorSalesEnabled()
  const access = useMyStoreAccess()
  const mock = previewMock(params.get('mock'))
  const viewAs = previewViewAs(params.get('viewAs'))
  const env = params.get('env')
  const { data: profile } = useProfile(viewAs ?? session?.address)
  const face = profile?.avatar?.snapshots?.face256
  const creatorName = profile?.name ? capitalizeFirst(profile.name) : null
  const {
    stats: liveStats,
    trend: liveTrend,
    savesByKey: liveSaves,
    saleable,
    isLoading: liveLoading,
    error: statsError
  } = useStoreStats(session, period, viewAs)
  // The invented store replaces what the reads return, not the page that draws them: every state below
  // is exercised by the same code a real creator gets.
  const stats = mock ? mockStats : liveStats
  const trend = mock ? { ...liveTrend, collectors: mockCollectors, buyers: mockBuyers, quietDays: 12 } : liveTrend
  const isLoading = mock ? false : liveLoading
  const savesByKey = mock ? mockSaves : liveSaves
  const sales = useSalesPage(viewAs ?? session?.address, period, page)
  const salesRows = mock ? mockSaleRows : sales.rows
  const saleAddresses = useMemo(() => [...new Set(salesRows.map(row => row.buyer.toLowerCase()))].sort(), [salesRows])
  const { data: buyers, isLoading: buyersLoading } = useBuyerNames(saleAddresses)
  const buyerPages = Math.max(1, Math.ceil(trend.buyers.length / BUYERS_PER_PAGE))
  const buyersShown = useMemo(
    () => trend.buyers.slice(buyerPage * BUYERS_PER_PAGE, (buyerPage + 1) * BUYERS_PER_PAGE),
    [trend.buyers, buyerPage]
  )
  // Only the faces on screen: a store with hundreds of customers would otherwise ask for hundreds of
  // profiles to draw a page of five rows.
  const audienceAddresses = useMemo(() => buyersShown.map(b => b.address).sort(), [buyersShown])
  const { data: audience } = useBuyerNames(audienceAddresses)
  const { data: discounts } = useCreatorSales(
    viewAs ?? session?.address,
    creatorSalesEnabled && (!!session || !!viewAs)
  )

  // The flag closes the page, not just the nav entry — otherwise the link is off and the URL is still live.
  // Only once the read has ANSWERED no: a pending read is not an answer, and bouncing on it would send
  // every visitor home before the flag file arrives, or before the wallet an allowlist is checked against
  // has been read back.
  /**
   * The order actually in force, which is not always the one that was remembered.
   *
   * "Still selling first" is only offered while some collection is finished, and the choice outlives the
   * store it was made in: a creator who picks it, then opens a store where everything still sells, would
   * otherwise leave the dropdown pointing at an option no longer in its own list.
   */
  const hasExhausted = (stats?.collections ?? []).some(c => c.exhausted)
  const sortInForce: Sort = sort === 'selling' && !hasExhausted ? 'sold' : sort
  /** Sorted once per change rather than on every render; a store can carry a few dozen collections. */
  const collectionPages = Math.max(1, Math.ceil((stats?.collections.length ?? 0) / COLLECTIONS_SHOWN))
  const sortedCollections = useMemo(() => sortCollections(stats?.collections ?? [], sortInForce), [stats, sortInForce])

  /** What is selling across the whole store, which the per-collection ordering cannot answer. */
  const best = useMemo(() => bestSellers(stats?.collections ?? []), [stats])

  /** One page of that order, so a store with fifty collections opens on eight rather than on all of them. */
  const collectionsShown = useMemo(
    () => sortedCollections.slice(collectionPage * COLLECTIONS_SHOWN, (collectionPage + 1) * COLLECTIONS_SHOWN),
    [sortedCollections, collectionPage]
  )

  if (access === 'off') return <Navigate to="/" replace />

  if (!session && !viewAs && !mock) {
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

  /** How long the chosen window is, where it has a length at all. All time does not. */
  const windowDays = period === '7d' ? 7 : period === '30d' ? 30 : null

  const items = (stats?.collections ?? []).reduce((n, c) => n + c.items.length, 0)

  return (
    <A.Root>
      <A.Main>
        <S.Root data-testid="my-store">
          {saleOpen && session ? (
            <CreatorSaleModal session={session} collections={saleable} onClose={() => setSaleOpen(false)} />
          ) : null}

          <S.Masthead>
            <S.Identity>
              <S.Avatar
                style={face ? { backgroundImage: `url(${face})` } : undefined}
                data-testid="store-avatar"
                aria-hidden
              />
              <div>
                <S.Eyebrow>
                  {t('myStore.eyebrow')}
                  {creatorName ? <S.Who>{creatorName}</S.Who> : null}
                </S.Eyebrow>
                <S.Title>{t('myStore.title')}</S.Title>
                {/* The line holds its place while the figures load, so the masthead does not grow a row under
                  the reader. */}
                {stats ? (
                  <S.Sub>{t('myStore.summary', { collections: stats.collections.length, items })}</S.Sub>
                ) : (
                  <S.Sub>
                    <S.Bar style={{ width: 170, background: 'rgba(252, 252, 252, 0.18)', animation: 'none' }} />
                  </S.Sub>
                )}
              </div>
            </S.Identity>
            <S.Periods role="group" aria-label={t('myStore.period')}>
              {PERIODS.map(key => (
                <S.Period
                  key={key}
                  type="button"
                  aria-pressed={period === key}
                  onClick={() => {
                    setPeriod(key)
                    setPage(0)
                  }}
                  data-testid={`store-period-${key}`}
                >
                  {t(`myStore.period${key}`)}
                </S.Period>
              ))}
            </S.Periods>
          </S.Masthead>

          {viewAs ? (
            <S.Preview data-testid="store-view-as">{t('myStore.viewingAs', { address: viewAs })}</S.Preview>
          ) : null}

          <ErrorNotice message={statsError ? t('myStore.error') : null} testId="my-store-error" />

          {isLoading || !stats ? (
            <StoreSkeleton />
          ) : (
            <>
              <S.Tiles aria-label={t('myStore.summaryAria')}>
                <S.Tile>
                  <S.TileKey>
                    {t('myStore.tileSold')}
                    <DeltaTag delta={trend.sold} period={period} />
                    <S.TileMark aria-hidden>🛍️</S.TileMark>
                  </S.TileKey>
                  <S.TileValue>
                    <span data-testid="store-sold">{stats.sold.toLocaleString()}</span>
                  </S.TileValue>
                  <S.TileFoot>
                    {stats.sold === 0
                      ? t('myStore.tileSoldNone')
                      : stats.resales === 0
                        ? // "0 resold by you" is a fact about nothing. Most stores never resell, so for most
                          // of them that clause was half the line and all of it noise.
                          t('myStore.tileSoldFootMintsOnly', { mints: stats.mints })
                        : t('myStore.tileSoldFoot', { mints: stats.mints, resales: stats.resales })}
                  </S.TileFoot>
                </S.Tile>
                <S.Tile>
                  <S.TileKey>
                    {t('myStore.tileEarnings')}
                    <DeltaTag delta={trend.earnings} period={period} />
                    <S.TileMark aria-hidden>💰</S.TileMark>
                  </S.TileKey>
                  <S.TileValue>
                    <CurrencyMark kind="mana" />
                    {mana(stats.earningsWei)}
                    <S.TileUnit>{t('myStore.manaUnit')}</S.TileUnit>
                  </S.TileValue>
                  <S.TileFoot>
                    {stats.partial ? (
                      <>
                        <S.Estimate>{t('myStore.estimate')}</S.Estimate> {t('myStore.tileEarningsPartial')}
                      </>
                    ) : (
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
                  <S.TileFoot>
                    {running.length > 0 ? t('myStore.tileDiscountsFoot') : t('myStore.tileDiscountsNone')}
                  </S.TileFoot>
                </S.Tile>
              </S.Tiles>

              {/* The standing nudge, above the list it is about. Only the copy differs from the one the
                 migration tool shows: here the reason to switch is that a discount cannot re-price a
                 listing quoted in MANA. */}
              {stats.classic > 0 && !pricingDismissed ? (
                <ManaPricingBanner
                  count={stats.classic}
                  reason="discounts"
                  to={withEnv('/activity?section=listings', env)}
                  onDismiss={() => setPricingDismissed(true)}
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
                          ...(hasExhausted ? [{ value: 'selling', label: t('myStore.sortSelling') }] : []),
                          ...(stats.collections.some(c => c.createdAt)
                            ? [{ value: 'newest', label: t('myStore.sortNewest') }]
                            : []),
                          { value: 'name', label: t('myStore.sortName') }
                        ]}
                        value={sortInForce}
                        onChange={value => {
                          setSort(value as Sort)
                          rememberSort(value as Sort)
                        }}
                        align="right"
                        ariaLabel={t('myStore.sortBy')}
                        className="store-sort"
                      />
                    ) : null}
                    {/* The list's own call to action, where the design puts it: a creator who has just
                        read how their collections are doing is the one deciding to discount one. */}
                    {mock || (creatorSalesEnabled && !viewAs && session && saleable.length > 0) ? (
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
                    <S.ColHead aria-hidden>
                      <span />
                      <span />
                      <span>{t('myStore.colCollection')}</span>
                      <span>{t('myStore.colSales')}</span>
                      <span>{windowDays ? t('myStore.colTrend', { days: windowDays }) : t('myStore.colTrendAll')}</span>
                      <span>{t('myStore.colEarnings')}</span>
                      <span>{t('myStore.colDiscounts')}</span>
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
                        onToggle={() =>
                          setOpen(current => {
                            const next = new Set(current)
                            if (!next.delete(collection.contractAddress)) next.add(collection.contractAddress)
                            return next
                          })
                        }
                      />
                    ))}
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
                      page={collectionPage}
                      pages={collectionPages}
                      onChange={setCollectionPage}
                      name="collections"
                    />
                  </S.ListFoot>
                ) : null}
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
                    <S.FeedWrap>
                      <S.BestFeed>
                        <thead>
                          <tr>
                            <th scope="col">
                              <S.RankCell>
                                <S.Rank aria-hidden>#</S.Rank>
                                {t('myStore.colItem')}
                              </S.RankCell>
                            </th>
                            <th scope="col">{t('myStore.colCollection')}</th>
                            <th scope="col" style={{ textAlign: 'center' }}>
                              {t('myStore.colSold')}
                            </th>
                            <th scope="col" style={{ textAlign: 'right' }}>
                              {t('myStore.colEarnings')}
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {best.map((entry, index) => (
                            <tr key={entry.key} data-testid="store-best">
                              <td>
                                <S.RankCell>
                                  <S.Rank>{index + 1}</S.Rank>
                                  <S.SaleItem
                                    as="a"
                                    {...{
                                      href: itemHref(entry.contractAddress, entry.itemId, env),
                                      target: '_blank',
                                      rel: 'noopener noreferrer',
                                      'data-testid': 'store-best-item'
                                    }}
                                  >
                                    <S.SaleThumb style={{ backgroundImage: rarityMedia(entry.rarity) }}>
                                      {entry.thumbnail ? <img src={entry.thumbnail} alt="" loading="lazy" /> : null}
                                    </S.SaleThumb>
                                    <span>{entry.name}</span>
                                  </S.SaleItem>
                                </S.RankCell>
                              </td>
                              <td data-dim>{entry.collectionName}</td>
                              <td style={{ textAlign: 'center', fontWeight: 600 }} data-testid="store-best-sold">
                                {entry.sold.toLocaleString()}
                              </td>
                              <td data-money>
                                <S.Money>
                                  <CurrencyMark kind="mana" />
                                  {mana(entry.earnedWei)}
                                </S.Money>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </S.BestFeed>
                    </S.FeedWrap>
                  )}
                </S.Panel>

                <S.Panel aria-labelledby="store-feed-h">
                  <S.PanelHeadStack>
                    <div>
                      <S.PanelTitle id="store-feed-h">{t('myStore.recentSales')}</S.PanelTitle>
                      <S.PanelSub>{t('myStore.recentSalesSub', { n: salesRows.length })}</S.PanelSub>
                    </div>
                    <S.ViewAll to="/activity">
                      {t('myStore.viewAll')}
                      <Icon name="arrow-up-right" size={14} aria-hidden />
                    </S.ViewAll>
                  </S.PanelHeadStack>
                  {salesRows.length === 0 ? (
                    <S.Empty>{t('myStore.noSales')}</S.Empty>
                  ) : (
                    <S.FeedWrap>
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
                                          href: itemHref(row.contractAddress, row.itemId, env),
                                          target: '_blank',
                                          rel: 'noopener noreferrer',
                                          'data-testid': 'store-sale-item'
                                        }
                                      : {})}
                                  >
                                    <S.SaleThumb style={{ backgroundImage: rarityMedia(item?.rarity) }}>
                                      {item?.thumbnail ? <img src={item.thumbnail} alt="" loading="lazy" /> : null}
                                    </S.SaleThumb>
                                    <S.SaleLines>
                                      <span>
                                        {item?.name ?? collection?.name ?? row.itemId ?? t('myStore.unknownItem')}
                                      </span>
                                      {/* The kind lost its own column to the collection, and it is the one fact
                                          about a row that nothing else on the page can answer. */}
                                      <Tooltip content={t('myStore.kindHint')}>
                                        <S.Kind data-kind={row.type} data-testid="store-kind-hint">
                                          {row.type === 'mint' ? t('myStore.kindMint') : t('myStore.kindResale')}
                                        </S.Kind>
                                      </Tooltip>
                                    </S.SaleLines>
                                  </S.SaleItem>
                                </td>
                                <td data-dim>{collection?.name ?? '—'}</td>
                                <td data-money>
                                  <S.Money>
                                    <CurrencyMark kind="mana" />
                                    {mana(weiOf(row.price))}
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
                                      href={`${config.profileUrl}/${row.buyer}`}
                                      target="_blank"
                                      rel="noopener noreferrer"
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
                      <Pager page={page} pages={sales.pages} onChange={setPage} name="sales" />
                    </S.ListFoot>
                  ) : null}
                </S.Panel>
              </S.Duo>

              <S.SectionHead>
                <S.SectionTitle id="store-audience-h">{t('myStore.audience')}</S.SectionTitle>
                <S.SectionSub>{t('myStore.audienceSub')}</S.SectionSub>
              </S.SectionHead>

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
                  <S.TileValue data-testid="store-collectors">{trend.collectors.total.toLocaleString()}</S.TileValue>
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
                      <DeltaTag delta={trend.royalties} period={period} />
                      <S.TileMark aria-hidden>🔁</S.TileMark>
                    </S.TileKey>
                    <S.TileValue data-testid="store-royalties">
                      <S.Approx>≈</S.Approx>
                      <CurrencyMark kind="mana" />
                      {mana(royaltyOf(stats.royalties.volumeWei))}
                    </S.TileValue>
                    <S.TileFoot>
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
                    </S.TileFoot>
                  </S.Tile>
                ) : null}
              </S.AudienceTiles>

              <S.Panel aria-labelledby="store-buyers-h">
                <S.PanelHead>
                  <S.PanelTitle id="store-buyers-h">{t('myStore.buyers')}</S.PanelTitle>
                  <S.PanelHint>{t('myStore.buyersHint')}</S.PanelHint>
                </S.PanelHead>
                {trend.buyers.length === 0 ? (
                  <S.Empty data-testid="store-buyers-none">{t('myStore.noBuyers')}</S.Empty>
                ) : (
                  <S.FeedWrap>
                    <S.BuyerFeed>
                      <thead>
                        <tr>
                          <th scope="col">{t('myStore.colBuyer')}</th>
                          <th scope="col">{t('myStore.colItems')}</th>
                          <th scope="col">{t('myStore.colCollections')}</th>
                          <th scope="col">{t('myStore.colLast')}</th>
                          <th scope="col" style={{ textAlign: 'right' }}>
                            {t('myStore.colSpent')}
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {buyersShown.map(buyer => {
                          const face = audience?.get(buyer.address)?.avatar?.snapshots?.face256
                          return (
                            <tr key={buyer.address} data-testid="store-buyer">
                              <td>
                                <S.Buyer
                                  href={`${config.profileUrl}/${buyer.address}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  data-testid="store-buyer-name"
                                >
                                  <S.Face style={face ? { backgroundImage: `url(${face})` } : undefined} aria-hidden />
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
                                  <CurrencyMark kind="mana" />
                                  {mana(buyer.spentWei)}
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
                    <Pager page={buyerPage} pages={buyerPages} onChange={setBuyerPage} name="buyers" />
                  </S.ListFoot>
                ) : null}
              </S.Panel>
            </>
          )}
        </S.Root>
      </A.Main>
    </A.Root>
  )
}

export default MyStore
