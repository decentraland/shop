import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Rarity } from '@dcl/schemas'
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
import { useProfile } from '~/hooks/useProfile'
import { formatCredits } from '~/lib/currency'
import { capitalizeFirst } from '~/lib/text'
import { CurrencyIcon } from '~/components/CurrencyIcon'
import { Icon } from '~/components/Icon'
import { BuyModal } from '~/components/BuyModal'
import { MarketCheckout } from '~/components/MarketCheckout'
import { t } from '~/intl/i18n'
import './item-resales.css'

// How many resale rows to show before "See more". Keeps a hot item's long tail of listings from
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

// The item's total supply = its rarity's max supply (the classic marketplace shows serials as
// "#N / maxSupply"). Rarity-derived, so no extra fetch. Undefined for an unknown rarity → the serial
// line drops the "of N" suffix rather than showing a wrong total.
function totalSupplyFor(rarity?: string): number | undefined {
  if (!rarity) return undefined
  const key = rarity.toLowerCase()
  // Guard against an unknown rarity explicitly (instead of catching getMaxSupply throwing): only call
  // it for a value that's actually one of the schema's rarities.
  const isRarity = (Object.values(Rarity) as unknown[]).includes(key)
  return isRarity ? Rarity.getMaxSupply(key as Rarity) : undefined
}

function shortAddress(addr: string): string {
  return /^0x[a-fA-F0-9]{40}$/.test(addr) ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : addr
}

// Deterministic, readable color from the address so a seller without a face snapshot keeps a stable
// hue (mid lightness so the white initial stays legible). Mirrors CreatorBadge.
function colorForAddress(addr: string): string {
  let hash = 0
  for (let i = 0; i < addr.length; i++) hash = (hash * 31 + addr.charCodeAt(i)) >>> 0
  return `hsl(${hash % 360}, 52%, 45%)`
}

function initialFor(name: string | undefined, address: string): string {
  return (name?.trim()?.[0] || address.replace(/^0x/i, '')[0] || '?').toUpperCase()
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

// One reseller row: the seller's avatar leads, then their name + serial number, then price + actions.
// `useProfile` (per row, deduped by react-query) resolves the seller's face + display name.
function ResellerRow({
  r,
  seller,
  issuedId,
  total,
  isOwn,
  isLegacy,
  inCart,
  fallbackImage,
  onAdd,
  onBuyNative,
  onBuyLegacy
}: {
  r: UnifiedListing
  seller?: string
  issuedId?: string
  total?: number
  isOwn: boolean
  isLegacy: boolean
  inCart: boolean
  fallbackImage?: string
  onAdd: () => void
  onBuyNative: () => void
  onBuyLegacy: () => void
}) {
  const navigate = useNavigate()
  const { data: profile } = useProfile(seller)
  const face = profile?.avatar?.snapshots?.face256
  // `broken` resets when the face url changes because rows reuse component instances across sellers.
  const [broken, setBroken] = useState(false)
  useEffect(() => setBroken(false), [face])

  const showFace = !!face && !broken
  const name = seller ? (profile?.name ? capitalizeFirst(profile.name) : shortAddress(seller)) : undefined

  const avatar = showFace ? (
    <img className="resales__ava" src={face} alt="" loading="lazy" onError={() => setBroken(true)} />
  ) : seller ? (
    <span
      className="resales__ava resales__ava--letter"
      style={{ backgroundColor: colorForAddress(seller) }}
      aria-hidden
    >
      {initialFor(profile?.name, seller)}
    </span>
  ) : fallbackImage ? (
    <img className="resales__ava" src={fallbackImage} alt="" aria-hidden />
  ) : (
    <span className="resales__ava resales__ava--empty" aria-hidden />
  )

  const ident = (
    <span className="resales__ident">
      {name ? (
        <span className="resales__name" data-testid="resale-seller">
          {name}
        </span>
      ) : null}
      {issuedId ? (
        <span className="resales__serial">
          {t('resales.serialLabel')}{' '}
          <span className="resales__issued" data-testid="resale-issued">
            #{issuedId}
          </span>
          {total ? ` ${t('resales.serialOf')} ${total.toLocaleString('en-US')}` : ''}
        </span>
      ) : (
        <span className="resales__serial resales__serial--muted">{t('resales.copy')}</span>
      )}
    </span>
  )

  const who = seller ? (
    <button
      type="button"
      className="resales__who resales__who--link"
      onClick={() => navigate(`/assets/creator/${seller}`)}
    >
      {avatar}
      {ident}
    </button>
  ) : (
    <div className="resales__who">
      {avatar}
      {ident}
    </div>
  )

  return (
    <li
      className={`resales__row${isLegacy ? ' resales__row--legacy' : ''}`}
      data-testid="resale-row"
      data-source={r.source}
      data-own={isOwn ? 'true' : undefined}
    >
      {who}
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
          // Legacy (MANA) resale: Buy-only via the market/credits checkout (no cart — the cart assumes
          // fixed credit prices; a MANA line's price floats with the rate).
          <button
            className="resales__buy"
            onClick={onBuyLegacy}
            aria-label={t('assetCard.buyNow')}
            data-testid="resale-buy"
          >
            {t('assetCard.buyNow')}
          </button>
        ) : (
          <>
            <button
              className="resales__add"
              onClick={onAdd}
              disabled={inCart}
              aria-label={inCart ? t('assetCard.inCart') : t('assetCard.addToCart')}
              data-testid="resale-add"
            >
              <Icon name="cart-solid" size={16} />
              <span>{inCart ? t('assetCard.inCart') : t('assetCard.addToCart')}</span>
            </button>
            <button
              className="resales__buy"
              onClick={onBuyNative}
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
}

// Open resales (secondary listings) for THIS item, shown below the main detail as a "Resellers" table.
// Every row sourced from the unified feed is a credit-buyable off-chain trade: NATIVE rows (fixed
// credits) buy via the shop's BuyModal + Add to cart; LEGACY rows (MANA, "≈ credits") buy via the
// market/credits MarketCheckout (Buy-only, mirroring the browse grid, which never carts legacy).
// Classic on-chain orders (no trade) are non-buyable and hidden by default (SHOW_LEGACY_RESALES).
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

  const total = totalSupplyFor(item.rarity)

  const { data: resales = [], isLoading } = useQuery({
    queryKey: ['item-resales', contractAddress, itemId],
    enabled: !!contractAddress && !!itemId,
    // Cheapest-first (fetchItemResales sorts ascending by credit price) so the best price is on top.
    queryFn: () => fetchItemResales(contractAddress, itemId as string)
  })

  const visibleResales = resales.slice(0, visibleCount)

  // The feed now carries seller + issued number per secondary row. Only rows STILL missing either
  // (older server, or a gap in the feed) fall back to the per-token /v1/nfts lookup — so once the
  // server populates them for every row this N+1 goes away on its own (the list becomes empty).
  const lookupTokenIds = visibleResales
    .filter(r => !r.seller || !r.issuedId)
    .map(r => r.tokenId)
    .filter((id): id is string => !!id)

  const { data: tokenInfo = {} } = useQuery({
    queryKey: ['resale-token-info', contractAddress, lookupTokenIds.join(',')],
    enabled: !!contractAddress && lookupTokenIds.length > 0,
    staleTime: 60_000,
    queryFn: () => fetchResaleTokenInfos(contractAddress, lookupTokenIds)
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
              // Prefer the feed's own fields; fall back to the per-token lookup only where the feed is
              // missing them.
              const issuedId = r.issuedId ?? info.issuedId
              const seller = r.seller ?? info.seller
              // Secondary (per-token) feed rows don't carry the item's name/thumbnail (that metadata
              // lives on the item, not the token), so a resale added to the cart would show a blank
              // name. Every resale here is a copy of THIS item, so backfill the display fields from the
              // PDP item before it goes into the cart / buy modal. (|| for display strings — an empty
              // string counts as absent; ?? for the nullable enums where null is a meaningful "unset".)
              const display: UnifiedListing = {
                ...r,
                name: r.name || item.name,
                thumbnail: r.thumbnail || item.thumbnail,
                rarity: r.rarity || item.rarity,
                category: r.category || item.category,
                wearableCategory: r.wearableCategory ?? item.wearableCategory,
                gender: r.gender ?? item.gender
              }
              // Your own resale: never buyable (you already own the token). Render it clearly as your
              // listing with no Buy / Add-to-cart, instead of hiding it (so you can see it's listed).
              const isOwn = !!seller && !!address && seller.toLowerCase() === address
              return (
                <ResellerRow
                  key={r.tradeId ?? r.id}
                  r={display}
                  seller={seller}
                  issuedId={issuedId}
                  total={total}
                  isOwn={isOwn}
                  isLegacy={isLegacy}
                  inCart={inCart}
                  fallbackImage={display.thumbnail}
                  onAdd={() => add(display, 'item_detail')}
                  onBuyNative={() => setBuyNative(display)}
                  onBuyLegacy={() => setBuyLegacy(resaleToLegacyListing(display))}
                />
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
