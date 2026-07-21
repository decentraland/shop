import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Button } from '~/components/Button'
import styled from '@emotion/styled'
import { config } from '~/config'
import { useWallet } from '~/store/wallet'
import { fetchCollectionSaleState, fetchMyAssets, fetchTrade, type CatalogItem, type MyAsset } from '~/lib/api'
import { fetchImportable } from '~/lib/import'
import { fetchPublishableItems, type PublishableItem } from '~/lib/builder'
import { cancelListing } from '~/lib/buy'
import { captureError } from '~/lib/monitoring'
import { toast } from '~/store/toast'
import { SellModal } from '~/components/SellModal'
import { PrimaryListModal } from '~/components/PrimaryListModal'
import { LoadMore } from '~/components/LoadMore'
import { useInfiniteGrid } from '~/hooks/useInfiniteGrid'
import { CURRENCY } from '~/lib/currency'
import { CurrencyIcon } from '~/components/CurrencyIcon'
import { track } from '~/lib/analytics'
import { useSeo } from '~/hooks/useSeo'
import { t } from '~/intl/i18n'
import { ErrorNotice } from '~/components/ErrorNotice'
import '~/styles/my-listings.css'

const RemoveBtn = styled(Button)`
  margin-top: 8px;
  width: 100%;
`

const PublishCta = styled(Button)`
  margin-top: auto;
  width: 100%;
`

const PAGE_SIZE = 48

// Owned NFT (secondary) → the CatalogItem shape ItemDetail seeds its preview from (carries tokenId).
function assetToItem(a: MyAsset): CatalogItem {
  return {
    id: a.id,
    name: a.name,
    creator: '',
    contractAddress: a.contractAddress,
    itemId: a.itemId,
    category: a.category,
    rarity: a.rarity ?? 'common',
    network: a.network,
    chainId: a.chainId,
    thumbnail: a.image,
    priceCredits: a.listingPrice ?? 0,
    gender: null,
    isSmart: false, // TODO: legacy listings don't have the isSmart flag, but we should add it to the API or retrieve it somehow.
    tokenId: a.tokenId
  }
}

// Created collection item (primary) → CatalogItem (carries itemId = the on-chain blockchain item id).
function publishableToItem(p: PublishableItem): CatalogItem {
  return {
    id: `${p.contractAddress}-${p.blockchainItemId}`,
    name: p.name,
    creator: '',
    contractAddress: p.contractAddress,
    itemId: p.blockchainItemId,
    category: p.category,
    rarity: p.rarity,
    network: 'MATIC',
    chainId: config.chainId,
    thumbnail: p.thumbnail,
    priceCredits: 0,
    gender: null,
    isSmart: false // TODO: legacy listings don't have the isSmart flag, but we should add it to the API or retrieve it somehow.
  }
}

export function MyAssets() {
  useSeo({ title: t('nav.myAssets'), noindex: true })
  const { session, error, signIn, restore } = useWallet()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [selling, setSelling] = useState<MyAsset | null>(null)
  const [publishing, setPublishing] = useState<PublishableItem | null>(null)
  const [cancelling, setCancelling] = useState<string | null>(null)
  const [cancelError, setCancelError] = useState<string | null>(null)

  // Open an item's detail page (with the item seeded so the WearablePreview shows immediately).
  function openDetail(item: CatalogItem) {
    const seg = item.tokenId ?? item.itemId ?? ''
    if (!item.contractAddress || !seg) return
    navigate(`/item/${item.contractAddress}/${seg}`, { state: { item } })
  }

  // Take a listing down (invalidates its signature on-chain) — works for owned (secondary) and
  // created (primary) listings alike. Refreshes the grids on success. `key` tracks the busy card.
  async function cancelByTrade(tradeId: string, name: string, key: string) {
    if (!session) return
    setCancelError(null)
    setCancelling(key)
    try {
      const trade = await fetchTrade(tradeId)
      await cancelListing({ trade, signer: session.signer })
      toast.success(t('myAssets.removedFromSale', { name }))
      await qc.invalidateQueries({ queryKey: ['my-assets', session.address] })
      await qc.invalidateQueries({ queryKey: ['collection-sale-state'] })
    } catch (e) {
      const err = e as { code?: number; message?: string }
      const msg = (err.message ?? '').toLowerCase()
      const rejected = err.code === 4001 || msg.includes('reject') || msg.includes('denied')
      if (!rejected) captureError(e, { flow: 'remove-listing', tradeId })
      setCancelError(rejected ? t('getCredits.errorCanceled') : t('myAssets.removeListingError'))
    } finally {
      setCancelling(null)
    }
  }

  useEffect(() => {
    void restore()
  }, [restore])

  const address = session?.address
  const {
    items: ownedAssets,
    isLoading,
    error: queryError,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage
  } = useInfiniteGrid(
    ['my-assets', address],
    skip =>
      fetchMyAssets(address as string, { first: PAGE_SIZE, skip }).then(r => ({ items: r.assets, total: r.total })),
    { enabled: !!address }
  )

  // Old (classic) listings the seller could import into the Shop → surfaces the import banner.
  const { data: importable } = useQuery({
    queryKey: ['importable', address],
    queryFn: () => fetchImportable(address as string),
    enabled: !!address
  })
  const importCount = (importable?.creations.length ?? 0) + (importable?.owned.length ?? 0)

  // Creator's publishable collection items (primary). Fail-soft: a load error just shows a hint.
  const {
    data: publishable,
    isLoading: publishableLoading,
    isError: publishableError
  } = useQuery({
    queryKey: ['publishable-items', address],
    queryFn: () => fetchPublishableItems(address as string, session!.identity),
    enabled: !!session,
    retry: false
  })

  // On-sale state per item (from the v2 catalog), so we can separate listed items from unlisted ones.
  const contractAddresses = useMemo(() => [...new Set((publishable ?? []).map(p => p.contractAddress))], [publishable])
  const { data: saleState } = useQuery({
    queryKey: ['collection-sale-state', address, contractAddresses],
    enabled: contractAddresses.length > 0,
    queryFn: async () => {
      const maps = await Promise.all(
        contractAddresses.map(async ca => [ca, await fetchCollectionSaleState(ca)] as const)
      )
      const merged: Record<string, { isOnSale: boolean; priceCredits: number; tradeId: string }> = {}
      for (const [ca, m] of maps) {
        for (const [itemId, v] of Object.entries(m)) merged[`${ca}-${itemId}`] = v
      }
      return merged
    }
  })

  const saleFor = (item: PublishableItem) => saleState?.[`${item.contractAddress}-${item.blockchainItemId}`]

  // Items already listed for sale (their own section) vs. items still to publish.
  const onSaleItems = useMemo(
    () => (publishable ?? []).filter(p => saleFor(p)?.isOnSale),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [publishable, saleState]
  )

  // Group the still-unlisted items by collection so each collection is its own labeled block.
  const collections = useMemo(() => {
    const map = new Map<string, { id: string; name: string; items: PublishableItem[] }>()
    for (const it of publishable ?? []) {
      if (saleState?.[`${it.contractAddress}-${it.blockchainItemId}`]?.isOnSale) continue
      const g = map.get(it.collectionId) ?? { id: it.collectionId, name: it.collectionName, items: [] }
      g.items.push(it)
      map.set(it.collectionId, g)
    }
    return [...map.values()]
  }, [publishable, saleState])

  if (!session) {
    return (
      <section className="myassets">
        <h1>{t('nav.myAssets')}</h1>
        <p className="muted">{t('myAssets.signInPrompt')}</p>
        <div className="connect-row">
          <Button variant="purple" onClick={() => signIn()}>
            {t('storeSettings.signIn')}
          </Button>
        </div>
        <ErrorNotice message={error} />
      </section>
    )
  }

  return (
    <section className="myassets">
      <h1>{t('nav.myAssets')}</h1>

      {importCount > 0 ? (
        <Link className="import-banner" to="/import">
          <span className="import-banner__ico" aria-hidden>
            📦
          </span>
          <span className="import-banner__text">
            <strong>{t('myAssets.importTitle')}</strong>
            <span className="import-banner__sub">{t('myAssets.importSub', { count: importCount })}</span>
          </span>
          <span className="import-banner__cta">{t('myAssets.import')}</span>
        </Link>
      ) : null}

      {/* ---------------- Section 1: Items you own (secondary market) ---------------- */}
      <div className="myassets__section">
        <div className="myassets__section-head">
          <h2 className="myassets__section-title">{t('myAssets.ownedTitle')}</h2>
          <p className="myassets__section-sub">{t('myAssets.ownedSub')}</p>
        </div>

        {queryError ? <ErrorNotice message={t('myAssets.ownedError')} /> : null}
        <ErrorNotice message={cancelError} />

        <div className="asset-grid">
          {isLoading
            ? Array.from({ length: 8 }).map((_, i) => (
                <div className="asset-card asset-card--skeleton" key={`sk-${i}`} />
              ))
            : ownedAssets.map(asset => (
                <article className="asset-card asset-card--link" key={asset.id}>
                  {/* Whole-card open as a single overlaid button (keyboard + SR reachable), under the
                      row's action button (z-index) so nested controls aren't inside a clickable link. */}
                  <button
                    className="card-link-overlay"
                    aria-label={t('myAssets.viewItem', { name: asset.name })}
                    onClick={() => openDetail(assetToItem(asset))}
                  />
                  <div className="asset-card__img">
                    {asset.image ? <img src={asset.image} alt={asset.name} /> : null}
                  </div>
                  <div className="asset-card__name" title={asset.name}>
                    {asset.name}
                  </div>
                  {asset.isOnSale ? (
                    <>
                      <div className="asset-card__listed">
                        <span className="asset-card__price">
                          <CurrencyIcon className="ccy-mark" /> {asset.listingPrice}
                        </span>
                        <span className="badge">{t('myAssets.onSale')}</span>
                      </div>
                      <RemoveBtn
                        size="sm"
                        variant="ghost"
                        disabled={cancelling === asset.id || !asset.tradeId}
                        onClick={e => {
                          e.stopPropagation()
                          if (asset.tradeId) void cancelByTrade(asset.tradeId, asset.name, asset.id)
                        }}
                      >
                        {cancelling === asset.id ? t('myAssets.removing') : t('myAssets.removeListing')}
                      </RemoveBtn>
                    </>
                  ) : (
                    <Button
                      size="sm"
                      onClick={e => {
                        e.stopPropagation()
                        track('Shop Started Listing', {
                          listing_type: 'secondary',
                          item_id: asset.itemId ?? asset.tokenId ?? null
                        })
                        setSelling(asset)
                      }}
                    >
                      {t('myAssets.putOnSale')}
                    </Button>
                  )}
                </article>
              ))}
          {isFetchingNextPage
            ? Array.from({ length: 4 }).map((_, i) => (
                <div className="asset-card asset-card--skeleton" key={`msk-${i}`} />
              ))
            : null}
        </div>

        <LoadMore hasNextPage={hasNextPage} isFetching={isFetchingNextPage} onLoadMore={() => void fetchNextPage()} />

        {!isLoading && ownedAssets.length === 0 ? <p className="muted">{t('myAssets.ownedEmpty')}</p> : null}
      </div>

      {/* ---------------- Section 2: Items you created (primary), grouped by collection ---------------- */}
      <div className="myassets__section">
        <div className="myassets__section-head">
          <h2 className="myassets__section-title">{t('myAssets.creationsTitle')}</h2>
          <p className="myassets__section-sub">{t('myAssets.creationsSub', { currency: CURRENCY.name })}</p>
        </div>

        {publishableLoading ? (
          <div className="publish-grid">
            {Array.from({ length: 4 }).map((_, i) => (
              <div className="asset-card asset-card--skeleton" key={`pub-sk-${i}`} />
            ))}
          </div>
        ) : publishableError ? (
          <p className="publish-empty">{t('myAssets.collectionsError')}</p>
        ) : onSaleItems.length === 0 && collections.length === 0 ? (
          <p className="publish-empty">{t('myAssets.nothingToPublish')}</p>
        ) : (
          <>
            {/* Already on sale */}
            {onSaleItems.length > 0 ? (
              <div className="creations-collection">
                <h3 className="creations-collection__name">{t('myAssets.onSale')}</h3>
                <div className="publish-grid">
                  {onSaleItems.map(item => (
                    <article
                      className="publish-card publish-card--link"
                      key={`${item.contractAddress}-${item.blockchainItemId}`}
                    >
                      <button
                        className="card-link-overlay"
                        aria-label={t('myAssets.viewItem', { name: item.name })}
                        onClick={() => openDetail(publishableToItem(item))}
                      />
                      <div className="publish-card__img">
                        {item.thumbnail ? <img src={item.thumbnail} alt={item.name} /> : null}
                      </div>
                      <div className="publish-card__name" title={item.name}>
                        {item.name}
                      </div>
                      <div className="publish-card__listed">
                        <span className="publish-card__price">
                          <CurrencyIcon className="ccy-mark" /> {saleFor(item)?.priceCredits ?? 0}
                        </span>
                        <span className="badge">{t('myAssets.onSale')}</span>
                      </div>
                      <PublishCta
                        size="sm"
                        variant="ghost"
                        disabled={cancelling === item.id}
                        onClick={e => {
                          e.stopPropagation()
                          const sale = saleFor(item)
                          if (sale?.tradeId) void cancelByTrade(sale.tradeId, item.name, item.id)
                        }}
                      >
                        {cancelling === item.id ? t('myAssets.removing') : t('myAssets.removeListing')}
                      </PublishCta>
                    </article>
                  ))}
                </div>
              </div>
            ) : null}

            {/* Ready to publish, grouped by collection */}
            {collections.map(group => (
              <div className="creations-collection" key={group.id}>
                <h3 className="creations-collection__name">{group.name}</h3>
                <div className="publish-grid">
                  {group.items.map(item => (
                    <article
                      className="publish-card publish-card--link"
                      key={`${item.contractAddress}-${item.blockchainItemId}`}
                    >
                      <button
                        className="card-link-overlay"
                        aria-label={t('myAssets.viewItem', { name: item.name })}
                        onClick={() => openDetail(publishableToItem(item))}
                      />
                      <div className="publish-card__img">
                        {item.thumbnail ? <img src={item.thumbnail} alt={item.name} /> : null}
                      </div>
                      <div className="publish-card__name" title={item.name}>
                        {item.name}
                      </div>
                      <div className="publish-card__meta">
                        <span className="publish-chip publish-chip--rarity">{item.rarity}</span>
                        <span className="publish-card__supply">
                          {t('myAssets.available', { count: item.remainingSupply })}
                        </span>
                      </div>
                      <PublishCta
                        size="sm"
                        variant="purple"
                        onClick={e => {
                          e.stopPropagation()
                          track('Shop Started Listing', { listing_type: 'primary', item_id: item.blockchainItemId })
                          setPublishing(item)
                        }}
                      >
                        {t('myAssets.putOnSale')}
                      </PublishCta>
                    </article>
                  ))}
                </div>
              </div>
            ))}
          </>
        )}
      </div>

      {selling ? <SellModal asset={selling} session={session} onClose={() => setSelling(null)} /> : null}
      {publishing ? <PrimaryListModal item={publishing} session={session} onClose={() => setPublishing(null)} /> : null}
    </section>
  )
}
