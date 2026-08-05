import { useCallback, useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { t } from '~/intl/i18n'
import { useProfile } from '~/hooks/useProfile'
import { useStore } from '~/hooks/useStore'
import { getAvatarBackgroundColor, getDisplayName } from '~/lib/avatarColor'
import { shortAddress } from '~/lib/address'
import { capitalizeFirst } from '~/lib/text'
import { fetchCreatorCollections, fetchCreatorItems } from '~/lib/collections'
import { railPageCount, railPageFromScroll } from '~/lib/pagedRail'
import { fetchTopCreators } from '~/lib/rankings'
import * as S from './TopCreators.styles'

// "Meet Our Top Creators" — up to four cards for the week's most active creators, from
// marketplace-server /v1/rankings/creators/week (see lib/rankings.ts), ranked by sales because that
// is what "most active" means here. Desktop shows the four side by side; below the mobile breakpoint
// the same row becomes a one-card-per-page carousel with dots.
//
// The ranking decides WHO appears; the card itself is neutral about it — it introduces the creator
// (avatar, name, their own blurb) and never voices sales figures or anything else about why they made
// the row. When they wrote no blurb it stands in their published totals instead, so a visitor still
// learns something about them. The blurb's two lines are reserved either way, so nothing moves when it
// lands.
//
// States: four skeleton cards while loading; on error OR an empty ranking the section renders nothing.

const CARDS = 4

// The creator's storefront. No `?collections` flag — the CTA says "view creations", which is the
// listings view. Router-relative on purpose: BrowserRouter carries the per-environment /shop
// basename, so this resolves to <host>/shop/items/creator/<address> in deployed environments.
function creationsPath(address: string): string {
  return `/items/creator/${address}`
}

// Takes an ADDRESS, not the ranking row: everything the card says about a creator it reads for itself,
// so there is nothing here for a ranking number to leak through.
function CreatorCard({ address }: { address: string }) {
  const { data: profile } = useProfile(address)
  const { data: store } = useStore(address)
  const description = store?.description ?? ''

  /**
   * The creator's PUBLISHED totals, for the fallback blurb.
   *
   * Deliberately not the ranking's own numbers: the ranking's `collections` counts the collections that
   * had a sale in the window, and `sales` is why the creator is on this row at all. The card introduces
   * a creator rather than justifying their rank, so it says what they have published, full stop.
   *
   * Two page-1 requests, only for a creator who wrote no blurb, and only once the store has answered
   * (otherwise they fire for every card while that is still in flight). Until they land, or if they
   * fail, the card simply has no second line.
   */
  const { data: totals } = useQuery({
    queryKey: ['creator-totals', address],
    enabled: store !== undefined && !description,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const [collections, items] = await Promise.all([
        fetchCreatorCollections(address, { first: 1 }),
        fetchCreatorItems(address, { first: 1 })
      ])
      return { collections: collections.total, items: items.total }
    }
  })

  const name = profile?.name ? capitalizeFirst(profile.name) : shortAddress(address)
  const face = profile?.avatar?.snapshots?.face256
  // Deterministic per-user avatar backdrop — identical to CreatorHero / the in-world client
  // (ADR-292, see lib/avatarColor). Shows behind a transparent face snapshot and as the placeholder.
  const avatarBg = getAvatarBackgroundColor(
    getDisplayName({
      name: profile?.name,
      hasClaimedName: profile?.hasClaimedName,
      ethAddress: profile?.ethAddress ?? address
    })
  )
  const blurb = totals ? t('topCreators.stats', totals) : description

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
  const { data, isLoading, isError } = useQuery({
    queryKey: ['rankings', 'creators', 'week', 'most_sales', CARDS],
    queryFn: () => fetchTopCreators('week', CARDS, 'most_sales')
  })

  const creators = (data ?? []).slice(0, CARDS)

  const trackRef = useRef<HTMLDivElement>(null)
  const [pageCount, setPageCount] = useState(1)
  const [page, setPage] = useState(0)

  // Same paging model as the Overview carousels (see lib/pagedRail): a page is one viewport-width of
  // scroll, so the dots stay honest whether the row scrolls one card at a time or not at all.
  const measure = useCallback(() => {
    const el = trackRef.current
    if (!el) return
    if (el.clientWidth <= 0) return
    const pages = railPageCount(el.scrollWidth, el.clientWidth)
    setPageCount(pages)
    setPage(current => Math.min(pages - 1, current))
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
          : creators.map(creator => <CreatorCard key={creator.id} address={creator.id} />)}
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
