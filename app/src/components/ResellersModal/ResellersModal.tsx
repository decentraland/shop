import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { config } from '~/config'
import { useCart } from '~/store/cart'
import { useWallet } from '~/store/wallet'
import { useLocale } from '~/store/locale'
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
import * as S from './ResellersModal.styles'

const PAGE_SIZE = 10

// Classic ON-CHAIN orders (old Marketplace.sol, no off-chain tradeId) can't be fulfilled by the
// credits rail, so they're non-buyable "view on the classic marketplace" rows. Hidden by default;
// flip to true to surface them as an outbound, non-cart price-discovery row.
const SHOW_LEGACY_RESALES = false

type SortKey = 'cheapest' | 'most_expensive'

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

function ordinal(day: number): string {
  if (day % 100 >= 11 && day % 100 <= 13) return 'th'
  return ['th', 'st', 'nd', 'rd'][day % 10] ?? 'th'
}

// English carries the ordinal suffix the design shows ("June 16th, 2026"); every other locale uses its
// own long-date form.
function formatExpiration(ms: number, locale: string): string {
  const d = new Date(ms)
  if (Number.isNaN(d.getTime())) return '—'
  if (locale === 'en') {
    const month = new Intl.DateTimeFormat('en', { month: 'long' }).format(d)
    return `${month} ${d.getDate()}${ordinal(d.getDate())}, ${d.getFullYear()}`
  }
  return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long', year: 'numeric' }).format(d)
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

type Labels = { owner: string; itemNumber: string; expiration: string; price: string }

function ResellerRow({
  r,
  seller,
  issuedId,
  labels,
  locale,
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
  labels: Labels
  locale: string
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
    <img className="owner-ava" src={face} alt="" loading="lazy" onError={() => setBroken(true)} />
  ) : seller ? (
    <span className="owner-ava" style={{ backgroundColor: colorForAddress(seller) }} aria-hidden>
      {initialFor(profile?.name, seller)}
    </span>
  ) : fallbackImage ? (
    <img className="owner-ava" src={fallbackImage} alt="" aria-hidden />
  ) : (
    <span className="owner-ava" aria-hidden />
  )

  const ownerBody = (
    <>
      {avatar}
      {name ? (
        <span className="owner-name" data-testid="resale-seller">
          {name}
        </span>
      ) : null}
    </>
  )

  return (
    <tr data-testid="resale-row" data-source={r.source} data-own={isOwn ? 'true' : undefined}>
      <td data-label={labels.owner}>
        {seller ? (
          <S.OwnerButton type="button" onClick={() => navigate(`/items/creator/${seller}`)}>
            {ownerBody}
          </S.OwnerButton>
        ) : (
          <S.Owner>{ownerBody}</S.Owner>
        )}
      </td>
      <td data-label={labels.itemNumber}>
        {issuedId ? <span data-testid="resale-issued">#{issuedId}</span> : <S.Muted>—</S.Muted>}
      </td>
      <td data-label={labels.expiration}>
        {r.saleEndsAt ? formatExpiration(r.saleEndsAt, locale) : <S.Muted>—</S.Muted>}
      </td>
      <td data-label={labels.price}>
        <S.PriceCell>
          <span className="amount">
            {isLegacy ? (
              <span className="approx" aria-hidden>
                ≈
              </span>
            ) : null}
            <CurrencyIcon className="ccy" />
            <span>{formatCredits(r.priceCredits)}</span>
          </span>
          <S.Actions data-persistent={isOwn ? 'true' : undefined}>
            {isOwn ? (
              <S.OwnChip data-testid="resale-own">{t('resales.yourListing')}</S.OwnChip>
            ) : isLegacy ? (
              // Legacy (MANA) resale: Buy-only via the market/credits checkout (no cart — the cart
              // assumes fixed credit prices; a MANA line's price floats with the rate).
              <S.BuyBtn onClick={onBuyLegacy} aria-label={t('assetCard.buyNow')} data-testid="resale-buy">
                {t('resales.buy')}
              </S.BuyBtn>
            ) : (
              // Short labels so both pills fit the designed price cell; the full action stays in the
              // accessible name.
              <>
                <S.AddBtn
                  onClick={onAdd}
                  disabled={inCart}
                  aria-label={inCart ? t('assetCard.inCart') : t('assetCard.addToCart')}
                  data-testid="resale-add"
                >
                  <Icon name="cart" className="ico" />
                  <span>{inCart ? t('assetCard.inCart') : t('resales.add')}</span>
                </S.AddBtn>
                <S.BuyBtn onClick={onBuyNative} aria-label={t('assetCard.buyNow')} data-testid="resale-buy">
                  {t('resales.buy')}
                </S.BuyBtn>
              </>
            )}
          </S.Actions>
        </S.PriceCell>
      </td>
    </tr>
  )
}

/**
 * Open resales (secondary listings) for one item, in a modal opened from the detail page. Every row
 * from the unified feed is a credit-buyable off-chain trade: NATIVE rows (fixed credits) buy via the
 * shop's BuyModal + Add to cart; LEGACY rows (MANA, "≈ credits") buy via the market/credits
 * MarketCheckout (Buy-only, mirroring the browse grid, which never carts legacy). Classic on-chain
 * orders (no trade) are non-buyable and hidden by default (SHOW_LEGACY_RESALES).
 */
export function ResellersModal({ item, onClose }: { item: CatalogItem; onClose: () => void }) {
  const contractAddress = item.contractAddress
  const itemId = item.itemId
  const qc = useQueryClient()
  const add = useCart(s => s.add)
  const cartItems = useCart(s => s.items)
  const { session } = useWallet()
  const locale = useLocale(s => s.locale)
  const address = session?.address?.toLowerCase()
  const cardRef = useRef<HTMLDivElement>(null)

  const [buyNative, setBuyNative] = useState<CatalogItem | null>(null)
  const [buyLegacy, setBuyLegacy] = useState<LegacyListing | null>(null)
  const [sort, setSort] = useState<SortKey>('cheapest')
  const [page, setPage] = useState(0)

  // A checkout is layered on top of this modal — Escape/scrim there must not also close this one.
  const checkoutOpen = !!buyNative || !!buyLegacy

  useEffect(() => {
    cardRef.current?.focus()
  }, [])

  // Escape closes; body scroll is locked so the page behind can't scroll under the scrim.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !checkoutOpen) onClose()
    }
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [checkoutOpen, onClose])

  const { data: resales = [], isLoading } = useQuery({
    queryKey: ['item-resales', contractAddress, itemId],
    enabled: !!contractAddress && !!itemId,
    // Money-sensitive: secondary listings/prices can change under us (3rd-party buy/list/cancel). Never
    // serve the 30s-stale default — revalidate on every remount and tab refocus (see ItemDetail PDP).
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
    // Cheapest-first (fetchItemResales sorts ascending by credit price) so the best price is on top.
    queryFn: () => fetchItemResales(contractAddress, itemId as string)
  })

  const sorted = useMemo(
    () => (sort === 'cheapest' ? resales : [...resales].sort((a, b) => b.priceCredits - a.priceCredits)),
    [resales, sort]
  )
  const pageCount = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE))
  const safePage = Math.min(page, pageCount - 1)
  const visibleResales = sorted.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE)

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

  const labels: Labels = {
    owner: t('resales.colOwner'),
    itemNumber: t('resales.colItemNumber'),
    expiration: t('resales.colExpiration'),
    price: t('resales.colPrice')
  }
  const showClassic = SHOW_LEGACY_RESALES && classicOrders.length > 0

  return (
    <>
      <S.Scrim onClick={checkoutOpen ? undefined : onClose} role="presentation">
        <S.Card
          ref={cardRef}
          tabIndex={-1}
          onClick={e => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-label={t('resales.modalTitle')}
          data-testid="resellers-modal"
        >
          <S.Head>
            <S.Title>{t('resales.modalTitle')}</S.Title>
            <S.Close onClick={onClose} aria-label={t('resales.close')} data-testid="resellers-close">
              <Icon name="close" />
            </S.Close>
          </S.Head>

          <S.Body>
            <S.Toolbar>
              <S.Count data-testid="resales-count">{t('resales.count', { count: resales.length })}</S.Count>
              <S.SortBy>
                <select
                  value={sort}
                  onChange={e => {
                    setSort(e.target.value as SortKey)
                    setPage(0)
                  }}
                  aria-label={t('resales.sortLabel')}
                  data-testid="resales-sort"
                >
                  <option value="cheapest">{t('resales.sortCheapest')}</option>
                  <option value="most_expensive">{t('resales.sortExpensive')}</option>
                </select>
                <Icon name="chevron-down" className="chev" />
              </S.SortBy>
            </S.Toolbar>

            {isLoading ? null : sorted.length === 0 && !showClassic ? (
              <S.Empty data-testid="resales-empty">{t('resales.empty')}</S.Empty>
            ) : null}

            {sorted.length > 0 ? (
              <>
                <S.TableWrap>
                  <S.Table>
                    <thead>
                      <tr>
                        <th scope="col">{labels.owner}</th>
                        <th scope="col">{labels.itemNumber}</th>
                        <th scope="col">{labels.expiration}</th>
                        <th scope="col">{labels.price}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleResales.map(r => {
                        const isLegacy = r.source === 'legacy'
                        const inCart = cartItems.some(i => i.id === r.id)
                        const info = (r.tokenId && tokenInfo[r.tokenId]) || {}
                        // Prefer the feed's own fields; fall back to the per-token lookup only where the
                        // feed is missing them.
                        const issuedId = r.issuedId ?? info.issuedId
                        const seller = r.seller ?? info.seller
                        // Secondary (per-token) feed rows don't carry the item's name/thumbnail (that
                        // metadata lives on the item, not the token), so a resale added to the cart would
                        // show a blank name. Every resale here is a copy of THIS item, so backfill the
                        // display fields from the PDP item before it goes into the cart / buy modal. (|| for
                        // display strings — an empty string counts as absent; ?? for the nullable enums
                        // where null is a meaningful "unset".)
                        const display: UnifiedListing = {
                          ...r,
                          name: r.name || item.name,
                          thumbnail: r.thumbnail || item.thumbnail,
                          rarity: r.rarity || item.rarity,
                          category: r.category || item.category,
                          wearableCategory: r.wearableCategory ?? item.wearableCategory,
                          gender: r.gender ?? item.gender
                        }
                        // Your own resale: never buyable (you already own the token). Render it clearly as
                        // your listing with no Buy / Add-to-cart, instead of hiding it (so you can see it's
                        // listed).
                        const isOwn = !!seller && !!address && seller.toLowerCase() === address
                        return (
                          <ResellerRow
                            key={r.tradeId ?? r.id}
                            r={display}
                            seller={seller}
                            issuedId={issuedId}
                            labels={labels}
                            locale={locale}
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
                    </tbody>
                  </S.Table>
                </S.TableWrap>

                {pageCount > 1 ? (
                  <S.Pager>
                    <S.PageBtn
                      data-dir="prev"
                      onClick={() => setPage(p => Math.max(0, p - 1))}
                      disabled={safePage === 0}
                      aria-label={t('resales.prevPage')}
                      data-testid="resale-prev-page"
                    >
                      <Icon name="chevron-down" />
                    </S.PageBtn>
                    <S.PageLabel data-testid="resale-page-label">
                      {t('resales.page', { page: safePage + 1, total: pageCount })}
                    </S.PageLabel>
                    <S.PageBtn
                      onClick={() => setPage(p => Math.min(pageCount - 1, p + 1))}
                      disabled={safePage >= pageCount - 1}
                      aria-label={t('resales.nextPage')}
                      data-testid="resale-next-page"
                    >
                      <Icon name="chevron-down" />
                    </S.PageBtn>
                  </S.Pager>
                ) : null}
              </>
            ) : null}

            {showClassic ? (
              <S.Classic data-testid="resales-classic">
                <span className="classic-title">{t('resales.legacyTitle')}</span>
                <span className="classic-note">{t('resales.legacyNote')}</span>
                <S.TableWrap>
                  <S.Table>
                    <tbody>
                      {classicOrders.map(o => (
                        <tr key={o.tokenId} data-testid="classic-order-row">
                          <td data-label={labels.itemNumber}>
                            {o.issuedId ? <span>#{o.issuedId}</span> : <S.Muted>—</S.Muted>}
                          </td>
                          <td>
                            <S.ClassicChip>{t('resales.classicBadge')}</S.ClassicChip>
                          </td>
                          <td>
                            <S.ClassicLink
                              href={marketplaceItemUrl(o.contractAddress, o.tokenId)}
                              target="_blank"
                              rel="noopener noreferrer"
                              data-testid="classic-view-market"
                            >
                              <span>{t('resales.viewOnMarketplace')}</span>
                              <Icon name="external-link" className="ico" />
                            </S.ClassicLink>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </S.Table>
                </S.TableWrap>
              </S.Classic>
            ) : null}
          </S.Body>
        </S.Card>
      </S.Scrim>

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
    </>
  )
}

export default ResellersModal
