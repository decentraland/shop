import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { fetchListings } from '~/lib/api'
import { AssetCard } from '~/components/AssetCard'
import { SkeletonCards } from '~/components/SkeletonCards'
import { CardCarousel } from '~/components/CardCarousel'
import { AvatarShowcase } from '~/components/AvatarShowcase'
import { FollowedCreatorsRow } from '~/components/FollowedCreatorsRow'
import { RecentlyViewed } from '~/components/RecentlyViewed'
import { WeekTopCreators } from '~/components/WeekTopCreators'
import { t } from '~/intl/i18n'
import { useSeo } from '~/hooks/useSeo'
import heroBanner from '~/assets/overview/hero-fashion-week.png'
import promoEmotes from '~/assets/overview/promo-best-rated-emotes.png'
import promoOutfits from '~/assets/overview/promo-week-selected-outfits.png'
import { LivePromo } from '~/components/LivePromo'
import * as S from './Overview.styles'

const SKELETON_COUNT = 6

export function Overview() {
  // Home page: the hook's site-wide default title/description is the best fit here (its title tail is
  // "Wearables & Emotes for Your Avatar", which we don't want to override), so pass nothing. Indexable.
  useSeo({})
  // Featured / New Creations promote CREATORS, so they show PRIMARY (mint) listings only — no resales.
  // The shop feed carries both, and a secondary (resale) row is the only kind with a per-token tokenId
  // (it also carries no item name, which is why those cards rendered blank), so filter them out. Fetch
  // a bigger page than we show so 24 primary rows survive the filter.
  const { data, isLoading } = useQuery({ queryKey: ['overview-listings'], queryFn: () => fetchListings({ first: 48 }) })
  const items = (data?.items ?? []).filter(i => !i.tokenId)

  return (
    <S.Overview className="overview">
      <S.Hero>
        <S.HeroBg src={heroBanner} alt="" aria-hidden />
        <S.HeroScrim aria-hidden />
        <S.HeroInner>
          <S.HeroTitle>{t('overview.heroTitle')}</S.HeroTitle>
          <S.HeroCta as={Link} to="/assets" variant="purple">
            {t('overview.exploreCollection')}
          </S.HeroCta>
        </S.HeroInner>
      </S.Hero>

      {isLoading || items.length > 0 ? (
        <>
          <CardCarousel
            title={t('overview.featuredProducts')}
            count={isLoading ? SKELETON_COUNT : items.slice(0, 12).length}
            loading={isLoading}
            viewAllTo="/assets"
          >
            {isLoading ? (
              <SkeletonCards count={SKELETON_COUNT} />
            ) : (
              items.slice(0, 12).map(item => <AssetCard key={item.id} item={item} />)
            )}
          </CardCarousel>

          {/* Live promo tiles: real avatars over the fitting room's animated backdrop — the monkey
              playing HOT SAX for emotes, the week's featured skin in a fashion pose for outfits. */}
          <S.Promos>
            <LivePromo
              id="shop-promo-emotes"
              to="/assets?category=emote"
              urns={[
                'urn:decentraland:matic:collections-v2:0xe9f388ae27c726c4772c85a194e9791b1a0a913c:0',
                'urn:decentraland:matic:collections-v2:0x0c956c74518ed34afb7b137d9ddfdaea7ca13751:0'
              ]}
              title={t('overview.bestRatedEmotes')}
              cta={t('overview.exploreEmotes')}
              ariaLabel={t('overview.promoEmotesAria')}
              fallback={promoEmotes}
              fallbackAlt={t('overview.promoEmotesAlt')}
            />
            <LivePromo
              id="shop-promo-outfits"
              to="/assets"
              urns={[
                'urn:decentraland:matic:collections-v2:0x6c3ca91dbac390d60d4267fdcf48576f6c051dbe:0',
                'urn:decentraland:matic:collections-v2:0x9620151fe5e1c8fd0638a4840cf5e63d19b09765:0'
              ]}
              zoom={80}
              title={t('overview.weekSelectedOutfits')}
              cta={t('overview.exploreCollection')}
              ariaLabel={t('overview.promoOutfitsAria')}
              fallback={promoOutfits}
              fallbackAlt={t('overview.promoOutfitsAlt')}
            />
          </S.Promos>

          {/* Curated "ready to use" avatar looks, shown as a horizontal rail after the promo tiles. */}
          <AvatarShowcase />

          {/* New Creations carousel — needs a second page of listings (>12) to be worth showing. */}
          {items.length > 12 ? (
            <CardCarousel title={t('overview.newCreations')} count={items.slice(12, 24).length} viewAllTo="/assets">
              {items.slice(12, 24).map(item => (
                <AssetCard key={item.id} item={item} />
              ))}
            </CardCarousel>
          ) : null}
        </>
      ) : (
        <S.Empty>
          <S.EmptyTitle>{t('overview.emptyTitle')}</S.EmptyTitle>
          <p className="muted">{t('overview.emptyBody')}</p>
          <S.EmptyCta as={Link} to="/assets" variant="purple">
            {t('notFound.cta')}
          </S.EmptyCta>
        </S.Empty>
      )}

      {/* Discovery rows, then the Week Top Creators ranking table dead last — matching the Figma frame
          order (913:135556): hero → Featured → promos → New Creations → … → Active Ranking at the very
          bottom. RecentlyViewed / FollowedCreatorsRow render nothing until they have data. */}
      <RecentlyViewed />
      <FollowedCreatorsRow />
      <WeekTopCreators />
    </S.Overview>
  )
}
