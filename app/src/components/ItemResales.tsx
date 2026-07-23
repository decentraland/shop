import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { config } from '~/config'
import { useCart } from '~/store/cart'
import { useWallet } from '~/store/wallet'
import {
  fetchItemResales,
  fetchClassicItemOrders,
  fetchResaleTokenInfos,
  type CatalogItem,
  type LegacyListing,
  type UnifiedListing
} from '~/lib/api'
import { useManaRate } from '~/hooks/useManaRate'
import { formatCredits } from '~/lib/currency'
import { CurrencyIcon } from '~/components/CurrencyIcon'
import { Icon } from '~/components/Icon'
import { CreatorBadge } from '~/components/CreatorBadge'
import { BuyModal } from '~/components/BuyModal'
import { MarketCheckout } from '~/components/MarketCheckout'
import { t } from '~/intl/i18n'
import './item-resales.css'

// How many resale rows to show before "Show more". Keeps a hot item's long tail of listings from
// blowing up the page (and bounds the per-token seller/issued lookup to the visible rows).
const PAGE_SIZE = 8

// Classic ON-CHAIN orders (old Marketplace.sol, no off-chain tradeId) can't be fulfilled by the
// credits rail, so they're non-buyable "view on the classic marketplace" rows. Hidden by default;
// flip to true to surface them as an outbound, non-cart price-discovery row.
const SHOW_LEGACY_RESALES = false

// The classic marketplace item page for a token, in the SAME environment as the shop (derived from
// the builder URL's origin: decentraland.zone on dev/stg, decentraland.org on prod).
function marketplaceItemUrl(contractAddress: string, tokenId: string): string {
  let origin = 'https://decentraland.org'
  try {
    origin = new URL(config.builderUrl).origin
  } catch {
    // keep the production default
  }
  return `${origin}/marketplace/contracts/${contractAddress}/tokens/${tokenId}`
}

// A legacy (MANA-priced) resale row → the LegacyListing shape MarketCheckout consumes. The money flow
// keys off tradeId + manaWei (not listingType), so 'primary' here is just the type's only allowed
// value; the checkout buys whatever token the trade sells.
function resaleToLegacyListing(r: UnifiedListing): LegacyListing {
  return {
    tradeId: r.tradeId ?? r.id,
    listingType: 'primary',
    contractAddress: r.contractAddress,
    itemId: r.itemId ?? '',
    name: r.name,
    thumbnail: r.thumbnail,
    rarity: r.rarity,
    category: r.category,
    wearableCategory: r.wearableCategory ?? null,
    creator: r.creator,
    manaWei: r.manaWei ?? '0',
    available: 1,
    network: r.network,
    chainId: r.chainId,
    createdAt: 0
  }
}

// Open resales (secondary listings) for THIS item, shown below the main detail. Every row sourced from
// the unified feed is a credit-buyable off-chain trade: NATIVE rows (fixed credits) buy via the shop's
// BuyModal + Add to cart; LEGACY rows (MANA, "≈ credits") buy via the market/credits MarketCheckout
// (Buy-only, mirroring the browse grid, which never carts legacy). Classic on-chain orders (no trade)
// are non-buyable and hidden by default (SHOW_LEGACY_RESALES).
export function ItemResales({ item }: { item: CatalogItem }) {
  const contractAddress = item.contractAddress
  const itemId = item.itemId
  const qc = useQueryClient()
  const add = useCart(s => s.add)
  const cartItems = useCart(s => s.items)
  const { session } = useWallet()
  const address = session?.address?.toLowerCase()

  const [buyNative, setBuyNative] = useState<CatalogItem | null>(null)
  const [buyLegacy, setBuyLegacy] = useState<LegacyListing | null>(null)
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)

  const { data: resales = [], isLoading } = useQuery({
    queryKey: ['item-resales', contractAddress, itemId],
    enabled: !!contractAddress && !!itemId,
    // Cheapest-first (fetchItemResales sorts ascending by credit price) so the best price is on top.
    queryFn: () => fetchItemResales(contractAddress, itemId as string)
  })

  // Only the current page is rendered — and only its tokens are looked up for seller/issued number.
  const visibleResales = resales.slice(0, visibleCount)
  const visibleTokenIds = visibleResales.map(r => r.tokenId).filter((id): id is string => !!id)

  // The unified feed carries NEITHER seller NOR issued number, so resolve them per visible token from
  // /v1/nfts (bounded to the page). Recommended follow-up: have the feed expose seller/issuedId so this
  // extra round-trip goes away.
  const { data: tokenInfo = {} } = useQuery({
    queryKey: ['resale-token-info', contractAddress, visibleTokenIds.join(',')],
    enabled: !!contractAddress && visibleTokenIds.length > 0,
    staleTime: 60_000,
    queryFn: () => fetchResaleTokenInfos(contractAddress, visibleTokenIds)
  })

  const { data: classicOrders = [] } = useQuery({
    queryKey: ['item-classic-orders', contractAddress, itemId],
    enabled: SHOW_LEGACY_RESALES && !!contractAddress && !!itemId,
    queryFn: () => fetchClassicItemOrders(contractAddress, itemId as string)
  })

  // Only read the oracle when there's a legacy (MANA) resale to lock a price for.
  const hasLegacy = resales.some(r => r.source === 'legacy')
  const { data: rate } = useManaRate(hasLegacy)

  function refetchResales() {
    void qc.invalidateQueries({ queryKey: ['item-resales', contractAddress, itemId] })
  }

  // Still resolving the feed → render nothing to avoid a flash of an empty box.
  if (isLoading) return null
  const showClassic = SHOW_LEGACY_RESALES && classicOrders.length > 0
  if (resales.length === 0 && !showClassic) return null

  return (
    <section className="resales" data-testid="resales-section">
      <div className="resales__head">
        <h2 className="resales__title">{t('resales.title')}</h2>
        <p className="resales__subtitle">{t('resales.subtitle')}</p>
      </div>

      {resales.length > 0 ? (
        <>
          <ul className="resales__list">
            {visibleResales.map(r => {
              const isLegacy = r.source === 'legacy'
              const inCart = cartItems.some(i => i.id === r.id)
              const info = (r.tokenId && tokenInfo[r.tokenId]) || {}
              const issuedId = info.issuedId ?? r.issuedId
              const seller = info.seller
              // Your own resale: never buyable (you already own the token). Render it clearly as your
              // listing with no Buy / Add-to-cart, instead of hiding it (so you can see it's listed).
              const isOwn = !!seller && !!address && seller.toLowerCase() === address
              return (
                <li
                  key={r.tradeId ?? r.id}
                  className={`resales__row${isLegacy ? ' resales__row--legacy' : ''}`}
                  data-testid="resale-row"
                  data-source={r.source}
                  data-own={isOwn ? 'true' : undefined}
                >
                  {r.thumbnail ? <img className="resales__thumb" src={r.thumbnail} alt="" aria-hidden /> : null}
                  <div className="resales__meta">
                    {issuedId ? (
                      <span className="resales__issued" data-testid="resale-issued">
                        #{issuedId}
                      </span>
                    ) : (
                      <span className="resales__issued resales__issued--muted">{t('resales.copy')}</span>
                    )}
                    {seller ? (
                      <div className="resales__seller" data-testid="resale-seller">
                        <span className="resales__seller-label">{t('resales.seller')}</span>
                        <CreatorBadge address={seller} className="resales__seller-badge" linkToProfile hidePrefix />
                      </div>
                    ) : null}
                  </div>
                  <div className={`resales__price${isLegacy ? ' resales__price--approx' : ''}`}>
                    {isLegacy ? (
                      <span className="resales__approx" aria-hidden>
                        ≈
                      </span>
                    ) : null}
                    <CurrencyIcon className="resales__diamond" />
                    <span className="resales__price-value">{formatCredits(r.priceCredits)}</span>
                  </div>
                  <div className="resales__actions">
                    {isOwn ? (
                      <span className="chip resales__own-chip" data-testid="resale-own">
                        {t('resales.yourListing')}
                      </span>
                    ) : isLegacy ? (
                      // Legacy (MANA) resale: Buy-only via the market/credits checkout (no cart — the cart
                      // assumes fixed credit prices; a MANA line's price floats with the rate).
                      <button
                        className="resales__buy"
                        onClick={() => setBuyLegacy(resaleToLegacyListing(r))}
                        aria-label={t('assetCard.buyNow')}
                        data-testid="resale-buy"
                      >
                        {t('assetCard.buyNow')}
                      </button>
                    ) : (
                      <>
                        <button
                          className="resales__add"
                          onClick={() => add(r, 'item_detail')}
                          disabled={inCart}
                          aria-label={inCart ? t('assetCard.inCart') : t('assetCard.addToCart')}
                          data-testid="resale-add"
                        >
                          <Icon name="cart-solid" size={16} />
                          <span>{inCart ? t('assetCard.inCart') : t('assetCard.addToCart')}</span>
                        </button>
                        <button
                          className="resales__buy"
                          onClick={() => setBuyNative(r)}
                          aria-label={t('assetCard.buyNow')}
                          data-testid="resale-buy"
                        >
                          {t('assetCard.buyNow')}
                        </button>
                      </>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
          {resales.length > visibleCount ? (
            <button
              className="resales__more"
              onClick={() => setVisibleCount(c => c + PAGE_SIZE)}
              data-testid="resale-show-more"
            >
              {t('resales.showMore')}
            </button>
          ) : null}
        </>
      ) : null}

      {showClassic ? (
        <div className="resales__legacy" data-testid="resales-classic">
          <div className="resales__legacy-head">
            <span className="resales__legacy-title">{t('resales.legacyTitle')}</span>
            <span className="resales__legacy-note">{t('resales.legacyNote')}</span>
          </div>
          <ul className="resales__list">
            {classicOrders.map(o => (
              <li key={o.tokenId} className="resales__row resales__row--legacy" data-testid="classic-order-row">
                <div className="resales__id">
                  {o.issuedId ? <span className="resales__issued">#{o.issuedId}</span> : null}
                  <span className="chip resales__legacy-chip">{t('resales.classicBadge')}</span>
                </div>
                <div className="resales__actions">
                  <a
                    className="resales__view-market"
                    href={marketplaceItemUrl(o.contractAddress, o.tokenId)}
                    target="_blank"
                    rel="noopener noreferrer"
                    data-testid="classic-view-market"
                  >
                    <span>{t('resales.viewOnMarketplace')}</span>
                    <Icon name="external-link" size={14} />
                  </a>
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {buyNative ? (
        <BuyModal
          item={buyNative}
          onClose={() => {
            setBuyNative(null)
            refetchResales()
          }}
        />
      ) : null}
      {buyLegacy && rate ? (
        <MarketCheckout
          listing={buyLegacy}
          rate={rate}
          onClose={() => setBuyLegacy(null)}
          onSold={() => {
            setBuyLegacy(null)
            refetchResales()
          }}
        />
      ) : null}
    </section>
  )
}

export default ItemResales
