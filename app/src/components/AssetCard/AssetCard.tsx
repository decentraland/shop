import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useCart } from '~/store/cart'
import { useFavorites } from '~/store/favorites'
import { useHoverPreview } from '~/store/hoverPreview'
import { useWallet } from '~/store/wallet'
import { isOwnListing } from '~/lib/ownership'
import { detailRouteFor } from '~/lib/routes'
import { rarityInk, rarityTint, rarityDescription } from '~/lib/rarity'
import { categoryIcon, genderIcon } from '~/lib/itemIcons'
import { CurrencyIcon } from '~/components/CurrencyIcon'
import { Icon } from '~/components/Icon'
import { saleDiscountPct } from '~/lib/sale'
import { formatCredits, formatCreditsFull } from '~/lib/currency'
import { t } from '~/intl/i18n'
import { useSaleActive } from '~/hooks/useSaleActive'
import type { CatalogItem } from '~/lib/api'
import * as S from './AssetCard.styles'

const HOVER_DELAY_MS = 120

// Card variants:
// - default (native, USD-pegged): fixed credit price + Add to cart.
// A LEGACY (MANA-priced) row used to get its own 'market' variant here: an "≈" price, a "Market price"
// chip and Buy now instead of Add to cart, because the cart could not price it. The cart can now, so a
// legacy row is an ordinary card — the caller passes the live-rate price in `item.priceCredits`. One
// catalogue, one price treatment, no approximation marks.
// - 'view' (view-only browse — the "All" / "Not for Sale" grids): NO trade happens inline, so the
//   card drops Add-to-cart/Buy-now entirely. The footer shows the credit price when the item IS for
//   sale (priceCredits > 0) or a small "NOT FOR SALE" tag when it isn't, plus a full-width dark VIEW
//   button that opens the item detail. The whole card is the link, so the VIEW pill is a decorative
//   affordance (aria-hidden) — no duplicate tab stop.
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
  const isView = props.mode === 'view'
  const isManage = props.mode === 'manage'
  const isManageLink = props.mode === 'manage-link'
  // A Decentraland NAME (My Assets → Names): no thumbnail — the media is the typographic "@name" tile.
  // Uses the same card shell + hover as every other card.
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
  // A secondary listing (carries tokenId) → the specific /token page; a primary/catalog row (itemId
  // only) → the generic /item page. detailRouteFor picks the right one so a token never lands on the
  // ambiguous item route (see lib/routes).
  // The whole card opens the detail page — market (legacy) cards included: they carry a valid
  // contractAddress + tokenId/itemId, and the detail page renders them in "market mode" (live-rate
  // price + Buy now) from the router state handed over on the link below.
  const detailPath = detailRouteFor(item)
  const canOpen = !!detailPath

  // Own item → the card's action becomes MANAGE: it opens the item's detail page (same route + seeded
  // state as the whole-card link) where the owner/creator management actions (List / Update price /
  // Remove) live. Navigates explicitly (the button sits above the card link and stops propagation).
  function goManage(e: React.MouseEvent) {
    e.stopPropagation()
    if (detailPath) navigate(detailPath, { state: { item, tradeId: item.tradeId } })
  }

  function onEnter() {
    // Touch devices synthesize a `mouseenter` on tap — don't enter the hover state there (it would
    // flash the red border + 3D preview on a tap). Hover is desktop-only; the matching style swap is
    // gated behind @media (hover: hover).
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
  const onSale = saleActive
  const discountPct = onSale ? saleDiscountPct(item.compareAtCredits!, item.priceCredits) : 0

  // The mint index of an owned copy (e.g. "#5013") — lets the owner tell otherwise-identical copies
  // apart. Absent for creations (primary), where the empty spacer keeps the footer height.
  const issued = item.issuedId ? (
    <S.CreatorEmpty data-issued data-testid="card-issued">
      #{item.issuedId}
    </S.CreatorEmpty>
  ) : (
    <S.CreatorEmpty>&nbsp;</S.CreatorEmpty>
  )

  const nfs = <S.Nfs data-testid="card-nfs">{t('assetCard.notForSale')}</S.Nfs>

  const priceOrNfs = (listed: boolean) =>
    listed && item.priceCredits > 0 ? (
      <S.Price data-testid="card-price" title={formatCreditsFull(item.priceCredits)}>
        <CurrencyIcon size={15} />
        {formatCredits(item.priceCredits)}
      </S.Price>
    ) : (
      nfs
    )

  const chips = (
    <S.Chips data-chips>
      <S.CardChip
        data-variant="rarity"
        style={{ background: rarityTint(item.rarity), color: rarityInk(item.rarity) }}
        title={rarityDescription(item.rarity)}
      >
        {item.rarity}
      </S.CardChip>
      {catIco ? (
        <S.CardChip data-variant="icon">
          <Icon name={catIco} />
        </S.CardChip>
      ) : null}
    </S.Chips>
  )

  return (
    <S.Card
      data-testid="card"
      style={canOpen && !isNameItem ? { cursor: 'pointer' } : undefined}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
    >
      {/* Whole-card navigation as a SINGLE overlaid link (keyboard + screen-reader reachable), instead
          of an interactive <article role="link"> that wraps the fav/cart/creator buttons — nesting
          interactive controls inside a link is invalid and breaks SR/tab order. The overlay sits below
          those controls via z-index so they stay independently operable. */}
      {detailPath && !isNameItem ? (
        <S.CardLink
          data-testid="card-link"
          to={detailPath}
          // Market cards open the detail page in "market mode": hand it the live-rate credit price and
          // the market item (a UnifiedListing carrying manaWei) so it renders the ≈ price + Buy now
          // without a refetch. Native cards pass their tradeId (the detail page resolves the fixed price).
          state={{ item, tradeId: item.tradeId }}
          aria-label={item.name}
        />
      ) : null}
      {/* Owned NAME (manage-link): the whole card is an EXTERNAL overlay link to the name's Builder
          management page. Unlike a wearable the name has no in-app detail page, so this is what makes the
          card keyboard-reachable AND tappable on mobile (where the hover-revealed MANAGE pill is hidden);
          the visible MANAGE controls below sit above it (z-index) and point at the same URL. */}
      {isNameItem && props.mode === 'manage-link' && props.manageHref ? (
        <S.CardLinkExternal
          data-testid="card-link"
          href={props.manageHref}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={item.name}
        />
      ) : null}
      {/* The fav button is a SIBLING of the whole-card link (not nested in the media): the media is its
          own stacking context (isolation: isolate), which would trap the button below the overlay link
          and make the heart navigate instead of toggle. As a direct child of the card its z-index sits
          above the link. */}
      {!isNameItem ? (
        <S.Fav
          data-on={faved || undefined}
          data-testid="card-fav"
          onClick={e => {
            e.stopPropagation()
            toggleFav(item)
          }}
          aria-label={faved ? t('assetCard.removeFromFavorites') : t('assetCard.addToFavorites')}
        >
          <Icon name={faved ? 'heart-solid' : 'heart'} size={18} />
        </S.Fav>
      ) : null}
      {/* The shared 3D preview (HoverPreviewLayer) overlays this element on hover; mediaRef gives it the
          rect to position over. The card does NOT mount its own WearablePreview — it just asks the store
          to point the one warm iframe here, and the thumbnail crossfades out once that preview is ready. */}
      <S.Media ref={mediaRef} data-testid="card-media">
        {onSale ? (
          <S.SaleBadge data-testid="card-sale-badge">
            {discountPct > 0 ? t('assetCard.saleWithDiscount', { pct: discountPct }) : t('assetCard.sale')}
          </S.SaleBadge>
        ) : null}
        {canPreview && isPreviewing && !previewReady ? <S.Skeleton data-testid="card-skeleton" aria-hidden /> : null}
        {item.listingCount && item.listingCount > 1 ? (
          <S.Listings data-testid="card-listings">
            {t('assetCard.onSaleCount', { count: item.listingCount })}
          </S.Listings>
        ) : null}
        {/* Flat thumbnail stays visible the whole time the 3D loads (no empty frame); it only fades out
            once the shared preview has this item's scene ready, crossfading into the 3D. */}
        {isNameItem ? (
          <S.NameMedia aria-hidden>
            <S.NameAt>@</S.NameAt>
            <S.NameValue>{item.name}</S.NameValue>
          </S.NameMedia>
        ) : item.thumbnail ? (
          <S.Img
            data-hidden={(isPreviewing && previewReady) || undefined}
            src={item.thumbnail}
            alt={item.name}
            loading="lazy"
          />
        ) : null}
      </S.Media>

      {isManage && props.mode === 'manage' ? (
        <S.Body>
          {/* Owner/creator footer: name on the left; the listed price (when on sale) or a "NOT FOR SALE"
              tag on the right — same layout as the view card. */}
          <S.Top>
            <S.Desc>
              <S.Name title={item.name}>{item.name}</S.Name>
              {issued}
            </S.Desc>
            {priceOrNfs(props.listed)}
          </S.Top>
          {/* Action slot: chips at rest, the List / Remove control revealed on hover or keyboard focus —
              the same reveal treatment as the owned card's MANAGE, so the creations grid no longer shows
              a permanently-visible button. The control stays in the DOM (display-only reveal) so it's
              always keyboard-reachable, and on touch (no hover) it stays visible. */}
          <S.Action>
            {chips}
            {props.listed ? (
              <S.Manage
                data-ghost
                data-reveal
                data-testid="card-unlist"
                disabled={props.busy}
                onClick={e => {
                  e.stopPropagation()
                  props.onUnlist(item)
                }}
              >
                {props.busy ? t('myAssets.removing') : t('myAssets.removeListing')}
              </S.Manage>
            ) : (
              <S.Manage
                data-reveal
                data-testid="card-list"
                disabled={props.busy}
                onClick={e => {
                  e.stopPropagation()
                  props.onList(item)
                }}
              >
                {t('myAssets.putOnSale')}
              </S.Manage>
            )}
          </S.Action>
        </S.Body>
      ) : isNameItem ? (
        // Owned NAME (read-only): @name + verified badge, and the NOT FOR SALE tag (never listable here).
        <S.Body data-name>
          <S.Top>
            <S.Desc>
              <S.Name data-verified title={item.name}>
                <span>@{item.name}</span>
                {/* DCL verified badge: scalloped Cerise-gradient seal + white check. Inlined (not the
                    Icon mask) so the gradient renders. */}
                <S.Verified width="18" height="18" viewBox="0 0 14.6921 14.6931" fill="none" aria-hidden>
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
                </S.Verified>
              </S.Name>
            </S.Desc>
            {nfs}
          </S.Top>
          {/* Owned NAME → MANAGE the name in the Builder (external). Uses the same hover-revealed slot as
              the browse card's action so the reveal treatment matches; the empty chips row keeps the
              slot height reserved so revealing MANAGE on hover causes no layout shift. */}
          {isManageLink && props.mode === 'manage-link' && props.manageHref ? (
            <S.Action>
              <S.Chips data-chips />
              {/* Compact round MANAGE for the mobile card (the full-width pill is hidden there) — same
                  swap the browse card makes between Cart and AddRound. */}
              <S.AddRoundLink
                href={props.manageHref}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={t('assetCard.manage')}
                onClick={e => e.stopPropagation()}
              >
                <Icon name="pen" size={18} />
              </S.AddRoundLink>
              <S.CartLink
                data-testid="card-manage"
                href={props.manageHref}
                target="_blank"
                rel="noopener noreferrer"
                onClick={e => e.stopPropagation()}
              >
                <Icon name="pen" size={20} />
                {t('assetCard.manage')}
              </S.CartLink>
            </S.Action>
          ) : null}
        </S.Body>
      ) : isManageLink && props.mode === 'manage-link' ? (
        // Owned SECONDARY token (wearable/emote): the footer mirrors the view card (name + mint index +
        // listed-price-or-"NOT FOR SALE"), and the action is a hover-revealed MANAGE CTA that opens the
        // item detail page (where List / Update price / Remove live). Chips show at rest and swap out for
        // MANAGE on hover — the exact reveal treatment of the browse card's Add-to-cart.
        <S.Body>
          <S.Top>
            <S.Desc>
              <S.Name title={item.name}>{item.name}</S.Name>
              {issued}
            </S.Desc>
            {priceOrNfs(true)}
          </S.Top>
          <S.Action>
            {chips}
            {/* Compact round MANAGE for the mobile card (the full-width pill is hidden there) — same swap
                the browse card makes between Cart and AddRound. */}
            <S.AddRound onClick={goManage} aria-label={t('assetCard.manage')}>
              <Icon name="pen" size={18} />
            </S.AddRound>
            <S.Cart data-testid="card-manage" onClick={goManage}>
              <Icon name="pen" size={20} />
              {t('assetCard.manage')}
            </S.Cart>
          </S.Action>
        </S.Body>
      ) : isView ? (
        <S.Body>
          {/* View-only footer: name on the left; on the right the credit price when the item is for sale,
              or a small "NOT FOR SALE" tag when it isn't. */}
          <S.Top>
            <S.Desc>
              <S.Name title={item.name}>{item.name}</S.Name>
            </S.Desc>
            {priceOrNfs(true)}
          </S.Top>
          {/* Full-width dark VIEW affordance. Decorative (aria-hidden) — the whole-card overlay link
              above provides the accessible, keyboard-reachable navigation to the item detail. */}
          <S.View data-testid="card-view" aria-hidden>
            <Icon name="eye" size={20} />
            {t('assetCard.view')}
          </S.View>
        </S.Body>
      ) : (
        <S.Body>
          {/* Title+author on one row with the price to their right (Figma). Desc holds the flexible column
              (min-width:0 so a long name ellipses instead of shoving the price out); the price never shrinks. */}
          <S.Top>
            <S.Desc>
              <S.Name title={item.name}>{item.name}</S.Name>
              {/* "by {creator}" line under the title: resolves the creator address to a DCL profile name
                  (short-address fallback while loading / when unnamed) via the shared useProfile query, so
                  many cards with the same creator dedupe to one fetch. */}
              {item.creator ? (
                <S.Author address={item.creator} data-testid="card-author" />
              ) : (
                <S.CreatorEmpty>&nbsp;</S.CreatorEmpty>
              )}
            </S.Desc>
            {onSale ? (
              <S.Price data-variant="sale">
                <S.PriceNow data-testid="card-price-now" title={formatCreditsFull(item.priceCredits)}>
                  <CurrencyIcon size={15} />
                  {formatCredits(item.priceCredits)}
                </S.PriceNow>
                <S.PriceWas data-testid="card-price-was" title={formatCreditsFull(item.compareAtCredits!)}>
                  <CurrencyIcon size={13} />
                  {formatCredits(item.compareAtCredits!)}
                </S.PriceWas>
                <S.Countdown endsAt={item.saleEndsAt} testId="card-countdown" />
              </S.Price>
            ) : (
              <S.Price title={formatCreditsFull(item.priceCredits)}>
                <CurrencyIcon size={15} />
                {formatCredits(item.priceCredits)}
              </S.Price>
            )}
          </S.Top>

          {/* Chips row and the primary action share one fixed-height slot so the card doesn't change size
              when the action is revealed on hover/focus — the button replaces the chips in place. Chips
              show at rest; on hover-capable devices the action reveals on hover or keyboard focus, and it's
              always shown where hover isn't available (touch). Both stay in the DOM so the action is
              keyboard-reachable and touch-tappable. */}
          <S.Action>
            <S.Chips data-chips>
              <S.CardChip
                data-variant="rarity"
                style={{ background: rarityTint(item.rarity), color: rarityInk(item.rarity) }}
                title={rarityDescription(item.rarity)}
              >
                {item.rarity}
              </S.CardChip>
              {item.isSmart ? (
                <S.CardChip data-variant="smart" data-testid="chip-smart">
                  <Icon name="smart" size={13} />
                  {t('assetCard.smart')}
                </S.CardChip>
              ) : null}
              {catIco ? (
                <S.CardChip data-variant="icon">
                  <Icon name={catIco} />
                </S.CardChip>
              ) : null}
              {genderIco ? (
                <S.CardChip data-variant="icon">
                  <Icon name={genderIco} />
                </S.CardChip>
              ) : null}
            </S.Chips>

            {/* Round add button — the compact mobile card's primary action (Figma). Same behavior as the
                full-width Cart below; only one is visible per breakpoint. */}
            <S.AddRound
              data-in={(!own && inCart) || undefined}
              onClick={e => {
                if (own) return goManage(e)
                e.stopPropagation()
                add(item, 'grid')
              }}
              disabled={!own && inCart}
              aria-label={own ? t('assetCard.manage') : inCart ? t('assetCard.inCart') : t('assetCard.addToCart')}
            >
              <Icon name={own ? 'pen' : 'plus'} size={18} />
            </S.AddRound>

            <S.Cart
              data-in={(!own && inCart) || undefined}
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
            </S.Cart>
          </S.Action>
        </S.Body>
      )}
    </S.Card>
  )
}
