import { useCallback, useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { t } from '~/intl/i18n'
import { getAvatarBackgroundColor, getDisplayName } from '~/lib/avatarColor'
import { railGeometry, railPageFromGeometry, scrollRailToPage } from '~/lib/pagedRail'
import { fetchProfiles } from '~/lib/profile'
import { fetchShopTopCreators } from '~/lib/rankings'
import { selectTopCreators, type TopCreator } from '~/lib/topCreators'
import carouselArrow from '~/assets/icons/carousel-arrow.svg'
import * as S from './TopCreators.styles'

// "Meet Our Top Creators" — eight cards for the creators whose work sold most over the last month, from
// marketplace-server /v3/catalog/creators (see lib/rankings). Four per view on desktop, so the row is a
// two-page carousel with arrows and dots, like every other rail on the home page; below the mobile
// breakpoint it steps down to one card per page.
//
// The card says what put the creator on the row — their recent sales — and nothing else. It used to
// blurb their published collection and item totals instead, which read as a catalogue size and left a
// creator with one busy collection looking smaller than a dormant one with twenty.
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
  const { address, name, sales, face } = creator

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
        <S.Name title={name}>{name}</S.Name>
        <S.Desc>{t('topCreators.sales', { sales, days: DAYS })}</S.Desc>
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
    // Centre the arrows on the avatar rather than on the whole card: the card is tall and mostly panel,
    // so its midpoint lands in the middle of the blurb.
    const avatar = el.querySelector<HTMLElement>('[data-testid="top-creator-card"] > *')
    if (avatar)
      el.parentElement?.style.setProperty('--rail-arrow-top', `${avatar.offsetTop + avatar.offsetHeight / 2}px`)
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
      ) : null}
    </S.Root>
  )
}

export default TopCreators
