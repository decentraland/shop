import { useId, useMemo, useState, type ReactNode } from 'react'
import { Link, Navigate, useSearchParams } from 'react-router-dom'
import { useWallet } from '~/store/wallet'
import { useSeo } from '~/hooks/useSeo'
import { useStoreStats, type StoreCollection, type StoreItem, type StorePeriod } from '~/hooks/useStoreStats'
import { useCreatorSales } from '~/hooks/useCreatorSales'
import { useCreatorSalesEnabled } from '~/hooks/useCreatorSalesEnabled'
import { useMyStoreAccess } from '~/hooks/useMyStoreEnabled'
import { CollectionThumb } from '~/components/CollectionThumb'
import { CreatorSales } from '~/components/CreatorSales'
import { CreatorSaleModal } from '~/components/CreatorSaleModal'
import { SaleTag } from '~/components/SaleTag'
import { CurrencyMark } from '~/components/CurrencyMark'
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
import { config } from '~/config'
import { shortAddress } from '~/lib/address'
import { capitalizeFirst } from '~/lib/text'
import type { SaleRow } from '~/lib/sales'
import { t, tNode } from '~/intl/i18n'
import { EmptyState, EmptyStateCentered } from '~/components/EmptyState'
import signInIllustration from '~/assets/empty/signin-empty.svg'
import * as A from '~/styles/browseLayout.styles'
import * as S from './MyStore.styles'

const PERIODS: StorePeriod[] = ['7d', '30d', 'all']

/** A prolific creator has dozens of collections; the list opens on the ones that sold. */
const COLLECTIONS_SHOWN = 8

type Sort = 'sold' | 'newest' | 'name'

/** How the collections list is ordered. `newest` only appears when the source dates the items. */
function sortCollections(collections: StoreCollection[], by: Sort): StoreCollection[] {
  const sorted = [...collections]
  if (by === 'name') return sorted.sort((a, b) => a.name.localeCompare(b.name))
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

/** Rows per page of the sales table. The feed is paged rather than capped here: all of it is reachable. */
const SALES_PER_PAGE = 12

/**
 * The page numbers to draw around the current one.
 *
 * A store with 183 pages cannot show them all, so it shows the ends, the neighbours, and an ellipsis for
 * whatever is skipped — the reader always knows where they are and how far it goes.
 */
function pageWindow(page: number, pages: number): (number | 'gap')[] {
  if (pages <= 7) return Array.from({ length: pages }, (_, i) => i)
  const around = [page - 1, page, page + 1].filter(n => n > 0 && n < pages - 1)
  const out: (number | 'gap')[] = [0]
  if (around[0] > 1) out.push('gap')
  out.push(...around)
  if (around[around.length - 1] < pages - 2) out.push('gap')
  out.push(pages - 1)
  return out
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
function useBuyerNames(rows: SaleRow[]) {
  const addresses = [...new Set(rows.map(row => row.buyer.toLowerCase()))].sort()
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
 * The `?viewAs=0x…` development override: read another creator's store from the public feeds.
 *
 * DEV builds only — `import.meta.env.DEV` is statically false in a production build, so this and the public
 * catalogue behind it are dropped from the bundle rather than merely never reached. It exists because the
 * page cannot otherwise be judged: the only store a signed-in creator can open is their own, and a test
 * account with no sales is the one shape this design must not be tuned for.
 */
function devViewAs(raw: string | null): string | null {
  if (!import.meta.env.DEV || !raw) return null
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
  const last = series.length ? series[series.length - 1] : 0

  if (peak === 0) {
    return (
      <S.Spark viewBox="0 0 96 30" role="img" aria-label={t('myStore.trendNone')}>
        <path d="M2 27 L94 27" fill="none" stroke="#e6e4ea" strokeWidth="1.6" strokeLinecap="round" />
      </S.Spark>
    )
  }

  return (
    <S.Spark viewBox="0 0 96 30" role="img" aria-label={t('myStore.trendAria', { n: peak })}>
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ff2d55" stopOpacity="0.32" />
          <stop offset="1" stopColor="#ff2d55" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`M ${line} L 94 29 L 2 29 Z`} fill={`url(#${gradientId})`} />
      <path
        d={`M ${line}`}
        fill="none"
        stroke="#ff2d55"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="94" cy={y(last)} r="2.6" fill="#ff2d55" />
    </S.Spark>
  )
}

function CollectionRow({
  collection,
  discountPct,
  open,
  onToggle,
  env
}: {
  collection: StoreCollection
  discountPct: number | null
  open: boolean
  onToggle: () => void
  env: string | null
}) {
  const panelId = `store-items-${collection.contractAddress}`
  return (
    <>
      <S.CollRow data-testid="store-collection">
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
        <S.Mosaic>
          <CollectionThumb contractAddress={collection.contractAddress} />
        </S.Mosaic>
        <S.CollName>
          <S.NameLine>
            <Link to={withEnv(`/collection/${collection.contractAddress}`, env)} data-testid="store-collection-name">
              {collection.name}
            </Link>
            {discountPct != null ? <SaleTag pct={discountPct} /> : null}
          </S.NameLine>
          <span>
            {t('myStore.itemsCount', { count: collection.items.length })}
            {collection.listed > 0 ? ` · ${t('myStore.listedCount', { count: collection.listed })}` : ''}
            {collection.soldOut > 0 ? ` · ${t('myStore.soldOutCount', { count: collection.soldOut })}` : ''}
          </span>
        </S.CollName>
        <S.Num>
          {collection.sold}
          <small>{t('myStore.sold')}</small>
        </S.Num>
        <S.SparkCell>
          <Sparkline series={collection.trend} />
        </S.SparkCell>
        <Button
          as="a"
          href={`${config.builderUrl}/collections/${collection.collectionId}`}
          target="_blank"
          rel="noopener noreferrer"
          variant="purple"
          size="sm"
          data-testid="store-manage"
        >
          {t('myStore.manage')}
        </Button>
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
  const [showAll, setShowAll] = useState(false)
  const [page, setPage] = useState(0)
  const [saleOpen, setSaleOpen] = useState(false)
  const [sort, setSort] = useState<Sort>('sold')
  const creatorSalesEnabled = useCreatorSalesEnabled()
  const access = useMyStoreAccess()
  const viewAs = devViewAs(params.get('viewAs'))
  const env = params.get('env')
  const { data: profile } = useProfile(viewAs ?? session?.address)
  const face = profile?.avatar?.snapshots?.face256
  const creatorName = profile?.name ? capitalizeFirst(profile.name) : null
  const { stats, saleable, isLoading, error: statsError } = useStoreStats(session, period, viewAs)
  const sales = useSalesPage(viewAs ?? session?.address, period, page)
  const { data: buyers, isLoading: buyersLoading } = useBuyerNames(sales.rows)
  const { data: discounts } = useCreatorSales(
    viewAs ?? session?.address,
    creatorSalesEnabled && (!!session || !!viewAs)
  )

  // The flag closes the page, not just the nav entry — otherwise the link is off and the URL is still live.
  // Only once the read has ANSWERED no: a pending read is not an answer, and bouncing on it would send
  // every visitor home before the flag file arrives, or before the wallet an allowlist is checked against
  // has been read back.
  if (access === 'off') return <Navigate to="/" replace />

  if (!session && !viewAs) {
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
  const pctByCollection = new Map<string, number>()
  for (const sale of discounts ?? []) {
    if (sale.status !== 'active' && sale.status !== 'scheduled') continue
    for (const address of sale.collections) pctByCollection.set(address.toLowerCase(), sale.discount / 10_000)
  }

  const running = (discounts ?? []).filter(s => s.status === 'active' || s.status === 'scheduled')

  /** What the creator could act on, listed only when there is something to act on. A row reading zero is
   * not reassurance, it is a line to scan past. */
  const attention = [
    {
      id: 'classic',
      sev: 'act',
      n: stats?.classic ?? 0,
      title: t('myStore.attnClassic'),
      why: t('myStore.attnClassicWhy'),
      hint: t('myStore.attnClassicHint'),
      to: withEnv('/activity?section=listings', env),
      cta: t('myStore.attnClassicCta')
    },
    {
      id: 'soldout',
      sev: 'soon',
      n: stats?.soldOut ?? 0,
      title: t('myStore.attnSoldOut'),
      why: t('myStore.attnSoldOutWhy'),
      hint: undefined,
      to: undefined,
      cta: undefined
    },
    {
      id: 'unlisted',
      sev: undefined,
      n: stats?.neverListed ?? 0,
      title: t('myStore.attnUnlisted'),
      why: t('myStore.attnUnlistedWhy'),
      hint: t('myStore.attnUnlistedHint'),
      to: withEnv('/my-items?section=creations', env),
      cta: t('myStore.attnUnlistedCta')
    }
  ].filter(row => row.n > 0)
  const names = Object.fromEntries((stats?.collections ?? []).map(c => [c.contractAddress, c.name]))
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
                    <S.TileMark aria-hidden>🛍️</S.TileMark>
                  </S.TileKey>
                  <S.TileValue data-testid="store-sold">{stats.sold.toLocaleString()}</S.TileValue>
                  <S.TileFoot>{t('myStore.tileSoldFoot', { mints: stats.mints, resales: stats.resales })}</S.TileFoot>
                </S.Tile>
                <S.Tile>
                  <S.TileKey>
                    {t('myStore.tileEarnings')}
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

              <S.Columns>
                <S.Panel aria-labelledby="store-coll-h">
                  <S.PanelHead>
                    <S.PanelTitle id="store-coll-h">{t('myStore.collections')}</S.PanelTitle>
                    <S.HeadRight>
                      <S.PanelHint>
                        {stats.breakdownPartial
                          ? t('myStore.soldPartial', { n: stats.fetched.toLocaleString() })
                          : t(`myStore.sold${period}`)}
                      </S.PanelHint>
                      {stats.collections.length > 1 ? (
                        <S.Sort
                          options={[
                            { value: 'sold', label: t('myStore.sortSold') },
                            ...(stats.collections.some(c => c.createdAt)
                              ? [{ value: 'newest', label: t('myStore.sortNewest') }]
                              : []),
                            { value: 'name', label: t('myStore.sortName') }
                          ]}
                          value={sort}
                          onChange={value => setSort(value as Sort)}
                          align="right"
                          ariaLabel={t('myStore.sortBy')}
                          className="store-sort"
                        />
                      ) : null}
                    </S.HeadRight>
                  </S.PanelHead>
                  {stats.collections.length === 0 ? (
                    <S.Empty>{t('myStore.noCollections')}</S.Empty>
                  ) : (
                    sortCollections(stats.collections, sort)
                      .slice(0, showAll ? undefined : COLLECTIONS_SHOWN)
                      .map(collection => (
                        <CollectionRow
                          key={collection.contractAddress}
                          collection={collection}
                          discountPct={pctByCollection.get(collection.contractAddress) ?? null}
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
                      ))
                  )}
                  {stats.collections.length > COLLECTIONS_SHOWN && !showAll ? (
                    <S.More type="button" onClick={() => setShowAll(true)} data-testid="store-show-all">
                      {t('myStore.showAll', { count: stats.collections.length })}
                    </S.More>
                  ) : null}
                  {stats.unattributed > 0 ? (
                    <S.Note data-testid="store-unattributed">
                      {t('myStore.unattributed', { count: stats.unattributed })}
                    </S.Note>
                  ) : null}
                  {stats.unknownCollections > 0 ? (
                    <S.Note data-testid="store-unknown-state">{t('myStore.unknownState')}</S.Note>
                  ) : null}
                </S.Panel>

                <S.Side>
                  <S.Panel aria-labelledby="store-attn-h">
                    <S.PanelHead>
                      <S.PanelTitle id="store-attn-h">{t('myStore.attention')}</S.PanelTitle>
                    </S.PanelHead>
                    {attention.length === 0 ? (
                      <S.Empty data-testid="store-attn-none">{t('myStore.attnNone')}</S.Empty>
                    ) : (
                      attention.map(row => (
                        <S.AttnRow key={row.id}>
                          <S.Stripe data-sev={row.sev} aria-hidden />
                          <S.AttnText>
                            <b>
                              {row.title}
                              {row.hint ? (
                                <Tooltip content={row.hint}>
                                  <S.Info
                                    type="button"
                                    aria-label={row.title}
                                    data-testid={`store-attn-${row.id}-hint`}
                                  >
                                    <Icon name="info" className="ico" aria-hidden />
                                  </S.Info>
                                </Tooltip>
                              ) : null}
                            </b>
                            <span>{row.why}</span>
                            {row.to ? (
                              <S.AttnLink to={row.to} data-testid={`store-attn-${row.id}-cta`}>
                                {row.cta}
                              </S.AttnLink>
                            ) : null}
                          </S.AttnText>
                          <S.AttnNum data-testid={`store-attn-${row.id}`}>{row.n}</S.AttnNum>
                        </S.AttnRow>
                      ))
                    )}
                  </S.Panel>

                  {creatorSalesEnabled && !viewAs && session && (running.length > 0 || saleable.length > 0) ? (
                    <S.Panel aria-labelledby="store-disc-h">
                      <S.PanelHead>
                        <S.PanelTitle id="store-disc-h">{t('creatorSale.salesTitle')}</S.PanelTitle>
                      </S.PanelHead>
                      {running.length > 0 ? (
                        <S.PanelBody>
                          <CreatorSales sales={running} session={session} names={names} />
                        </S.PanelBody>
                      ) : (
                        <S.Empty>{t('myStore.noDiscounts')}</S.Empty>
                      )}
                      {saleable.length > 0 ? (
                        <S.More type="button" onClick={() => setSaleOpen(true)} data-testid="store-new-discount">
                          {t('myStore.newDiscount')}
                        </S.More>
                      ) : null}
                    </S.Panel>
                  ) : null}
                </S.Side>
              </S.Columns>

              <S.Panel aria-labelledby="store-feed-h">
                <S.PanelHead>
                  <S.PanelTitle id="store-feed-h">{t('myStore.sales')}</S.PanelTitle>
                  <S.PanelHint>{t('myStore.recentHint', { count: stats.sold })}</S.PanelHint>
                </S.PanelHead>
                {sales.rows.length === 0 ? (
                  <S.Empty>{t('myStore.noSales')}</S.Empty>
                ) : (
                  <S.FeedWrap>
                    <S.Feed>
                      <thead>
                        <tr>
                          <th scope="col">{t('myStore.colItem')}</th>
                          <th scope="col">{t('myStore.colBuyer')}</th>
                          <th scope="col">
                            <S.HeadWithHint>
                              {t('myStore.colKind')}
                              <Tooltip content={t('myStore.kindHint')}>
                                <S.Info type="button" aria-label={t('myStore.colKind')} data-testid="store-kind-hint">
                                  <Icon name="info" className="ico" aria-hidden />
                                </S.Info>
                              </Tooltip>
                            </S.HeadWithHint>
                          </th>
                          <th scope="col">{t('myStore.colWhen')}</th>
                          <th scope="col" style={{ textAlign: 'right' }}>
                            {t('myStore.colPaid')}
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {sales.rows.map(row => {
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
                                  <span>
                                    {item?.name ?? collection?.name ?? row.itemId ?? t('myStore.unknownItem')}
                                  </span>
                                </S.SaleItem>
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
                              <td>
                                <S.Kind data-kind={row.type}>
                                  {row.type === 'mint' ? t('myStore.kindMint') : t('myStore.kindResale')}
                                </S.Kind>
                              </td>
                              <td data-dim>{ago(row.timestamp)}</td>
                              <td data-money>
                                <CurrencyMark kind="mana" />
                                {mana(weiOf(row.price))}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </S.Feed>
                  </S.FeedWrap>
                )}
                {sales.pages > 1 ? (
                  <S.Pager aria-label={t('myStore.pagination')}>
                    <S.PageBtn
                      type="button"
                      onClick={() => setPage(p => Math.max(0, p - 1))}
                      disabled={page === 0}
                      data-testid="store-sales-prev"
                    >
                      {t('myStore.prev')}
                    </S.PageBtn>
                    {pageWindow(page, sales.pages).map((n, i) =>
                      n === 'gap' ? (
                        <S.PageGap key={`gap-${i}`}>…</S.PageGap>
                      ) : (
                        <S.PageNum
                          key={n}
                          type="button"
                          aria-current={n === page ? 'page' : undefined}
                          onClick={() => setPage(n)}
                          data-testid={`store-sales-page-${n + 1}`}
                        >
                          {(n + 1).toLocaleString()}
                        </S.PageNum>
                      )
                    )}
                    <S.PageBtn
                      type="button"
                      onClick={() => setPage(p => Math.min(sales.pages - 1, p + 1))}
                      disabled={page >= sales.pages - 1}
                      data-testid="store-sales-next"
                    >
                      {t('myStore.next')}
                    </S.PageBtn>
                  </S.Pager>
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
