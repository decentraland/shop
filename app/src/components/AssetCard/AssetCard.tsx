import { useEffect, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useCart } from '~/store/cart'
import { useFavorites } from '~/store/favorites'
import { useHoverPreview } from '~/store/hoverPreview'
import { useWallet } from '~/store/wallet'
import { isOwnListing } from '~/lib/ownership'
import { rarityInk, rarityTint, rarityDescription } from '~/lib/rarity'
import { categoryIcon, genderIcon } from '~/lib/itemIcons'
import { CurrencyIcon } from '~/components/CurrencyIcon'
import { Icon } from '~/components/Icon'
import { SaleCountdown } from '~/components/SaleCountdown'
import { saleDiscountPct } from '~/lib/sale'
import { formatCredits, formatCreditsFull } from '~/lib/currency'
import { t } from '~/intl/i18n'
import { useSaleActive } from '~/hooks/useSaleActive'
import type { CatalogItem } from '~/lib/api'
import './asset-card.css'

const HOVER_DELAY_MS = 120

// Card variants:
// - default (native, USD-pegged): fixed credit price + Add to cart.
// - 'market' (legacy, MANA-priced): the credit price FLUCTUATES with the market rate, so it renders
//   an "≈" indicative price + a "Market price" chip and swaps Add-to-cart for Buy now (direct
//   checkout — legacy items are never added to the Zustand cart). `marketPriceCredits` is the
//   converted (rounded-up) price and `onBuyNow` opens the Buy Now checkout.
// - 'view' (view-only browse — the "All" / "Not for Sale" grids): NO trade happens inline, so the
//   card drops Add-to-cart/Buy-now entirely. The footer shows the credit price when the item IS for
//   sale (priceCredits > 0) or a small "NOT FOR SALE" tag when it isn't (priceCredits === 0), plus a
//   full-width dark VIEW button that opens the item detail (Figma 1246-256347). The whole card is the
//   link, so the VIEW pill is a decorative affordance (aria-hidden) — no duplicate tab stop.
// - 'manage' (My Creations — the creator view of a PRIMARY item they published): renders like a view
//   card (media + name + price-or-"NOT FOR SALE"), but the footer button is a real control — "List for
//   sale" (dark) when the item isn't listed, "Remove from sale" (ghost) when it is — wired to
//   onList/onUnlist. The whole-card link still opens the item detail; the action sits above it
//   (z-index) and stops propagation. `busy` disables the button while the trade is in flight.
// - 'manage-link' (My Assets — the owner view of a SECONDARY token they hold, or an owned NAME): the
//   card's ONLY action is a "MANAGE" CTA revealed on hover (mirrors the browse card's Add-to-cart
//   reveal). For a wearable/emote it navigates to the item detail page (where List / Update price /
//   Remove live, per token); for a NAME it's an external link to the Builder's name management page
//   (`manageHref`). No inline listing happens from the My Assets card anymore.
type AssetCardProps =
  | { item: CatalogItem; mode?: 'shop' }
  | { item: CatalogItem; mode: 'view' }
  | { item: CatalogItem; mode: 'market'; marketPriceCredits: number | null; onBuyNow: (item: CatalogItem) => void }
  | {
      item: CatalogItem
      mode: 'manage'
      listed: boolean
      busy?: boolean
      onList: (item: CatalogItem) => void
      onUnlist: (item: CatalogItem) => void
    }
  | { item: CatalogItem; mode: 'manage-link'; manageHref?: string }

export function AssetCard(props: AssetCardProps) {
  const { item } = props
  const isMarket = props.mode === 'market'
  const isView = props.mode === 'view'
  const isManage = props.mode === 'manage'
  const isManageLink = props.mode === 'manage-link'
  // A Decentraland NAME (My Assets → Names): no thumbnail — the media is the typographic "@name" tile
  // (Figma 696-33957). Uses the same card shell + hover as every other card.
  const isNameItem = item.category === 'ens'
  const navigate = useNavigate()
  const timer = useRef<ReturnType<typeof setTimeout>>()
  const mediaRef = useRef<HTMLDivElement>(null)

  const add = useCart(s => s.add)
  const inCart = useCart(s => s.items.some(i => i.id === item.id))
  const address = useWallet(s => s.session?.address)
  // Your own (primary) listing — can't add it to the cart (see lib/ownership.ts).
  const own = isOwnListing(item, address)
  const toggleFav = useFavorites(s => s.toggle)
  const faved = useFavorites(s => !!s.items[item.id])
  // The single shared 3D preview (see HoverPreviewLayer): on hover this card asks it to load this item
  // and overlay this card's media. `isPreviewing`/`previewReady` reflect whether THIS card is the one
  // currently driving that shared instance.
  const showPreview = useHoverPreview(s => s.show)
  const hidePreview = useHoverPreview(s => s.hide)
  const isPreviewing = useHoverPreview(s => s.item?.id === item.id)
  const previewReady = useHoverPreview(s => (s.item?.id === item.id ? s.ready : false))

  // NAMEs are read-only in the Shop: no whole-card link (the detail page loads a wearable preview,
  // wrong for a NAME), no favourite, no 3D hover preview. Only the standard visual hover (red border).
  const canPreview = !!item.contractAddress && !!item.itemId && !isNameItem
  // Secondary listings carry tokenId; catalog items carry itemId — use whichever is present so the
  // /item/:contractAddress/:tokenId route segment is always populated.
  const routeSeg = item.tokenId ?? item.itemId
  // The whole card opens the item-detail page — market (legacy) cards included: they carry a valid
  // contractAddress + tokenId/itemId, and the detail page renders them in "market mode" (live-rate
  // price + Buy now) from the router state handed over on the link below.
  const canOpen = !!item.contractAddress && !!routeSeg
  const detailPath = `/item/${item.contractAddress}/${routeSeg}`

  // Own item → the card's action becomes MANAGE: it opens the item's detail page (same route + seeded
  // state as the whole-card link) where the owner/creator management actions (List / Update price /
  // Remove) live. Navigates explicitly (the button sits above the card link and stops propagation).
  function goManage(e: React.MouseEvent) {
    e.stopPropagation()
    if (canOpen) navigate(detailPath, { state: { item, tradeId: item.tradeId } })
  }

  function onEnter() {
    // Touch devices synthesize a `mouseenter` on tap — don't enter the hover state there (it would
    // flash the red border + 3D preview on a tap). Hover is desktop-only; see @media (hover: hover)
    // in index.css, which gates the matching CSS swap.
    if (typeof window !== 'undefined' && window.matchMedia && !window.matchMedia('(hover: hover)').matches) return
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      if (canPreview && mediaRef.current) showPreview(item, mediaRef.current)
    }, HOVER_DELAY_MS)
  }
  function onLeave() {
    if (timer.current) clearTimeout(timer.current)
    // Only release the shared preview if WE'RE the ones holding it (avoid stealing it from a card the
    // mouse has already moved onto).
    if (useHoverPreview.getState().item?.id === item.id) hidePreview()
  }

  // Release the shared preview if this card unmounts WHILE it's the active one (a filter change or
  // navigation removes the card without firing onLeave) — otherwise the store keeps a stale item +
  // detached anchor node alive and the layer's scroll/resize listeners keep measuring it.
  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current)
      if (useHoverPreview.getState().item?.id === item.id) hidePreview()
    }
  }, [item.id, hidePreview])

  const catIco = categoryIcon(item)
  const genderIco = genderIcon(item.gender)

  // Flash sale only applies to native (fixed-price) listings — a market card's credit price
  // fluctuates, so a strike-through compare-at would be meaningless there.
  const saleActive = useSaleActive({
    priceCredits: item.priceCredits,
    compareAtCredits: item.compareAtCredits,
    saleEndsAt: item.saleEndsAt
  })
  const onSale = !isMarket && saleActive
  const discountPct = onSale ? saleDiscountPct(item.compareAtCredits!, item.priceCredits) : 0

  return (
    <article
      className="card"
      data-testid="card"
      style={canOpen && !isNameItem ? { cursor: 'pointer' } : undefined}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
    >
      {/* Whole-card navigation as a SINGLE overlaid link (keyboard + screen-reader reachable), instead
          of an interactive <article role="link"> that wraps the fav/cart/creator buttons — nesting
          interactive controls inside a link is invalid and breaks SR/tab order. The overlay sits below
          those controls via z-index (see .card__link in index.css) so they stay independently operable. */}
      {canOpen && !isNameItem ? (
        <Link
          className="card__link"
          data-testid="card-link"
          to={detailPath}
          // Market cards open the detail page in "market mode": hand it the live-rate credit price and
          // the market item (a UnifiedListing carrying manaWei) so it renders the ≈ price + Buy now
          // without a refetch. Native cards pass their tradeId (the detail page resolves the fixed price).
          state={
            props.mode === 'market'
              ? { item, market: true, marketPriceCredits: props.marketPriceCredits }
              : { item, tradeId: item.tradeId }
          }
          aria-label={item.name}
        />
      ) : null}
      {/* Owned NAME (manage-link): the whole card is an EXTERNAL overlay link to the name's Builder
          management page. Unlike a wearable the name has no in-app detail page, so this is what makes the
          card keyboard-reachable AND tappable on mobile (where the hover-revealed MANAGE pill is hidden);
          the visible MANAGE controls below sit above it (z-index) and point at the same URL. */}
      {isNameItem && props.mode === 'manage-link' && props.manageHref ? (
        <a
          className="card__link"
          data-testid="card-link"
          href={props.manageHref}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={item.name}
        />
      ) : null}
      {/* The fav button is a SIBLING of the whole-card link (not nested in .card__media): the media is
          its own stacking context (isolation: isolate, for the skeleton's z-index), which would trap
          the button below the z-index:3 overlay link and make the heart navigate instead of toggle.
          As a direct child of the position:relative card, its z-index:4 sits above the link. */}
      {!isNameItem ? (
        <button
          className={`card__fav${faved ? ' is-on' : ''}`}
          data-testid="card-fav"
          onClick={e => {
            e.stopPropagation()
            toggleFav(item)
          }}
          aria-label={faved ? t('assetCard.removeFromFavorites') : t('assetCard.addToFavorites')}
        >
          <Icon name={faved ? 'heart-solid' : 'heart'} size={18} />
        </button>
      ) : null}
      {/* The shared 3D preview (HoverPreviewLayer) overlays this element on hover; mediaRef gives it the
          rect to position over. */}
      <div className="card__media" ref={mediaRef}>
        {onSale ? (
          <span className="card__sale-badge" data-testid="card-sale-badge">
            {discountPct > 0 ? t('assetCard.saleWithDiscount', { pct: discountPct }) : t('assetCard.sale')}
          </span>
        ) : null}
        {/* Item-unified browse feed: this item has more than one copy on sale — flag it so the user
            knows there's a resale list to see on the item detail page (only that feed sets listingCount). */}
        {item.listingCount && item.listingCount > 1 ? (
          <span className="card__listings" data-testid="card-listings">
            {t('assetCard.onSaleCount', { count: item.listingCount })}
          </span>
        ) : null}
        {/* Flat thumbnail stays visible the whole time the 3D loads (no empty frame); it only fades out
            once the shared preview has this item's scene ready, crossfading into the 3D. */}
        {isNameItem ? (
          <div className="card__name-media" aria-hidden>
            <span className="card__name-at">@</span>
            <span className="card__name-value">{item.name}</span>
          </div>
        ) : item.thumbnail ? (
          <img
            className={`card__img${isPreviewing && previewReady ? ' card__img--hidden' : ''}`}
            src={item.thumbnail}
            alt={item.name}
            loading="lazy"
          />
        ) : null}
        {/* The 3D preview is the ONE shared HoverPreviewLayer overlay (see App.tsx) — the card does NOT
            mount its own <WearablePreview> (that duplicated the avatar over the shared one, cold-booted a
            second engine per hover, and doubled the Babylon/Sentry work). On hover the card just asks the
            store to point the warm iframe here (showPreview); the thumbnail above crossfades out via
            .card__img--hidden once that shared preview is ready. */}
      </div>

      {isManage && props.mode === 'manage' ? (
        <div className="card__body">
          {/* Owner/creator footer: name on the left; the listed price (when on sale) or a "NOT FOR SALE"
              tag on the right — same layout as the view card. */}
          <div className="card__top">
            <div className="card__desc">
              <div className="card__name" title={item.name}>
                {item.name}
              </div>
              {/* Mint index of THIS copy (e.g. "#5013") — lets the owner tell otherwise-identical copies
                  apart and know which one they're listing. Absent for creations (primary), so falls back
                  to the empty spacer that keeps the footer height. */}
              {item.issuedId ? (
                <div className="card__creator card__issued" data-testid="card-issued">
                  #{item.issuedId}
                </div>
              ) : (
                <div className="card__creator">&nbsp;</div>
              )}
            </div>
            {props.listed && item.priceCredits > 0 ? (
              <div className="card__price" title={formatCreditsFull(item.priceCredits)}>
                <CurrencyIcon className="card__diamond" />
                {formatCredits(item.priceCredits)}
              </div>
            ) : (
              <span className="card__nfs" data-testid="card-nfs">
                {t('assetCard.notForSale')}
              </span>
            )}
          </div>
          {props.listed ? (
            <button
              className="card__manage card__manage--ghost"
              data-testid="card-unlist"
              disabled={props.busy}
              onClick={e => {
                e.stopPropagation()
                props.onUnlist(item)
              }}
            >
              {props.busy ? t('myAssets.removing') : t('myAssets.removeListing')}
            </button>
          ) : (
            <button
              className="card__manage"
              data-testid="card-list"
              disabled={props.busy}
              onClick={e => {
                e.stopPropagation()
                props.onList(item)
              }}
            >
              {t('myAssets.putOnSale')}
            </button>
          )}
        </div>
      ) : isNameItem ? (
        // Owned NAME (read-only): @name + verified badge, and the NOT FOR SALE tag (never listable here).
        <div className="card__body card__body--name">
          <div className="card__top">
            <div className="card__desc">
              <div className="card__name card__name--verified" title={item.name}>
                <span>@{item.name}</span>
                {/* DCL verified badge (Figma 696-34036): scalloped Cerise-gradient seal + white check.
                    Inlined (not the Icon mask) so the gradient renders. */}
                <svg
                  className="card__verified"
                  width="18"
                  height="18"
                  viewBox="0 0 14.6921 14.6931"
                  fill="none"
                  aria-hidden
                >
                  <path
                    d="M6.285 0.43934C6.87079 -0.146447 7.82128 -0.146447 8.40707 0.43934L9.68051 1.71278H11.4793C12.3078 1.71278 12.9793 2.38435 12.9793 3.21278V5.01161L14.2528 6.28602C14.8386 6.87181 14.8386 7.82133 14.2528 8.40711L12.9793 9.68055V11.4804C12.9793 12.3088 12.3078 12.9804 11.4793 12.9804H9.68051L8.40707 14.2538C7.82128 14.8395 6.87076 14.8396 6.285 14.2538L5.01156 12.9804H3.21176C2.38334 12.9804 1.71177 12.3088 1.71176 11.4804V9.67957L0.439297 8.40711C-0.146461 7.82136 -0.146403 6.87181 0.439297 6.28602L1.71176 5.01258V3.21278C1.71176 2.38435 2.38333 1.71278 3.21176 1.71278H5.01156L6.285 0.43934Z"
                    fill="url(#dclVerifiedGrad)"
                  />
                  <path
                    d="M4.6 7.5l1.9 1.9 3.6-3.9"
                    stroke="#FCFCFC"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <defs>
                    <linearGradient
                      id="dclVerifiedGrad"
                      x1="7.35"
                      y1="0"
                      x2="7.35"
                      y2="14.69"
                      gradientUnits="userSpaceOnUse"
                    >
                      <stop stopColor="#FF2D55" />
                      <stop offset="1" stopColor="#C640CD" />
                    </linearGradient>
                  </defs>
                </svg>
              </div>
            </div>
            <span className="card__nfs" data-testid="card-nfs">
              {t('assetCard.notForSale')}
            </span>
          </div>
          {/* Owned NAME → MANAGE the name in the Builder (external). Uses the same hover-revealed slot as
              the browse card's action so the reveal treatment matches; the empty chips row keeps the
              slot height reserved so revealing MANAGE on hover causes no layout shift. */}
          {isManageLink && props.mode === 'manage-link' && props.manageHref ? (
            <div className="card__action">
              <div className="card__chips" />
              {/* Compact round MANAGE for the mobile card (the full-width pill is hidden there) — same
                  swap the browse card makes between .card__cart and .card__add-round. */}
              <a
                className="card__add-round"
                href={props.manageHref}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={t('assetCard.manage')}
                onClick={e => e.stopPropagation()}
              >
                <Icon name="pen" />
              </a>
              <a
                className="card__cart"
                data-testid="card-manage"
                href={props.manageHref}
                target="_blank"
                rel="noopener noreferrer"
                onClick={e => e.stopPropagation()}
              >
                <Icon name="pen" size={20} />
                {t('assetCard.manage')}
              </a>
            </div>
          ) : null}
        </div>
      ) : isManageLink && props.mode === 'manage-link' ? (
        // Owned SECONDARY token (wearable/emote): the footer mirrors the view card (name + mint index +
        // listed-price-or-"NOT FOR SALE"), and the action is a hover-revealed MANAGE CTA that opens the
        // item detail page (where List / Update price / Remove live). Chips show at rest and swap out for
        // MANAGE on hover — the exact reveal treatment of the browse card's Add-to-cart.
        <div className="card__body">
          <div className="card__top">
            <div className="card__desc">
              <div className="card__name" title={item.name}>
                {item.name}
              </div>
              {item.issuedId ? (
                <div className="card__creator card__issued" data-testid="card-issued">
                  #{item.issuedId}
                </div>
              ) : (
                <div className="card__creator">&nbsp;</div>
              )}
            </div>
            {item.priceCredits > 0 ? (
              <div className="card__price" title={formatCreditsFull(item.priceCredits)}>
                <CurrencyIcon className="card__diamond" />
                {formatCredits(item.priceCredits)}
              </div>
            ) : (
              <span className="card__nfs" data-testid="card-nfs">
                {t('assetCard.notForSale')}
              </span>
            )}
          </div>
          <div className="card__action">
            <div className="card__chips">
              <span
                className="chip chip--rarity"
                style={{ background: rarityTint(item.rarity), color: rarityInk(item.rarity) }}
                title={rarityDescription(item.rarity)}
              >
                {item.rarity}
              </span>
              {catIco ? (
                <span className="chip chip--icon">
                  <Icon name={catIco} />
                </span>
              ) : null}
            </div>
            {/* Compact round MANAGE for the mobile card (the full-width pill is hidden there) — same swap
                the browse card makes between .card__cart and .card__add-round. */}
            <button className="card__add-round" onClick={goManage} aria-label={t('assetCard.manage')}>
              <Icon name="pen" />
            </button>
            <button className="card__cart" data-testid="card-manage" onClick={goManage}>
              <Icon name="pen" size={20} />
              {t('assetCard.manage')}
            </button>
          </div>
        </div>
      ) : isView ? (
        <div className="card__body">
          {/* View-only footer (Figma 1246-256347): name + author on the left; on the right the credit
              price when the item is for sale, or a small "NOT FOR SALE" tag when it isn't. */}
          <div className="card__top">
            <div className="card__desc">
              <div className="card__name" title={item.name}>
                {item.name}
              </div>
            </div>
            {item.priceCredits > 0 ? (
              <div className="card__price" title={formatCreditsFull(item.priceCredits)}>
                <CurrencyIcon className="card__diamond" />
                {formatCredits(item.priceCredits)}
              </div>
            ) : (
              <span className="card__nfs" data-testid="card-nfs">
                {t('assetCard.notForSale')}
              </span>
            )}
          </div>
          {/* Full-width dark VIEW affordance. Decorative (aria-hidden) — the whole-card overlay link
              above provides the accessible, keyboard-reachable navigation to the item detail. */}
          <span className="card__view" data-testid="card-view" aria-hidden>
            <Icon name="eye" size={20} />
            {t('assetCard.view')}
          </span>
        </div>
      ) : (
        <div className="card__body">
          {/* Title+author sit on one row with the price to their right (Figma). card__desc holds the
            flexible column (min-width:0 so a long name ellipses instead of shoving the price out or
            wrapping); the price never shrinks. */}
          <div className="card__top">
            <div className="card__desc">
              <div className="card__name" title={item.name}>
                {item.name}
              </div>
            </div>
            {isMarket && props.mode === 'market' ? (
              <div className="card__price card__price--market" data-testid="card-price-market">
                <span className="card__approx" aria-hidden>
                  ≈
                </span>
                <CurrencyIcon className="card__diamond" />
                {props.marketPriceCredits == null ? '—' : formatCredits(props.marketPriceCredits)}
              </div>
            ) : onSale ? (
              <div className="card__price card__price--sale">
                <span
                  className="card__price-now"
                  data-testid="card-price-now"
                  title={formatCreditsFull(item.priceCredits)}
                >
                  <CurrencyIcon className="card__diamond" />
                  {formatCredits(item.priceCredits)}
                </span>
                <span
                  className="card__price-was"
                  data-testid="card-price-was"
                  title={formatCreditsFull(item.compareAtCredits!)}
                >
                  <CurrencyIcon className="card__diamond card__diamond--was" />
                  {formatCredits(item.compareAtCredits!)}
                </span>
                <SaleCountdown endsAt={item.saleEndsAt} className="card__countdown" testId="card-countdown" />
              </div>
            ) : (
              <div className="card__price" title={formatCreditsFull(item.priceCredits)}>
                <CurrencyIcon className="card__diamond" />
                {formatCredits(item.priceCredits)}
              </div>
            )}
          </div>

          {/* Chips row and the primary action share one fixed-height slot so the card DOESN'T change
            size when the action is revealed on hover/focus — the button (40px tall) replaces the chips
            in place, not below them. Chips show at rest; on hover-capable devices the action is
            revealed on hover OR keyboard focus, and it's always shown where hover isn't available
            (touch) so items stay buyable without a mouse (see .card__action in asset-card.css). Both
            stay in the DOM so the action is keyboard-reachable and touch-tappable. Native cards add to
            cart; Market (legacy) cards Buy now directly (price locked at checkout). */}
          <div className="card__action">
            <div className="card__chips">
              {/* Market (legacy) tag: the "≈ price is a live-rate market price" indicator. Lives here in
                the chips row (not the price row) so it's swapped out for the action button on hover like
                every other chip and never distorts the price row / Buy now button. */}
              {isMarket ? (
                <span className="chip chip--market" data-testid="chip-market">
                  {t('assetCard.marketPrice')}
                </span>
              ) : null}
              <span
                className="chip chip--rarity"
                style={{ background: rarityTint(item.rarity), color: rarityInk(item.rarity) }}
                title={rarityDescription(item.rarity)}
              >
                {item.rarity}
              </span>
              {item.isSmart ? (
                <span className="chip chip--smart" data-testid="chip-smart">
                  <Icon name="smart" size={13} />
                  {t('assetCard.smart')}
                </span>
              ) : null}
              {catIco ? (
                <span className="chip chip--icon">
                  <Icon name={catIco} />
                </span>
              ) : null}
              {genderIco ? (
                <span className="chip chip--icon">
                  <Icon name={genderIco} />
                </span>
              ) : null}
            </div>

            {/* Round add button — the compact mobile card's primary action (Figma). Same behavior as the
            full-width .card__cart below; only one is visible per breakpoint (CSS). */}
            {isMarket && props.mode === 'market' ? (
              <button
                className="card__add-round"
                onClick={e => {
                  e.stopPropagation()
                  props.onBuyNow(item)
                }}
                disabled={props.marketPriceCredits == null}
                aria-label={props.marketPriceCredits == null ? t('assetCard.unavailable') : t('assetCard.buyNow')}
              >
                <Icon name="plus" />
              </button>
            ) : (
              <button
                className={`card__add-round${!own && inCart ? ' is-in' : ''}`}
                onClick={e => {
                  if (own) return goManage(e)
                  e.stopPropagation()
                  add(item, 'grid')
                }}
                disabled={!own && inCart}
                aria-label={own ? t('assetCard.manage') : inCart ? t('assetCard.inCart') : t('assetCard.addToCart')}
              >
                <Icon name={own ? 'pen' : 'plus'} />
              </button>
            )}

            {isMarket && props.mode === 'market' ? (
              <button
                className="card__cart"
                data-testid="card-cart"
                onClick={e => {
                  e.stopPropagation()
                  props.onBuyNow(item)
                }}
                disabled={props.marketPriceCredits == null}
              >
                {props.marketPriceCredits == null ? t('assetCard.unavailable') : t('assetCard.buyNow')}
              </button>
            ) : (
              <button
                className={`card__cart${!own && inCart ? ' is-in' : ''}`}
                data-testid="card-cart"
                onClick={e => {
                  if (own) return goManage(e)
                  e.stopPropagation()
                  add(item, 'grid')
                }}
                disabled={!own && inCart}
              >
                <Icon name={own ? 'pen' : 'cart-solid'} />
                {own ? t('assetCard.manage') : inCart ? t('assetCard.inCart') : t('assetCard.addToCart')}
              </button>
            )}
          </div>
        </div>
      )}
    </article>
  )
}
