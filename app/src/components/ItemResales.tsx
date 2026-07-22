import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { config } from '~/config'
import { useCart } from '~/store/cart'
import { fetchItemResales, fetchLegacyItemOrders, type CatalogItem, type ItemResale } from '~/lib/api'
import { useManaRate } from '~/hooks/useManaRate'
import { manaWeiToCredits } from '~/lib/mana-rate'
import { formatCredits } from '~/lib/currency'
import { CurrencyIcon } from '~/components/CurrencyIcon'
import { Icon } from '~/components/Icon'
import { t } from '~/intl/i18n'
import './item-resales.css'

// Legacy (classic MANA-priced) orders can't be fulfilled by the credits rail, so they render as
// price-discovery-only rows that link out. Flip to false to hide them entirely (e.g. on localhost).
const SHOW_LEGACY_RESALES = true

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

// Project a resale onto the CatalogItem shape the cart + BuyModal consume: same item identity, but the
// listing's own trade/token/price. issuedId is taken ONLY from the resale (never inherited from the
// currently-viewed token, which is a different copy); the shop feed doesn't carry it, so it's usually
// absent. Stock/sale fields are cleared — a secondary token has neither.
function resaleToCartItem(item: CatalogItem, r: ItemResale): CatalogItem {
  return {
    ...item,
    id: r.tradeId,
    tradeId: r.tradeId,
    tokenId: r.tokenId,
    issuedId: r.issuedId,
    priceCredits: r.priceCredits,
    thumbnail: r.image || item.thumbnail,
    available: undefined,
    compareAtCredits: undefined,
    saleEndsAt: undefined
  }
}

// Open secondary listings for THIS item, shown below the main detail. Shop (credit-buyable) resales
// are first-class rows with Add to cart + Buy; classic (MANA) orders are price-discovery-only rows
// that link out to the classic marketplace.
export function ItemResales({
  item,
  onBuy
}: {
  item: CatalogItem
  /** Open the single-buy flow (BuyModal) for a resale, wired exactly like the top-of-page Buy. */
  onBuy: (resale: CatalogItem) => void
}) {
  const contractAddress = item.contractAddress
  const itemId = item.itemId
  const add = useCart(s => s.add)
  const cartItems = useCart(s => s.items)

  const { data: resales = [], isLoading } = useQuery({
    queryKey: ['item-resales', contractAddress, itemId],
    enabled: !!contractAddress && !!itemId,
    queryFn: () => fetchItemResales(contractAddress, itemId as string)
  })

  const { data: legacyOrders = [] } = useQuery({
    queryKey: ['item-legacy-orders', contractAddress, itemId],
    enabled: SHOW_LEGACY_RESALES && !!contractAddress && !!itemId,
    queryFn: () => fetchLegacyItemOrders(contractAddress, itemId as string)
  })

  // Only read the oracle when there are legacy orders to price.
  const { data: rate } = useManaRate(SHOW_LEGACY_RESALES && legacyOrders.length > 0)

  const legacyRows = useMemo(
    () =>
      legacyOrders.map(o => ({
        ...o,
        priceCredits: rate ? manaWeiToCredits(o.manaWei, rate) : null
      })),
    [legacyOrders, rate]
  )

  // Still resolving the primary (credit-buyable) feed → render nothing to avoid a flash of an empty box.
  if (isLoading) return null
  if (resales.length === 0 && legacyRows.length === 0) return null

  return (
    <section className="resales" data-testid="resales-section">
      <div className="resales__head">
        <h2 className="resales__title">{t('resales.title')}</h2>
        <p className="resales__subtitle">{t('resales.subtitle')}</p>
      </div>

      {resales.length > 0 ? (
        <ul className="resales__list">
          {resales.map(r => {
            const cartItem = resaleToCartItem(item, r)
            const inCart = cartItems.some(i => i.id === cartItem.id)
            return (
              <li key={r.tradeId} className="resales__row" data-testid="resale-row">
                <div className="resales__id">
                  {r.image ? <img className="resales__thumb" src={r.image} alt="" aria-hidden /> : null}
                  {r.issuedId ? (
                    <span className="resales__issued" data-testid="resale-issued">
                      #{r.issuedId}
                    </span>
                  ) : (
                    <span className="resales__issued resales__issued--muted">{t('resales.copy')}</span>
                  )}
                </div>
                <div className="resales__price">
                  <CurrencyIcon className="resales__diamond" />
                  <span className="resales__price-value">{formatCredits(r.priceCredits)}</span>
                </div>
                <div className="resales__actions">
                  <button
                    className="resales__add"
                    onClick={() => add(cartItem, 'item_detail')}
                    disabled={inCart}
                    aria-label={inCart ? t('assetCard.inCart') : t('assetCard.addToCart')}
                    data-testid="resale-add"
                  >
                    <Icon name="cart-solid" size={16} />
                    <span>{inCart ? t('assetCard.inCart') : t('assetCard.addToCart')}</span>
                  </button>
                  <button
                    className="resales__buy"
                    onClick={() => onBuy(cartItem)}
                    aria-label={t('assetCard.buyNow')}
                    data-testid="resale-buy"
                  >
                    {t('assetCard.buyNow')}
                  </button>
                </div>
              </li>
            )
          })}
        </ul>
      ) : null}

      {SHOW_LEGACY_RESALES && legacyRows.length > 0 ? (
        <div className="resales__legacy" data-testid="resales-legacy">
          <div className="resales__legacy-head">
            <span className="resales__legacy-title">{t('resales.legacyTitle')}</span>
            <span className="resales__legacy-note">{t('resales.legacyNote')}</span>
          </div>
          <ul className="resales__list">
            {legacyRows.map(o => (
              <li key={o.tokenId} className="resales__row resales__row--legacy" data-testid="legacy-resale-row">
                <div className="resales__id">
                  {o.issuedId ? <span className="resales__issued">#{o.issuedId}</span> : null}
                  <span className="chip resales__legacy-chip">{t('resales.classicBadge')}</span>
                </div>
                <div className="resales__price resales__price--approx">
                  {o.priceCredits == null ? (
                    <span className="resales__price-value">—</span>
                  ) : (
                    <>
                      <span className="resales__approx" aria-hidden>
                        ≈
                      </span>
                      <CurrencyIcon className="resales__diamond" />
                      <span className="resales__price-value">{formatCredits(o.priceCredits)}</span>
                    </>
                  )}
                </div>
                <div className="resales__actions">
                  <a
                    className="resales__view-market"
                    href={marketplaceItemUrl(o.contractAddress, o.tokenId)}
                    target="_blank"
                    rel="noopener noreferrer"
                    data-testid="resale-view-market"
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
    </section>
  )
}

export default ItemResales
