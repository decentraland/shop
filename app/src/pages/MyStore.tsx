import { useState, type ReactNode } from 'react'
import { Link, Navigate, useSearchParams } from 'react-router-dom'
import { useWallet } from '~/store/wallet'
import { useSeo } from '~/hooks/useSeo'
import { useStoreStats, type StoreCollection, type StorePeriod } from '~/hooks/useStoreStats'
import { useCreatorSales } from '~/hooks/useCreatorSales'
import { useCreatorSalesEnabled } from '~/hooks/useCreatorSalesEnabled'
import { useMyStoreFlag } from '~/hooks/useMyStoreEnabled'
import { CollectionThumb } from '~/components/CollectionThumb'
import { CreatorSales } from '~/components/CreatorSales'
import { SaleTag } from '~/components/SaleTag'
import { Tooltip } from '~/components/Tooltip'
import { Button } from '~/components/Button'
import { ErrorNotice } from '~/components/ErrorNotice'
import { useQuery } from '@tanstack/react-query'
import { rarityMedia } from '~/lib/rarity'
import { fetchProfiles, type ProfileAvatar } from '~/lib/profile'
import { shortAddress } from '~/lib/address'
import { capitalizeFirst } from '~/lib/text'
import type { SaleRow } from '~/lib/sales'
import { t, tNode } from '~/intl/i18n'
import * as A from '~/styles/browseLayout.styles'
import * as S from './MyStore.styles'
import manaSymbol from '~/assets/mana-matic.svg'

const PERIODS: StorePeriod[] = ['7d', '30d', 'all']

/** A prolific creator has dozens of collections; the list opens on the ones that sold. */
const COLLECTIONS_SHOWN = 8

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
        <linearGradient id="store-spark" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ff2d55" stopOpacity="0.32" />
          <stop offset="1" stopColor="#ff2d55" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`M ${line} L 94 29 L 2 29 Z`} fill="url(#store-spark)" />
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
  onToggle
}: {
  collection: StoreCollection
  discountPct: number | null
  open: boolean
  onToggle: () => void
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
          <Link to={`/collection/${collection.contractAddress}`} data-testid="store-collection-name">
            {collection.name}
          </Link>
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
        {discountPct != null ? (
          <SaleTag pct={discountPct} />
        ) : (
          <Button as={Link} to="/my-items?section=creations" variant="purple" size="sm">
            {t('myStore.manage')}
          </Button>
        )}
      </S.CollRow>

      {open ? (
        <S.Items id={panelId} data-testid="store-items">
          {collection.items.map(item => (
            <S.ItemRow key={item.key} data-testid="store-item">
              <S.ItemThumb style={{ backgroundImage: rarityMedia(item.rarity) }}>
                {item.thumbnail ? <img src={item.thumbnail} alt="" loading="lazy" /> : null}
              </S.ItemThumb>
              <S.ItemCell>
                <S.ItemName to={`/item/${collection.contractAddress}/${item.itemId}`} title={item.name}>
                  {item.name}
                </S.ItemName>
                {/* The listing state. Not for a sold-out item: the stock column beside it already says so,
                    and saying it twice in one row reads as a mistake. */}
                {item.state === 'soldout' ? null : (
                  <S.ItemState data-state={item.state}>
                    {item.state === 'classic'
                      ? t('myStore.stateClassic')
                      : item.state === 'unlisted'
                        ? t('myStore.stateUnlisted')
                        : item.state === 'unknown'
                          ? t('myStore.stateUnknown')
                          : t('myStore.stateOnSale')}
                  </S.ItemState>
                )}
              </S.ItemCell>
              <S.ItemNum>
                {item.sold}
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
              {/* Copies left of the whole run, always: "9 left" does not say of how many, and a bare
                  ratio does not say which number is which. */}
              <S.Stock data-out={item.left === 0} data-testid="store-item-stock">
                {item.left === 0
                  ? t('myStore.stockOut')
                  : tNode('myStore.stockLeft', {
                      b: (c: ReactNode) => <b>{c}</b>,
                      left: item.left,
                      total: item.minted + item.left
                    })}
              </S.Stock>
            </S.ItemRow>
          ))}
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
            <S.Bar style={{ width: '32%', height: 26 }} />
            <S.Bar style={{ width: '64%' }} />
          </S.Tile>
        ))}
      </S.Tiles>

      <S.Columns style={{ marginTop: 22 }}>
        <S.Panel>
          <S.PanelHead>
            <S.Bar style={{ width: 96, height: 14 }} />
            <S.Bar style={{ width: 120 }} />
          </S.PanelHead>
          {[0, 1, 2].map(i => (
            <S.CollRow key={i}>
              <span />
              <S.Dot />
              <S.Bar style={{ width: '58%', height: 14 }} />
              <S.Bar />
              <S.Bar style={{ height: 20 }} />
              <S.Bar style={{ width: 96, height: 32, borderRadius: 8 }} />
            </S.CollRow>
          ))}
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
        {[0, 1, 2, 3, 4].map(i => (
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
  const [open, setOpen] = useState<string | null>(null)
  const [showAll, setShowAll] = useState(false)
  const creatorSalesEnabled = useCreatorSalesEnabled()
  const flag = useMyStoreFlag()
  const viewAs = devViewAs(params.get('viewAs'))
  const { stats, isLoading, error: statsError } = useStoreStats(session, period, viewAs)
  const { data: buyers } = useBuyerNames(stats?.recent ?? [])
  const { data: discounts } = useCreatorSales(
    viewAs ?? session?.address,
    creatorSalesEnabled && (!!session || !!viewAs)
  )

  // The flag closes the page, not just the nav entry — otherwise the link is off and the URL is still live.
  // Only once the read has ANSWERED no: a pending read is not an answer, and bouncing on it would send
  // every visitor home before the flag file arrives.
  if (flag.data === false) return <Navigate to="/" replace />

  if (!session && !viewAs) {
    return (
      <A.Root>
        <A.Main>
          <S.Title>{t('myStore.title')}</S.Title>
          <S.Sub>{t('myStore.signInPrompt')}</S.Sub>
          <Button variant="white" onClick={() => signIn()}>
            {t('storeSettings.signIn')}
          </Button>
          <ErrorNotice message={error} />
        </A.Main>
      </A.Root>
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
      to: '/activity?section=listings',
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
      to: '/my-items?section=creations',
      cta: t('myStore.attnUnlistedCta')
    }
  ].filter(row => row.n > 0)
  const names = Object.fromEntries((stats?.collections ?? []).map(c => [c.contractAddress, c.name]))
  const items = (stats?.collections ?? []).reduce((n, c) => n + c.items.length, 0)

  return (
    <A.Root>
      <A.Main>
        <S.Root data-testid="my-store">
          <S.Masthead>
            <div>
              <S.Eyebrow>{t('myStore.eyebrow')}</S.Eyebrow>
              <S.Title>{t('myStore.title')}</S.Title>
              {stats ? <S.Sub>{t('myStore.summary', { collections: stats.collections.length, items })}</S.Sub> : null}
            </div>
            <S.Periods role="group" aria-label={t('myStore.period')}>
              {PERIODS.map(key => (
                <S.Period
                  key={key}
                  type="button"
                  aria-pressed={period === key}
                  onClick={() => setPeriod(key)}
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
                  <S.TileFoot>
                    {/* Past the cap the split is exact for the rows fetched, not for the total above it —
                        so it says which rows it is about rather than reading as a contradiction. */}
                    {stats.partial
                      ? t('myStore.tileSoldFootPartial', {
                          mints: stats.mints,
                          resales: stats.resales,
                          n: stats.fetched.toLocaleString()
                        })
                      : t('myStore.tileSoldFoot', { mints: stats.mints, resales: stats.resales })}
                  </S.TileFoot>
                </S.Tile>
                <S.Tile>
                  <S.TileKey>
                    {t('myStore.tileEarnings')}
                    <S.TileMark aria-hidden>💰</S.TileMark>
                  </S.TileKey>
                  <S.TileValue>
                    <S.ManaMark src={manaSymbol} alt="" aria-hidden />
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

              <S.Columns>
                <S.Panel aria-labelledby="store-coll-h">
                  <S.PanelHead>
                    <S.PanelTitle id="store-coll-h">{t('myStore.collections')}</S.PanelTitle>
                    <S.PanelHint>
                      {stats.partial
                        ? t('myStore.soldPartial', { n: stats.fetched.toLocaleString() })
                        : t(`myStore.sold${period}`)}
                    </S.PanelHint>
                  </S.PanelHead>
                  {stats.collections.length === 0 ? (
                    <S.Empty>{t('myStore.noCollections')}</S.Empty>
                  ) : (
                    stats.collections
                      .slice(0, showAll ? undefined : COLLECTIONS_SHOWN)
                      .map(collection => (
                        <CollectionRow
                          key={collection.contractAddress}
                          collection={collection}
                          discountPct={pctByCollection.get(collection.contractAddress) ?? null}
                          open={open === collection.contractAddress}
                          onToggle={() =>
                            setOpen(open === collection.contractAddress ? null : collection.contractAddress)
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
                            {row.hint ? (
                              <Tooltip content={row.hint}>
                                <b tabIndex={0} data-testid={`store-attn-${row.id}-hint`}>
                                  {row.title}
                                </b>
                              </Tooltip>
                            ) : (
                              <b>{row.title}</b>
                            )}
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

                  {creatorSalesEnabled && running.length > 0 && !viewAs && session ? (
                    <S.Panel aria-labelledby="store-disc-h">
                      <S.PanelHead>
                        <S.PanelTitle id="store-disc-h">{t('creatorSale.salesTitle')}</S.PanelTitle>
                      </S.PanelHead>
                      <div style={{ padding: '0 18px 18px' }}>
                        <CreatorSales sales={running} session={session} names={names} />
                      </div>
                    </S.Panel>
                  ) : null}
                </S.Side>
              </S.Columns>

              <S.Panel aria-labelledby="store-feed-h">
                <S.PanelHead>
                  <S.PanelTitle id="store-feed-h">{t('myStore.recent')}</S.PanelTitle>
                  <S.PanelHint>{t('myStore.recentHint', { count: stats.sold })}</S.PanelHint>
                </S.PanelHead>
                {stats.recent.length === 0 ? (
                  <S.Empty>{t('myStore.noSales')}</S.Empty>
                ) : (
                  <S.FeedWrap>
                    <S.Feed>
                      <thead>
                        <tr>
                          <th scope="col">{t('myStore.colItem')}</th>
                          <th scope="col">{t('myStore.colBuyer')}</th>
                          <th scope="col">{t('myStore.colKind')}</th>
                          <th scope="col">{t('myStore.colWhen')}</th>
                          <th scope="col" style={{ textAlign: 'right' }}>
                            {t('myStore.colPaid')}
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {stats.recent.map(row => {
                          const collection = stats.collections.find(
                            c => c.contractAddress === row.contractAddress.toLowerCase()
                          )
                          const item = collection?.items.find(i => i.itemId === row.itemId)
                          return (
                            <tr key={row.id} data-testid="store-sale">
                              <td>{item?.name ?? collection?.name ?? row.itemId ?? t('myStore.unknownItem')}</td>
                              <td data-dim>{buyerName(row.buyer, buyers)}</td>
                              <td>
                                <S.Kind data-kind={row.type}>
                                  {row.type === 'mint' ? t('myStore.kindMint') : t('myStore.kindResale')}
                                </S.Kind>
                              </td>
                              <td data-dim>{ago(row.timestamp)}</td>
                              <td data-money>
                                <S.ManaMark src={manaSymbol} alt="" aria-hidden />
                                {mana(BigInt(row.price || '0'))}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </S.Feed>
                  </S.FeedWrap>
                )}
              </S.Panel>
            </>
          )}
        </S.Root>
      </A.Main>
    </A.Root>
  )
}

export default MyStore
