import { useCallback, useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { t } from '~/intl/i18n'
import { getAvatarBackgroundColor, getDisplayName } from '~/lib/avatarColor'
import { formatCount } from '~/lib/text'
import { railGeometry, railPageFromGeometry, scrollRailToPage } from '~/lib/pagedRail'
import { fetchProfiles } from '~/lib/profile'
import { fetchShopTopCreators } from '~/lib/rankings'
import { selectTopCreators, type TopCreator } from '~/lib/topCreators'
import carouselArrow from '~/assets/icons/carousel-arrow.svg'
import * as S from './TopCreators.styles'

// "Meet Our Top Creators" — eight cards for the creators whose work EARNED most over the last month, from
// marketplace-server /v3/catalog/creators (see lib/rankings). Four per view on desktop, so the row is a
// two-page carousel with arrows and dots, like every other rail on the home page; below the mobile
// breakpoint it steps down to one card per page.
//
// The card introduces the creator with what they have published and what they have sold over all time.
// The RANKING is the last 30 days — recent trading is what earns a place on the row — but the figures on
// the card are their standing, which is what a shopper is being asked to judge them on.
//
// So the card deliberately shows NEITHER of the numbers that ordered it. Revenue is the honest ranking
// signal and a poor introduction: "sold 4,847 MANA last month" invites a shopper to price a creator
// rather than to browse them, and the figure swings month to month in a way a card cannot caveat.
//
// States: eight skeleton cards while loading; on error OR an empty row the section renders nothing.

const CARDS = 8
const DAYS = 30

/**
 * How many ranked creators to ask for. Well above CARDS because presentability is decided here rather
 * than by the server (see lib/topCreators): unclaimed names and duplicates are dropped after ranking,
 * and on production ~1 candidate in 6 falls out that way.
 */
const CANDIDATES = 30

// The creator's storefront. No `?collections` flag — the CTA says "view creations", which is the
// listings view. Router-relative on purpose: BrowserRouter carries the per-environment /shop
// basename, so this resolves to <host>/shop/items/creator/<address> in deployed environments.
function creationsPath(address: string): string {
  return `/items/creator/${address}`
}

function CreatorCard({ creator }: { creator: TopCreator }) {
  const { address, name, totalSales, collections, items, face } = creator

  // `undefined` is "not sent", which is not the same as zero: a creator really can have sold nothing, and
  // that is worth saying. Only a missing figure drops its line.
  const catalogue =
    collections != null && items != null
      ? t('topCreators.catalogue', { collections: formatCount(collections), items: formatCount(items) })
      : null
  const lifetime = totalSales != null ? t('topCreators.totalSales', { sales: formatCount(totalSales) }) : null

  // Deterministic per-user avatar backdrop — identical to CreatorHero / the in-world client
  // (ADR-292, see lib/avatarColor). Shows behind a transparent face snapshot and as the placeholder.
  const avatarBg = getAvatarBackgroundColor(getDisplayName({ name, hasClaimedName: true, ethAddress: address }))

  return (
    <S.Card
      to={creationsPath(address)}
      aria-label={t('topCreators.viewCreationsBy', { name })}
      data-testid="top-creator-card"
    >
      <S.Avatar style={{ backgroundColor: avatarBg }}>
        {face ? <img src={face} alt="" loading="lazy" /> : null}
      </S.Avatar>
      <S.Panel>
        <S.TextBlock>
          <S.Name title={name}>{name}</S.Name>
          {/* Each line renders only if the ranking gave us its figures. The blurb keeps its two-line floor
              either way, so a card missing one is the same height as its neighbours. */}
          <S.Desc>
            {catalogue ? (
              <>
                {catalogue}
                <br />
              </>
            ) : null}
            {lifetime}
          </S.Desc>
        </S.TextBlock>
        {/* Visual only: the card's link is already named "view creations by …", so a second copy of
            that text in the accessibility tree would just be noise. */}
        <S.Cta aria-hidden>{t('topCreators.viewCreations')}</S.Cta>
      </S.Panel>
    </S.Card>
  )
}

function SkeletonCard() {
  return (
    <S.SkeletonCard aria-hidden data-testid="top-creator-skeleton">
      <S.Avatar className="skeleton" />
      <S.Panel data-skeleton>
        <S.SkeletonName className="skeleton" />
        {/* The two bars go inside a stand-in for the blurb's own box rather than stacking loose in the
            panel: loose, their heights and margins summed 2px past the real Desc's two-line floor, and
            those 2px were the footer sitting lower under a loading row than under a loaded one. */}
        <S.SkeletonDescBlock>
          <S.SkeletonDesc className="skeleton" />
          <S.SkeletonDesc className="skeleton" data-short />
        </S.SkeletonDescBlock>
        <S.SkeletonCta className="skeleton" />
      </S.Panel>
    </S.SkeletonCard>
  )
}

export function TopCreators() {
  // Ranking and profiles resolve as ONE query: a card cannot be drawn before its creator has passed the
  // name check, so a two-query version would only mean a row that renders and then loses cards.
  const { data, isLoading, isError } = useQuery({
    queryKey: ['shop-top-creators', DAYS, CANDIDATES, CARDS],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const ranked = await fetchShopTopCreators(CANDIDATES, DAYS)
      const profiles = await fetchProfiles(ranked.map(creator => creator.id))
      return selectTopCreators(ranked, profiles, CARDS)
    }
  })

  const creators = data ?? []

  const trackRef = useRef<HTMLDivElement>(null)
  const [pageCount, setPageCount] = useState(1)
  const [page, setPage] = useState(0)

  // Paged off the CARDS rather than off viewport widths (see lib/pagedRail): under mandatory snap only a
  // card start is a scroll target the browser honours.
  const measure = useCallback(() => {
    const el = trackRef.current
    if (!el) return
    const geometry = railGeometry(el)
    if (!geometry) return
    setPageCount(geometry.pageCount)
    setPage(railPageFromGeometry(el, geometry))
  }, [])

  useEffect(() => {
    measure()
    const el = trackRef.current
    if (!el) return
    // One read per frame: railGeometry reads offsetLeft, so an unthrottled handler forces a synchronous
    // reflow on every scroll event.
    let frame = 0
    const onScroll = () => {
      if (frame) return
      frame = requestAnimationFrame(() => {
        frame = 0
        const geometry = railGeometry(el)
        if (geometry) setPage(railPageFromGeometry(el, geometry))
      })
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', measure)
    return () => {
      if (frame) cancelAnimationFrame(frame)
      el.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', measure)
    }
  }, [measure, creators.length])

  const scrollToPage = useCallback((target: number) => {
    const el = trackRef.current
    if (!el) return
    const geometry = railGeometry(el)
    if (geometry) scrollRailToPage(el, geometry, target)
  }, [])

  if (isError || (!isLoading && creators.length === 0)) return null

  const title = t('topCreators.title')
  const showControls = !isLoading && pageCount > 1

  return (
    <S.Root data-testid="top-creators">
      <S.Head>
        <S.Title>{title}</S.Title>
      </S.Head>

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
          {isLoading
            ? Array.from({ length: CARDS }).map((_, i) => <SkeletonCard key={i} />)
            : creators.map(creator => <CreatorCard key={creator.address} creator={creator} />)}
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
        <S.Dots data-testid="top-creators-dots" aria-label={t('overview.carouselPages', { title })}>
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
        // The strip keeps its box while the row loads (see OutfitsRow, and Dots' own min-height): eight
        // cards is always more than one page, so the dots WILL arrive — and arriving with the content is
        // 24px of footer moving down the moment the ranking lands.
        <S.Dots aria-hidden data-testid="rail-dots-reserved" />
      )}
    </S.Root>
  )
}

export default TopCreators
