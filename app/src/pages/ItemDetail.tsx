import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Rarity } from '@dcl/schemas'
import { config } from '~/config'
import { useCart } from '~/store/cart'
import { useWallet } from '~/store/wallet'
import { useBalance } from '~/hooks/useBalance'
import { fetchShopListingForItem, fetchTrade, fetchTradeForItem, usdWeiToCents, type CatalogItem } from '~/lib/api'
import { buyWithCredits } from '~/lib/buy'
import { buyGasless, waitForSettlement, GaslessUnavailableError } from '~/lib/buy-gasless'
import { gaslessEnabled } from '~/lib/gasless-config'
import { authorizeUsdCredit, cancelUsdIntents } from '~/lib/credits'
import { fetchCollectionItems } from '~/lib/collections'
import { ItemPreview } from '~/components/ItemPreview'
import { CollectionCarousel } from '~/components/CollectionCarousel'
import { CreatorBadge } from '~/components/CreatorBadge'
import { CurrencyIcon } from '~/components/CurrencyIcon'
import { SaleCountdown } from '~/components/SaleCountdown'
import { isSaleActive, saleDiscountPct } from '~/lib/sale'
import { CURRENCY } from '~/lib/currency'
import { track, itemProps, purchaseItemsProps, errorCode, isUserRejection, creditsToUsd } from '~/lib/analytics'
import { recordViewed } from '~/lib/recently-viewed'
import { captureError } from '~/lib/monitoring'
import './item-detail.css'

function isValidRarity(r: string): r is Rarity {
  return (Object.values(Rarity) as string[]).includes(r)
}

function genderLabel(gender: CatalogItem['gender']): string | null {
  if (gender === 'male') return 'Male'
  if (gender === 'female') return 'Female'
  if (gender === 'unisex') return 'Unisex'
  return null
}

function friendlyError(e: unknown): string {
  const err = e as { code?: number; message?: string }
  const msg = (err.message ?? '').toLowerCase()
  if (err.code === 4001 || msg.includes('reject') || msg.includes('denied') || msg.includes('cancel')) {
    return 'You cancelled the request.'
  }
  if (msg.includes('insufficient')) return `You don't have enough ${CURRENCY.name} — get more first.`
  if (msg.includes('no active listing') || msg.includes('not for sale')) return 'This item is not for sale right now.'
  return "Couldn't complete checkout — please try again."
}

export function ItemDetail() {
  const { contractAddress, tokenId } = useParams<{ contractAddress: string; tokenId: string }>()
  const { state } = useLocation() as { state?: { item?: CatalogItem; tradeId?: string } }
  const navigate = useNavigate()

  const add = useCart(s => s.add)
  const cartItems = useCart(s => s.items)
  const { session } = useWallet()
  const { data: balance } = useBalance(session)

  // The currently-displayed item. Seeded from router state (fast path from the grid); swapped in place
  // when a carousel sibling is tapped (no full reload). Falls back to a stub for deep links/refresh
  // (name/thumbnail/price then fill in from the collection fetch below).
  const [current, setCurrent] = useState<CatalogItem>(() => {
    if (state?.item) return { ...state.item, tradeId: state.tradeId ?? state.item.tradeId }
    return {
      id: `${contractAddress}-${tokenId}`,
      name: '',
      creator: '',
      contractAddress: contractAddress ?? '',
      itemId: null,
      category: 'wearable',
      rarity: 'common',
      network: 'MATIC',
      chainId: config.chainId,
      thumbnail: '',
      priceCredits: 0,
      gender: null,
      tokenId: tokenId ?? undefined,
      tradeId: state?.tradeId
    }
  })

  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Sibling items of the same collection (the "more from this collection" carousel).
  const { data: siblings = [], isFetched: siblingsFetched } = useQuery({
    queryKey: ['collection-items', current.contractAddress],
    enabled: !!current.contractAddress,
    queryFn: () => fetchCollectionItems(current.contractAddress, { first: 20 }).then(r => r.items)
  })

  // Deep-link / refresh: the route segment is the itemId for primary listings. Hydrate the item
  // (name, price, tradeId) straight from the shop feed so it resolves correctly (a primary itemId is
  // NOT a tokenId — the sibling fallback below would otherwise mis-match).
  const { data: deepLinkItem, isLoading: deepLinkLoading } = useQuery({
    queryKey: ['shop-item', current.contractAddress, tokenId],
    enabled: !state?.item && !!current.contractAddress && !!tokenId,
    queryFn: () => fetchShopListingForItem(current.contractAddress, tokenId as string)
  })
  useEffect(() => {
    if (deepLinkItem) setCurrent(prev => (prev.tradeId ? prev : { ...deepLinkItem }))
  }, [deepLinkItem])

  // Fallback backfill: if still unhydrated (e.g. not currently on sale), fill from the matching
  // sibling once the collection resolves.
  useEffect(() => {
    if (current.name || siblings.length === 0) return
    const match =
      (tokenId && siblings.find(s => s.tokenId === tokenId || s.itemId === tokenId)) ||
      siblings.find(s => s.contractAddress === current.contractAddress)
    if (match) setCurrent(prev => ({ ...match, tradeId: prev.tradeId ?? match.tradeId }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [siblings])

  // Carousel = OTHER items from the collection: drop the currently-viewed item + dedupe.
  const carouselItems = useMemo(() => {
    const seen = new Set<string>()
    const out: CatalogItem[] = []
    for (const s of siblings) {
      if (s.id === current.id) continue
      if (current.itemId && s.itemId === current.itemId) continue
      if (current.tokenId && s.tokenId === current.tokenId) continue
      const key = `${s.contractAddress}-${s.itemId ?? s.tokenId ?? s.id}`
      if (seen.has(key)) continue
      seen.add(key)
      out.push(s)
    }
    return out
  }, [siblings, current.id, current.itemId, current.tokenId])

  // Resolve a buyable trade for the current item (needed for BUY NOW + a valid cart entry). Secondary
  // listings carry their tradeId directly; catalog items resolve the cheapest open listing by itemId.
  const {
    data: resolvedTradeId,
    isLoading: resolvingTrade
  } = useQuery({
    queryKey: ['detail-trade', current.id, current.tradeId, current.contractAddress, current.itemId],
    enabled: !!current.contractAddress,
    queryFn: async (): Promise<string | null> => {
      if (current.tradeId) return current.tradeId
      if (current.itemId) {
        const trade = await fetchTradeForItem(current.contractAddress, current.itemId)
        return trade?.id ?? null
      }
      return null
    }
  })

  const buyableTradeId = current.tradeId ?? resolvedTradeId ?? undefined
  const forSale = !!buyableTradeId
  // The exact CatalogItem shape checkout expects (tradeId + tokenId), identical to fetchListings output.
  const cartItem: CatalogItem = useMemo(
    () => ({ ...current, tradeId: buyableTradeId, id: buyableTradeId ?? current.id }),
    [current, buyableTradeId]
  )
  const inCart = cartItems.some(i => i.id === cartItem.id)

  // Reset transient status whenever the hero item changes.
  useEffect(() => {
    setStatus(null)
    setError(null)
  }, [current.id])

  // KR5 denominator: fire 'Shop Viewed Item' once per hydrated item (deduped across re-renders and the
  // in-place carousel swaps), after the trade resolves so `for_sale` is accurate.
  const viewedRef = useRef<string | null>(null)
  useEffect(() => {
    if (!current.name || resolvingTrade || viewedRef.current === current.id) return
    viewedRef.current = current.id
    track('Shop Viewed Item', { ...itemProps(current), for_sale: forSale })
    recordViewed(current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current.id, current.name, resolvingTrade, forSale])

  function selectSibling(item: CatalogItem) {
    setCurrent(item)
    // Keep the address bar in sync so refresh/share resolves the shown item. tokenId may be absent for
    // catalog items — fall back to itemId. Only sync the URL when a valid segment exists (the item
    // still shows in place via setCurrent) so we never push a dead /item/<contract>/ URL.
    const seg = item.tokenId ?? item.itemId
    if (item.contractAddress && seg) {
      navigate(`/item/${item.contractAddress}/${seg}`, { replace: true, state: { item } })
    }
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function handleAddToCart() {
    if (!forSale || inCart) return
    add(cartItem, 'item_detail')
  }

  async function handleBuyNow() {
    if (!forSale || !buyableTradeId) return
    if (!session) {
      setError('Log in to check out.')
      return
    }
    setError(null)
    setBusy(true)
    let reservedCreditId: string | undefined
    let step: 'authorize' | 'submit' = 'authorize'
    let usedGasless = false
    try {
      setStatus(`Buying ${current.name || 'item'}…`)
      const trade = await fetchTrade(buyableTradeId)
      if (!trade) throw new Error('not for sale')
      const priceAsset = trade.received?.[0] as { amount?: string } | undefined
      const usdCents = usdWeiToCents(priceAsset?.amount)
      const { credit, maxCreditedValue } = await authorizeUsdCredit(session.identity, usdCents, buyableTradeId)
      reservedCreditId = credit.id
      step = 'submit'
      const buyArgs = { trade, buyer: session.address, signer: session.signer, credits: [credit], maxCreditedValue }
      let txHash: string | undefined
      if (gaslessEnabled()) {
        try {
          txHash = await buyGasless(buyArgs) // buyer confirms off-chain; relayer covers the fee
          await waitForSettlement(txHash)
          usedGasless = true
        } catch (gaslessErr) {
          if (!(gaslessErr instanceof GaslessUnavailableError)) throw gaslessErr
          txHash = await buyWithCredits(buyArgs) // fallback: buyer submits
        }
      } else {
        txHash = await buyWithCredits(buyArgs)
      }
      reservedCreditId = undefined // consumed by the buy
      track('Shop Completed Purchase', {
        ...purchaseItemsProps([cartItem]),
        payment_type: 'credits',
        no_crypto_step: usedGasless,
        transaction_hash: txHash ?? null
      })
      navigate('/success', { state: { items: [cartItem], txHash } })
    } catch (e) {
      if (!isUserRejection(e)) captureError(e, { flow: 'buy', step, gasless: usedGasless })
      // Release the reserved dollars so the balance isn't stuck until the TTL (matches Cart/MarketCheckout).
      if (reservedCreditId) void cancelUsdIntents(session.identity, [reservedCreditId]).catch(() => {})
      track(isUserRejection(e) ? 'Shop Purchase Cancelled' : 'Shop Purchase Failed', {
        step,
        error_code: errorCode(e),
        value_usd: creditsToUsd(cartItem.priceCredits)
      })
      setError(friendlyError(e))
      setStatus(null)
    } finally {
      setBusy(false)
    }
  }

  const rarity: Rarity = isValidRarity(current.rarity) ? current.rarity : Rarity.COMMON
  const [glowLight] = Rarity.getGradient(rarity)
  const gender = genderLabel(current.gender)
  const onSale =
    forSale &&
    isSaleActive({
      priceCredits: current.priceCredits,
      compareAtCredits: current.compareAtCredits,
      saleEndsAt: current.saleEndsAt
    })
  const collectionTitle = 'More from this collection'

  const addLabel = !forSale ? 'Not for sale' : inCart ? 'In cart' : resolvingTrade ? 'Checking…' : 'Add to cart'

  // Nothing hydrated the item (bad/stale deep link, or an item that isn't in the shop feed — e.g. a
  // legacy/market piece). Once every resolution path has settled and there's still no name, show a
  // graceful not-found instead of a permanent "Loading…" blank.
  const stillResolving = deepLinkLoading || (!!current.contractAddress && !siblingsFetched)
  if (!current.name && !stillResolving) {
    return (
      <div className="item-detail item-detail--notfound">
        <span className="ico ico-cart item-detail__notfound-ico" aria-hidden />
        <h1 className="item-detail__notfound-title">This item isn’t available</h1>
        <p className="muted">It may have been delisted or moved. Browse the shop for something else.</p>
        <button className="btn btn--purple" onClick={() => navigate('/assets')}>Browse the shop</button>
      </div>
    )
  }

  return (
    <div className="item-detail">
      <nav className="item-detail__crumbs" aria-label="Breadcrumb">
        <button className="item-detail__crumb-link" onClick={() => navigate('/assets')}>
          Collectibles
        </button>
        <span className="item-detail__crumb-sep">/</span>
        <span className="item-detail__crumb-current">{current.name || 'Item'}</span>
      </nav>

      <div className="item-detail__main">
        <div
          className="item-detail__preview"
          style={{
            // Subtle rarity glow on the light surface (not a full-saturation fill).
            background: `radial-gradient(circle at 50% 38%, ${glowLight}33 0%, var(--media) 68%)`
          }}
        >
          <ItemPreview item={current} />
        </div>

        <div className="item-detail__info">
          <div className="item-detail__info-head">
            <h1 className="item-detail__title">{current.name || 'Loading…'}</h1>
            <button className="item-detail__fav" aria-label="Add to favorites">
              <span className="ico ico-heart" aria-hidden />
            </button>
          </div>

          {current.creator ? (
            <CreatorBadge address={current.creator} className="item-detail__creator" linkToProfile />
          ) : null}

          <div className="item-detail__chips">
            <span className="chip chip--rarity">{current.rarity}</span>
            <span className="chip">{current.category === 'emote' ? 'Emote' : 'Wearable'}</span>
            {gender ? <span className="chip">{gender}</span> : null}
          </div>

          <div className="item-detail__card">
            <div className="item-detail__price-block">
              <div className="item-detail__price-label">Price</div>
              {forSale ? (
                onSale ? (
                  <div className="item-detail__price item-detail__price--sale">
                    <span className="item-detail__price">
                      <CurrencyIcon className="item-detail__diamond" />
                      <span className="item-detail__price-value">{current.priceCredits}</span>
                    </span>
                    <span className="item-detail__price-was">
                      <CurrencyIcon className="item-detail__diamond item-detail__diamond--was" />
                      {current.compareAtCredits}
                    </span>
                    {saleDiscountPct(current.compareAtCredits!, current.priceCredits) > 0 ? (
                      <span className="item-detail__sale-badge">
                        SALE -{saleDiscountPct(current.compareAtCredits!, current.priceCredits)}%
                      </span>
                    ) : null}
                    <SaleCountdown endsAt={current.saleEndsAt} className="item-detail__countdown" />
                  </div>
                ) : (
                  <div className="item-detail__price">
                    <CurrencyIcon className="item-detail__diamond" />
                    <span className="item-detail__price-value">{current.priceCredits}</span>
                  </div>
                )
              ) : (
                <div className="item-detail__price item-detail__price--none">Not for sale</div>
              )}
              {session ? (
                <div className="item-detail__balance muted">Your balance: {CURRENCY.symbol} {balance?.credits ?? 0}</div>
              ) : null}
            </div>

            <div className="item-detail__ctas">
              {forSale ? (
                <button
                  className="btn btn--purple item-detail__cta"
                  onClick={handleBuyNow}
                  disabled={busy || resolvingTrade}
                >
                  {busy ? 'Working…' : 'Buy now'}
                </button>
              ) : null}
              <button
                className="item-detail__addcart"
                onClick={handleAddToCart}
                disabled={!forSale || inCart || resolvingTrade || busy}
              >
                <span className="ico ico-cart-solid item-detail__addcart-ico" aria-hidden />
                {addLabel}
              </button>
            </div>

            {status ? <p className="muted item-detail__status">{status}</p> : null}
            {error ? <p className="error item-detail__status">{error}</p> : null}
          </div>
        </div>
      </div>

      <CollectionCarousel
        title={collectionTitle}
        items={carouselItems}
        activeId={current.id}
        onSelect={selectSibling}
        onViewAll={current.contractAddress ? () => navigate(`/collection/${current.contractAddress}`) : undefined}
      />
    </div>
  )
}

export default ItemDetail
