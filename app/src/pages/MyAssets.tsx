import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
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
import { track } from '~/lib/analytics'
import '~/styles/my-listings.css'

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
    gender: null
  }
}

export function MyAssets() {
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
      toast.success(`“${name}” is no longer for sale.`)
      await qc.invalidateQueries({ queryKey: ['my-assets', session.address] })
      await qc.invalidateQueries({ queryKey: ['collection-sale-state'] })
    } catch (e) {
      const err = e as { code?: number; message?: string }
      const msg = (err.message ?? '').toLowerCase()
      const rejected = err.code === 4001 || msg.includes('reject') || msg.includes('denied')
      if (!rejected) captureError(e, { flow: 'remove-listing', tradeId })
      setCancelError(rejected ? 'You cancelled the request.' : "Couldn't remove the listing — please try again.")
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
    skip => fetchMyAssets(address as string, { first: PAGE_SIZE, skip }).then(r => ({ items: r.assets, total: r.total })),
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
  const contractAddresses = useMemo(
    () => [...new Set((publishable ?? []).map(p => p.contractAddress))],
    [publishable]
  )
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [publishable, saleState])

  if (!session) {
    return (
      <section className="myassets">
        <h1>My Assets</h1>
        <p className="muted">Sign in to sell your items.</p>
        <div className="connect-row">
          <button className="btn btn--purple" onClick={() => signIn()}>Sign in</button>
        </div>
        {error ? <p className="error">{error}</p> : null}
      </section>
    )
  }

  return (
    <section className="myassets">
      <h1>My Assets</h1>

      {importCount > 0 ? (
        <Link className="import-banner" to="/import">
          <span className="import-banner__ico" aria-hidden>📦</span>
          <span className="import-banner__text">
            <strong>Import your listings</strong>
            <span className="import-banner__sub">You have {importCount} item{importCount === 1 ? '' : 's'} for sale elsewhere — bring them into the Shop.</span>
          </span>
          <span className="import-banner__cta">Import</span>
        </Link>
      ) : null}

      {/* ---------------- Section 1: Items you own (secondary market) ---------------- */}
      <div className="myassets__section">
        <div className="myassets__section-head">
          <h2 className="myassets__section-title">Items you own</h2>
          <p className="myassets__section-sub">Wearables &amp; emotes you&rsquo;ve bought — resell them in the Shop.</p>
        </div>

        {queryError ? <p className="error">{(queryError as Error).message}</p> : null}
        {cancelError ? <p className="error">{cancelError}</p> : null}

        <div className="asset-grid">
          {isLoading
            ? Array.from({ length: 8 }).map((_, i) => <div className="asset-card asset-card--skeleton" key={`sk-${i}`} />)
            : ownedAssets.map(asset => (
                <article
                  className="asset-card asset-card--link"
                  key={asset.id}
                  onClick={() => openDetail(assetToItem(asset))}
                  role="link"
                  tabIndex={0}
                  onKeyDown={e => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      openDetail(assetToItem(asset))
                    }
                  }}
                >
                  <div className="asset-card__img">{asset.image ? <img src={asset.image} alt={asset.name} /> : null}</div>
                  <div className="asset-card__name" title={asset.name}>{asset.name}</div>
                  {asset.isOnSale ? (
                    <>
                      <div className="asset-card__listed">
                        <span className="asset-card__price">{CURRENCY.symbol} {asset.listingPrice}</span>
                        <span className="badge">On sale</span>
                      </div>
                      <button
                        className="btn btn--sm btn--ghost asset-card__remove"
                        disabled={cancelling === asset.id || !asset.tradeId}
                        onClick={e => {
                          e.stopPropagation()
                          if (asset.tradeId) void cancelByTrade(asset.tradeId, asset.name, asset.id)
                        }}
                      >
                        {cancelling === asset.id ? 'Removing…' : 'Remove listing'}
                      </button>
                    </>
                  ) : (
                    <button
                      className="btn btn--sm"
                      onClick={e => {
                        e.stopPropagation()
                        track('Shop Started Listing', {
                          listing_type: 'secondary',
                          item_id: asset.itemId ?? asset.tokenId ?? null
                        })
                        setSelling(asset)
                      }}
                    >
                      List for sale
                    </button>
                  )}
                </article>
              ))}
          {isFetchingNextPage
            ? Array.from({ length: 4 }).map((_, i) => <div className="asset-card asset-card--skeleton" key={`msk-${i}`} />)
            : null}
        </div>

        <LoadMore hasNextPage={hasNextPage} isFetching={isFetchingNextPage} onLoadMore={() => fetchNextPage()} />

        {!isLoading && ownedAssets.length === 0 ? (
          <p className="muted">No items in your inventory yet.</p>
        ) : null}
      </div>

      {/* ---------------- Section 2: Items you created (primary), grouped by collection ---------------- */}
      <div className="myassets__section">
        <div className="myassets__section-head">
          <h2 className="myassets__section-title">Your creations</h2>
          <p className="myassets__section-sub">
            Items you made. Put them on sale in the Shop — set a price in {CURRENCY.name} and buyers pay with {CURRENCY.name}.
          </p>
        </div>

        {publishableLoading ? (
          <div className="publish-grid">
            {Array.from({ length: 4 }).map((_, i) => (
              <div className="asset-card asset-card--skeleton" key={`pub-sk-${i}`} />
            ))}
          </div>
        ) : publishableError ? (
          <p className="publish-empty">We couldn&rsquo;t load your collections right now. Please try again in a moment.</p>
        ) : onSaleItems.length === 0 && collections.length === 0 ? (
          <p className="publish-empty">You don&rsquo;t have any items to publish yet.</p>
        ) : (
          <>
            {/* Already on sale */}
            {onSaleItems.length > 0 ? (
              <div className="creations-collection">
                <h3 className="creations-collection__name">On sale</h3>
                <div className="publish-grid">
                  {onSaleItems.map(item => (
                    <article
                      className="publish-card publish-card--link"
                      key={`${item.contractAddress}-${item.blockchainItemId}`}
                      onClick={() => openDetail(publishableToItem(item))}
                      role="link"
                      tabIndex={0}
                      onKeyDown={e => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          openDetail(publishableToItem(item))
                        }
                      }}
                    >
                      <div className="publish-card__img">
                        {item.thumbnail ? <img src={item.thumbnail} alt={item.name} /> : null}
                      </div>
                      <div className="publish-card__name" title={item.name}>{item.name}</div>
                      <div className="publish-card__listed">
                        <span className="publish-card__price">{CURRENCY.symbol} {saleFor(item)?.priceCredits ?? 0}</span>
                        <span className="badge">On sale</span>
                      </div>
                      <button
                        className="btn btn--sm btn--ghost publish-card__cta"
                        disabled={cancelling === item.id}
                        onClick={e => {
                          e.stopPropagation()
                          const sale = saleFor(item)
                          if (sale?.tradeId) void cancelByTrade(sale.tradeId, item.name, item.id)
                        }}
                      >
                        {cancelling === item.id ? 'Removing…' : 'Remove listing'}
                      </button>
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
                      onClick={() => openDetail(publishableToItem(item))}
                      role="link"
                      tabIndex={0}
                      onKeyDown={e => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          openDetail(publishableToItem(item))
                        }
                      }}
                    >
                      <div className="publish-card__img">
                        {item.thumbnail ? <img src={item.thumbnail} alt={item.name} /> : null}
                      </div>
                      <div className="publish-card__name" title={item.name}>{item.name}</div>
                      <div className="publish-card__meta">
                        <span className="publish-chip publish-chip--rarity">{item.rarity}</span>
                        <span className="publish-card__supply">{item.remainingSupply.toLocaleString()} available</span>
                      </div>
                      <button
                        className="btn btn--sm btn--purple publish-card__cta"
                        onClick={e => {
                          e.stopPropagation()
                          track('Shop Started Listing', { listing_type: 'primary', item_id: item.blockchainItemId })
                          setPublishing(item)
                        }}
                      >
                        Put on sale
                      </button>
                    </article>
                  ))}
                </div>
              </div>
            ))}
          </>
        )}
      </div>

      {selling ? <SellModal asset={selling} session={session} onClose={() => setSelling(null)} /> : null}
      {publishing ? (
        <PrimaryListModal item={publishing} session={session} onClose={() => setPublishing(null)} />
      ) : null}
    </section>
  )
}
