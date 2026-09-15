import { useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { useWallet } from '~/store/wallet'
import { useSeo } from '~/hooks/useSeo'
import { useStoreStats, type StoreCollection, type StorePeriod } from '~/hooks/useStoreStats'
import { useCreatorSales } from '~/hooks/useCreatorSales'
import { useCreatorSalesEnabled } from '~/hooks/useCreatorSalesEnabled'
import { useMyStoreFlag } from '~/hooks/useMyStoreEnabled'
import { CollectionThumb } from '~/components/CollectionThumb'
import { CreatorSales } from '~/components/CreatorSales'
import { SaleTag } from '~/components/SaleTag'
import { Button } from '~/components/Button'
import { ErrorNotice } from '~/components/ErrorNotice'
import { SkeletonCards } from '~/components/SkeletonCards'
import { t } from '~/intl/i18n'
import * as A from '~/styles/browseLayout.styles'
import * as S from './MyStore.styles'
import manaSymbol from '~/assets/mana-matic.svg'

const PERIODS: StorePeriod[] = ['7d', '30d', 'all']

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
              <S.ItemThumb src={item.thumbnail} alt="" loading="lazy" />
              <S.ItemName to={`/item/${collection.contractAddress}/${item.itemId}`} title={item.name}>
                {item.name}
              </S.ItemName>
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
              <S.ItemState data-state={item.state}>
                {item.state === 'soldout'
                  ? t('myStore.stateSoldOut')
                  : item.state === 'classic'
                    ? t('myStore.stateClassic')
                    : item.state === 'unlisted'
                      ? t('myStore.stateUnlisted')
                      : t('myStore.stateLeft', { count: item.left })}
              </S.ItemState>
            </S.ItemRow>
          ))}
        </S.Items>
      ) : null}
    </>
  )
}

export function MyStore() {
  useSeo({ title: t('myStore.title'), noindex: true })
  const { session, error, signIn } = useWallet()
  const [period, setPeriod] = useState<StorePeriod>('30d')
  const [open, setOpen] = useState<string | null>(null)
  const creatorSalesEnabled = useCreatorSalesEnabled()
  const flag = useMyStoreFlag()
  const { stats, isLoading, error: statsError } = useStoreStats(session, period)
  const { data: discounts } = useCreatorSales(session?.address, creatorSalesEnabled && !!session)

  // The flag closes the page, not just the nav entry — otherwise the link is off and the URL is still live.
  // Only once the read has ANSWERED no: a pending read is not an answer, and bouncing on it would send
  // every visitor home before the flag file arrives.
  if (flag.data === false) return <Navigate to="/" replace />

  if (!session) {
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
      why: t('myStore.attnClassicWhy')
    },
    {
      id: 'soldout',
      sev: 'soon',
      n: stats?.soldOut ?? 0,
      title: t('myStore.attnSoldOut'),
      why: t('myStore.attnSoldOutWhy')
    },
    {
      id: 'unlisted',
      sev: undefined,
      n: stats?.neverListed ?? 0,
      title: t('myStore.attnUnlisted'),
      why: t('myStore.attnUnlistedWhy')
    }
  ].filter(row => row.n > 0)
  const names = Object.fromEntries((stats?.collections ?? []).map(c => [c.contractAddress, c.name]))

  return (
    <A.Root>
      <A.Main>
        <S.Root data-testid="my-store">
          <S.Masthead>
            <div>
              <S.Eyebrow>{t('myStore.eyebrow')}</S.Eyebrow>
              <S.Title>{t('myStore.title')}</S.Title>
              {stats ? (
                <S.Sub>
                  {t('myStore.summary', {
                    collections: stats.collections.length,
                    items: stats.collections.reduce((n, c) => n + c.items.length, 0)
                  })}
                </S.Sub>
              ) : null}
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

          <ErrorNotice message={statsError ? t('myStore.error') : null} testId="my-store-error" />

          {isLoading || !stats ? (
            <SkeletonCards count={4} />
          ) : (
            <>
              <S.Tiles aria-label={t('myStore.summaryAria')}>
                <S.Tile>
                  <S.TileKey>{t('myStore.tileSold')}</S.TileKey>
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
                  <S.TileKey>{t('myStore.tileEarnings')}</S.TileKey>
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
                  <S.TileKey>{t('myStore.tileListed')}</S.TileKey>
                  <S.TileValue>
                    {stats.listed + stats.classic}
                    <S.TileUnit>
                      {t('myStore.ofTotal', {
                        n: stats.collections.reduce((n, c) => n + c.items.length, 0)
                      })}
                    </S.TileUnit>
                  </S.TileValue>
                  <S.TileFoot>{t('myStore.tileListedFoot', { count: stats.neverListed })}</S.TileFoot>
                </S.Tile>
                <S.Tile>
                  <S.TileKey>{t('myStore.tileDiscounts')}</S.TileKey>
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
                    <S.PanelHint>{t(`myStore.sold${period}`)}</S.PanelHint>
                  </S.PanelHead>
                  {stats.collections.length === 0 ? (
                    <S.Empty>{t('myStore.noCollections')}</S.Empty>
                  ) : (
                    stats.collections.map(collection => (
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
                            <b>{row.title}</b>
                            <span>{row.why}</span>
                          </S.AttnText>
                          <S.AttnNum data-testid={`store-attn-${row.id}`}>{row.n}</S.AttnNum>
                        </S.AttnRow>
                      ))
                    )}
                  </S.Panel>

                  {creatorSalesEnabled && running.length > 0 ? (
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
                              <td>{item?.name ?? collection?.name ?? row.itemId}</td>
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
