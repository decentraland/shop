import { useCallback, useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { fetchShopItems, type CatalogItem } from '~/lib/api'
import { AssetCard } from '~/components/AssetCard'
import { SkeletonCards } from '~/components/SkeletonCards'
import { FollowedCreatorsRow } from '~/components/FollowedCreatorsRow'
import { OutfitsRow } from '~/components/OutfitsRow'
import { WeekTopCreators } from '~/components/WeekTopCreators'
import { t } from '~/intl/i18n'
import { useSeo } from '~/hooks/useSeo'
import carouselArrow from '~/assets/icons/carousel-arrow.svg'
import heroBanner from '~/assets/overview/hero-fashion-week.png'
import { Icon } from '~/components/Icon'
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
    const pages = Math.max(1, Math.ceil((el.scrollWidth - view) / view) + 1)
    setPageCount(pages)
    setPage(Math.min(pages - 1, Math.round(el.scrollLeft / view)))
    const media = el.querySelector<HTMLElement>('[data-testid="card-media"]')
    const viewport = el.parentElement
    // 12px = the track's top padding; center on the media so the chevrons sit over the artwork.
    if (viewport) viewport.style.setProperty('--ov-arrow-top', `${12 + (media ? media.offsetHeight : 150) / 2}px`)
  }, [])

  useEffect(() => {
    measure()
    const el = trackRef.current
    if (!el) return
    const onScroll = () => setPage(Math.round(el.scrollLeft / Math.max(1, el.clientWidth)))
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
      ) : null}
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
        <S.HeroScrim aria-hidden />
        <S.HeroInner>
          <S.HeroTitle>{t('overview.heroTitle')}</S.HeroTitle>
          <S.HeroCta as={Link} to="/items" variant="purple">
            {t('overview.exploreCollection')}
          </S.HeroCta>
        </S.HeroInner>
      </S.Hero>

      {isLoading || items.length > 0 ? (
        <>
          <Carousel title={t('overview.featuredProducts')} items={items.slice(0, 12)} loading={isLoading} />

          {/* New Creations carousel — needs a second page of listings (>12) to be worth showing. */}
          {items.length > 12 ? (
            <Carousel title={t('overview.newCreations')} items={items.slice(12, 24)} loading={false} />
          ) : null}

          {/* "Buy the look" sits here, directly after New Creations, so the outfits land inside the
              listings block rather than below the discovery rails. It self-fetches and renders nothing
              until published outfits resolve, so on an environment with no shop-server this row is
              simply absent — the section is a place for outfits, not a guaranteed one. */}
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

      {/* The creators ranking table is dead last (Figma 1878:67135). Recently viewed used to sit above it
          and is gone: the home page now leads with what the Shop is selling, and a row of things you have
          already looked at competes with that. The store still records views — nothing else read that row —
          so bringing it back is re-adding the component, not rebuilding it.
          FollowedCreatorsRow renders nothing until it has data (the follows flag is off), so it costs a
          fetch-free no-op here rather than an empty section. */}
      <FollowedCreatorsRow />
      <WeekTopCreators />
    </S.Overview>
  )
}
