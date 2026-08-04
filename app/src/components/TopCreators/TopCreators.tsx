import { useCallback, useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { t } from '~/intl/i18n'
import { useProfile } from '~/hooks/useProfile'
import { useStore } from '~/hooks/useStore'
import { getAvatarBackgroundColor, getDisplayName } from '~/lib/avatarColor'
import { shortAddress } from '~/lib/address'
import { capitalizeFirst } from '~/lib/text'
import { fetchTopCreators, type CreatorRank } from '~/lib/rankings'
import * as S from './TopCreators.styles'

// "Meet Our Top Creators" — up to four cards for the week's most active creators, from
// marketplace-server /v1/rankings/creators/week (see lib/rankings.ts), ranked by sales because that
// is what "most active" means here. Desktop shows the four side by side; below the mobile breakpoint
// the same row becomes a one-card-per-page carousel with dots.
//
// States: four skeleton cards while loading; on error OR an empty ranking the section renders nothing.
// A card's blurb comes from the creator's store entity and is best-effort — when they never wrote one
// it falls back to their ranking numbers, so every card keeps the same two lines.

const CARDS = 4

// The creator's storefront. No `?collections` flag — the CTA says "view creations", which is the
// listings view. Router-relative on purpose: BrowserRouter carries the per-environment /shop
// basename, so this resolves to <host>/shop/items/creator/<address> in deployed environments.
function creationsPath(address: string): string {
  return `/items/creator/${address}`
}

function CreatorCard({ creator }: { creator: CreatorRank }) {
  const { data: profile } = useProfile(creator.id)
  const { data: store } = useStore(creator.id)

  const name = profile?.name ? capitalizeFirst(profile.name) : shortAddress(creator.id)
  const face = profile?.avatar?.snapshots?.face256
  // Deterministic per-user avatar backdrop — identical to CreatorHero / the in-world client
  // (ADR-292, see lib/avatarColor). Shows behind a transparent face snapshot and as the placeholder.
  const avatarBg = getAvatarBackgroundColor(
    getDisplayName({
      name: profile?.name,
      hasClaimedName: profile?.hasClaimedName,
      ethAddress: profile?.ethAddress ?? creator.id
    })
  )
  const blurb = store?.description || t('topCreators.stats', { collections: creator.collections, sales: creator.sales })

  return (
    <S.Card
      to={creationsPath(creator.id)}
      aria-label={t('topCreators.viewCreationsBy', { name })}
      data-testid="top-creator-card"
    >
      <S.Avatar style={{ backgroundColor: avatarBg }}>
        {face ? <img src={face} alt="" loading="lazy" /> : null}
      </S.Avatar>
      <S.Panel>
        <S.Name title={name}>{name}</S.Name>
        <S.Desc>{blurb}</S.Desc>
        {/* Visual only: the card's link is already named "view creations by …", so a second copy of
            that text in the accessibility tree would just be noise. */}
        <S.Cta aria-hidden>{t('topCreators.viewCreations')}</S.Cta>
      </S.Panel>
    </S.Card>
  )
}

function SkeletonCard() {
  return (
    <S.SkeletonCard aria-hidden>
      <S.Avatar className="skeleton" />
      <S.Panel data-skeleton>
        <S.SkeletonName className="skeleton" />
        <S.SkeletonDesc className="skeleton" />
        <S.SkeletonDesc className="skeleton" data-short />
      </S.Panel>
    </S.SkeletonCard>
  )
}

export function TopCreators() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['rankings', 'creators', 'week', 'most_sales', CARDS],
    queryFn: () => fetchTopCreators('week', CARDS, 'most_sales')
  })

  const creators = (data ?? []).slice(0, CARDS)

  const trackRef = useRef<HTMLDivElement>(null)
  const [pageCount, setPageCount] = useState(1)
  const [page, setPage] = useState(0)

  // Same paging model as the Overview carousels: a page is one viewport-width of scroll, so the dots
  // stay honest whether the row is scrolling one card at a time or not scrolling at all.
  const measure = useCallback(() => {
    const el = trackRef.current
    if (!el) return
    const view = el.clientWidth
    if (view <= 0) return
    const pages = Math.max(1, Math.ceil((el.scrollWidth - view) / view) + 1)
    setPageCount(pages)
    setPage(current => Math.min(pages - 1, current))
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
  }, [measure, creators.length])

  const scrollToPage = useCallback(
    (target: number) => {
      const el = trackRef.current
      if (!el) return
      const clamped = Math.max(0, Math.min(pageCount - 1, target))
      el.scrollTo({ left: clamped * el.clientWidth, behavior: 'smooth' })
    },
    [pageCount]
  )

  if (isError || (!isLoading && creators.length === 0)) return null

  const title = t('topCreators.title')

  return (
    <S.Root data-testid="top-creators">
      <S.Head>
        <S.Title>{title}</S.Title>
      </S.Head>

      <S.Track ref={trackRef}>
        {isLoading
          ? Array.from({ length: CARDS }).map((_, i) => <SkeletonCard key={i} />)
          : creators.map(creator => <CreatorCard key={creator.id} creator={creator} />)}
      </S.Track>

      {pageCount > 1 ? (
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
