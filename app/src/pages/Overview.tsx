import { useCallback, useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { fetchShopItems, type CatalogItem } from '~/lib/api'
import { AssetCard } from '~/components/AssetCard'
import { SkeletonCards, SkeletonSettle } from '~/components/SkeletonCards'
import { FollowedCreatorsRow } from '~/components/FollowedCreatorsRow'
import { OutfitsRow } from '~/components/OutfitsRow'
import { TopCreators } from '~/components/TopCreators'
import { t } from '~/intl/i18n'
import { useSeo } from '~/hooks/useSeo'
import { railPageCount, railPageFromScroll } from '~/lib/pagedRail'
import carouselArrow from '~/assets/icons/carousel-arrow.svg'
// Figma 5566:4449 "Web 1920x340", exported flat rather than rebuilt: the source is thirteen absolutely
// positioned layers with per-layer blurs, two blend modes and an alpha mask, and it is a static
// illustration — reproducing that in CSS would be a lot of fragile geometry for a pixel-identical result.
// WebP, not PNG: the export is fully opaque, so the alpha channel was dead weight, and the same art is
// 90 KB here against 1.09 MB as a PNG.
import heroBanner from '~/assets/overview/hero-credits-outfits.webp'
import { Icon } from '~/components/Icon'
import { CurrencyIcon } from '~/components/CurrencyIcon'
import * as Row from '~/styles/row.styles'
import * as S from './Overview.styles'

const SKELETON_COUNT = 6

// Horizontal card rail (Figma nodes 913:135571 "Featured Products" / 913:135593 "New Creations").
// The track is a CSS grid showing a FIXED whole number of cards per view (5 desktop → 4 → 3 → 2 mobile,
// see Overview.styles.ts `grid-auto-columns`), so an exact integer of cards always fills the viewport with a
// 16px gap — no partial card is ever cut off (matches the Figma). The JS just pages by one viewport
// width and derives the dot count from the scroll extent, so it stays correct at every breakpoint
// without duplicating the per-card width math.
function Carousel({ title, items, loading }: { title: string; items: CatalogItem[]; loading: boolean }) {
  const trackRef = useRef<HTMLDivElement>(null)
  const [pageCount, setPageCount] = useState(1)
  const [page, setPage] = useState(0)

  const count = loading ? SKELETON_COUNT : items.length

  // Recompute the page count (from the scroll extent) and center the arrows on the card media band.
  const measure = useCallback(() => {
    const el = trackRef.current
    if (!el) return
    const view = el.clientWidth
    if (view <= 0) return
    setPageCount(railPageCount(el.scrollWidth, view))
    setPage(railPageFromScroll(el.scrollLeft, el.scrollWidth, view))
    const media = el.querySelector<HTMLElement>('[data-testid="card-media"]')
    const viewport = el.parentElement
    // 12px = the track's top padding; center on the media so the chevrons sit over the artwork.
    if (viewport) viewport.style.setProperty('--rail-arrow-top', `${12 + (media ? media.offsetHeight : 150) / 2}px`)
  }, [])

  useEffect(() => {
    measure()
    const el = trackRef.current
    if (!el) return
    const onScroll = () => setPage(railPageFromScroll(el.scrollLeft, el.scrollWidth, el.clientWidth))
    el.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', measure)
    return () => {
      el.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', measure)
    }
  }, [measure, count])

  // Page by exactly one viewport width — because a whole number of cards fills the viewport, this
  // always lands on a card boundary (a snap point), never on a partial card.
  const scrollToPage = useCallback(
    (p: number) => {
      const el = trackRef.current
      if (!el) return
      const target = Math.max(0, Math.min(pageCount - 1, p))
      el.scrollTo({ left: target * el.clientWidth, behavior: 'smooth' })
    },
    [pageCount]
  )

  const showControls = !loading && pageCount > 1

  return (
    <S.Carousel>
      <Row.Head>
        <Row.Title>{title}</Row.Title>
        <Row.ViewAll to="/items">
          {t('overview.viewAll')} <Icon name="view-all-arrow" size={18} />
        </Row.ViewAll>
      </Row.Head>
      <S.Viewport>
        {showControls ? (
          <S.Arrow
            data-side="left"
            onClick={() => scrollToPage(page - 1)}
            disabled={page <= 0}
            aria-label={t('overview.previous')}
          >
            <img src={carouselArrow} alt="" aria-hidden />
          </S.Arrow>
        ) : null}
        <S.Track ref={trackRef}>
          {loading ? (
            <SkeletonCards count={SKELETON_COUNT} />
          ) : (
            items.map(item => <AssetCard key={item.id} item={item} />)
          )}
        </S.Track>
        {/* The skeletons' exit: the same placeholder rail, laid over the cards that replaced it and
            faded out (see SkeletonSettle) rather than swapped away in one frame. Out of flow, so it
            neither reserves nor costs any height — the arrived cards below it hold the row. */}
        <SkeletonSettle loading={loading}>
          <S.Track>
            <SkeletonCards count={SKELETON_COUNT} settling />
          </S.Track>
        </SkeletonSettle>
        {showControls ? (
          <S.Arrow
            data-side="right"
            onClick={() => scrollToPage(page + 1)}
            disabled={page >= pageCount - 1}
            aria-label={t('overview.next')}
          >
            <img src={carouselArrow} alt="" aria-hidden />
          </S.Arrow>
        ) : null}
      </S.Viewport>
      {/* The page-indicator strip is reserved WHETHER OR NOT there is anything to page: it is 24px tall
          (a 12px dot row plus its margin), and letting it appear only once the rail knew its page count
          pushed every section below the carousel down by exactly that much the moment the listings
          landed. Empty it paints nothing, so the reservation is invisible — only the shift was. */}
      {showControls ? (
        <S.Dots aria-label={t('overview.carouselPages', { title })}>
          {Array.from({ length: pageCount }).map((_, i) => (
            <S.Dot
              key={i}
              data-active={i === page || undefined}
              onClick={() => scrollToPage(i)}
              aria-label={t('overview.goToPage', { page: i + 1 })}
              aria-current={i === page ? 'true' : undefined}
            />
          ))}
        </S.Dots>
      ) : (
        <S.Dots aria-hidden data-testid="rail-dots-reserved" />
      )}
    </S.Carousel>
  )
}

export function Overview() {
  // Home page: the hook's site-wide default title/description is the best fit here (its title tail is
  // "Wearables & Emotes for Your Avatar", which we don't want to override), so pass nothing. Indexable.
  useSeo({})
  // Featured / New Creations promote CREATORS, so they show PRIMARY (mint) listings only — no resales.
  // The shop feed carries both, and a secondary (resale) row is the only kind with a per-token tokenId
  // (it also carries no item name, which is why those cards rendered blank), so filter them out. Fetch
  // a bigger page than we show so 24 primary rows survive the filter.
  const { data, isLoading } = useQuery({
    queryKey: ['overview-listings'],
    queryFn: () => fetchShopItems({ first: 48, sortBy: 'newest', listingType: 'primary' })
  })
  const items = data?.items ?? []

  return (
    <S.Overview className="overview">
      <S.Hero>
        <S.HeroBg src={heroBanner} alt="" aria-hidden />
        {/* No scrim over this banner: the artwork carries its own left-to-right darkening (a
            multiply-blended gradient in the Figma source), so the separate scrim layer stacked a second
            one on top and took the left half of the image to near-black. */}
        <S.HeroInner>
          <S.HeroTitle>{t('overview.heroTitle')}</S.HeroTitle>
          {/* Figma 2004:322550. The CTA now goes to /credits, not to the grid: the banner sells credits, so
              sending the click to browse would leave the buyer one step short of what it advertises. */}
          <S.HeroCta as={Link} to="/credits" variant="purple">
            <CurrencyIcon size={18} />
            {t('overview.heroCta')}
          </S.HeroCta>
        </S.HeroInner>
      </S.Hero>

      {isLoading || items.length > 0 ? (
        <>
          <Carousel title={t('overview.featuredProducts')} items={items.slice(0, 12)} loading={isLoading} />

          {/* New Creations carousel — needs a second page of listings (>12) to be worth showing.
              While the ONE query behind both rails is in flight that is not knowable yet, so the row
              renders its skeletons: a home page whose second rail materialises after the fact shoved
              everything under it (outfits, creators, the footer) down by a full 438px, which is the
              single biggest jump on this page. The trade is a catalogue that comes back with 12 rows or
              fewer, where the reserved row is then dropped; that is the same sparse case the empty state
              covers, and it costs one shift instead of one on every load. */}
          {isLoading || items.length > 12 ? (
            <Carousel title={t('overview.newCreations')} items={items.slice(12, 24)} loading={isLoading} />
          ) : null}

          {/* "Buy the Look" is the THIRD section, after both carousels. It sat between them for a while
              because that is the order the mobile Figma frame (1016:84664) draws; the product order is the
              one here — the two listing rails first, outfits under them.
              It self-fetches and renders nothing until published outfits resolve, so on an environment with
              no shop-server the section is simply absent — it is a place for outfits, not a guaranteed one. */}
          <OutfitsRow />
        </>
      ) : (
        <S.Empty>
          <S.EmptyTitle>{t('overview.emptyTitle')}</S.EmptyTitle>
          <p className="muted">{t('overview.emptyBody')}</p>
          <S.EmptyCta as={Link} to="/items" variant="purple">
            {t('notFound.cta')}
          </S.EmptyCta>
        </S.Empty>
      )}

      {/* The creators section is dead last. Recently viewed used to sit above it and is gone: the home
          page now leads with what the Shop is selling, and a row of things you have already looked at
          competes with that. The store still records views — nothing else read that row — so bringing it
          back is re-adding the component, not rebuilding it.
          FollowedCreatorsRow renders nothing until it has data (the follows flag is off), so it costs a
          fetch-free no-op here rather than an empty section. */}
      <FollowedCreatorsRow />
      <TopCreators />
    </S.Overview>
  )
}
