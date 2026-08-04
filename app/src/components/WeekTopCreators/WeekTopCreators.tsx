import { ethers } from 'ethers'
import { useQuery } from '@tanstack/react-query'
import { t } from '~/intl/i18n'
import { useProfile } from '~/hooks/useProfile'
import { CurrencyIcon } from '~/components/CurrencyIcon'
import { shortAddress } from '~/lib/address'
import { capitalizeFirst } from '~/lib/text'
import { fetchCreatorCollectionThumbnails } from '~/lib/collections'
import { fetchTopCreators, type CreatorRank } from '~/lib/rankings'
import * as S from './WeekTopCreators.styles'

// "Week Top Creators" table (Figma node 1914-293213). Real data from marketplace-server
// /v1/rankings/creators/week (see lib/rankings.ts): Rank · Creator · Collections · Sales · Volume.
//
// Volume is the ranking's `earned` field, MANA wei converted to whole MANA. It is labelled with the
// app-wide currency mark, which is the CREDITS mark — so the number and its symbol disagree about the
// denomination. Converting needs an oracle rate the client does not read here, so the mismatch is
// carried over from before this redesign rather than papered over by relabelling the column.
//
// Each row is a single link to the creator's storefront with its Collections view selected; the
// "view collections" pill the design reveals on hover is a LABEL on that link, not a second control
// (see S.RowLink). The design's period/category dropdown is not built yet — the title stands in.
//
// States: skeleton rows while loading; on error OR empty result the whole section renders nothing (no
// broken/empty table). Collection artwork is best-effort and independent: if it is missing or fails,
// the cell falls back to the plain collection count and the rest of the row is unaffected.

const ROWS = 10
const THUMBS_PER_ROW = 3
// One page for the whole table, not one per row (see fetchCreatorCollectionThumbnails). Four items per
// row is enough to reach three distinct collections in the common case.
const THUMB_PAGE = ROWS * 4

// MANA wei (18 decimals) → a compact whole-MANA string (e.g. "1,234"). Floors to whole MANA and groups
// thousands. Returns "0" on a malformed value so a bad row never breaks the table.
function formatManaVolume(earnedWei: string): string {
  try {
    const mana = Math.floor(Number(ethers.utils.formatEther(earnedWei)))
    return mana.toLocaleString('en-US')
  } catch {
    return '0'
  }
}

// The creator's storefront with its Collections view selected. Creator.tsx switches on a BARE
// `?collections` flag (searchParams.has), so `?collections=true` or `?tab=collections` would land on
// the listings view instead. Router-relative on purpose: BrowserRouter carries the per-environment
// /shop basename, so this resolves to <host>/shop/assets/creator/<address>?collections in deployed
// environments and to /assets/creator/... on localhost.
function collectionsPath(address: string): string {
  return `/assets/creator/${address}?collections`
}

function CreatorRow({ rank, creator, thumbnails }: { rank: number; creator: CreatorRank; thumbnails: string[] }) {
  // Same shared profile query the badge below uses, so this costs no extra request — the row needs the
  // resolved name as a STRING for the link's accessible name, which the badge can't hand back.
  const { data: profile } = useProfile(creator.id)
  const name = profile?.name ? capitalizeFirst(profile.name) : shortAddress(creator.id)
  // The chip counts the collections we have no artwork for. With no artwork at all it carries the plain
  // count instead: the column keeps meaning what it did before the thumbnails existed, rather than
  // reading as "+everything".
  const rest = Math.max(0, creator.collections - thumbnails.length)

  return (
    <S.Row>
      <S.RankCell>
        <S.Rank>{rank}</S.Rank>
        <S.RowLink to={collectionsPath(creator.id)} aria-label={t('weekTopCreators.viewCollectionsBy', { name })} />
      </S.RankCell>
      <S.CreatorCell>
        <S.Creator address={creator.id} hidePrefix />
      </S.CreatorCell>
      <S.CollectionsCell>
        <S.Thumbs>
          {thumbnails.map(src => (
            <S.Thumb key={src}>
              <img src={src} alt="" loading="lazy" />
            </S.Thumb>
          ))}
          {thumbnails.length === 0 || rest > 0 ? (
            <S.More>{thumbnails.length > 0 ? `+${rest}` : creator.collections.toLocaleString('en-US')}</S.More>
          ) : null}
        </S.Thumbs>
        <S.Count>{creator.collections.toLocaleString('en-US')}</S.Count>
      </S.CollectionsCell>
      <S.Num>{creator.sales.toLocaleString('en-US')}</S.Num>
      <S.AmountCell>
        <S.AmountRow>
          <S.Amount>
            <CurrencyIcon size={18} />
            {formatManaVolume(creator.earned)}
          </S.Amount>
          {/* Visual only: the row's link is already named "view collections by …", so a second copy of
              that text in the accessibility tree would just be noise. */}
          <S.Cta aria-hidden>{t('weekTopCreators.viewCollections')}</S.Cta>
        </S.AmountRow>
      </S.AmountCell>
    </S.Row>
  )
}

function SkeletonRow() {
  return (
    <S.Row>
      <S.RankCell>
        <S.Rank data-skeleton />
      </S.RankCell>
      <S.CreatorCell>
        <S.Skeleton data-creator />
      </S.CreatorCell>
      <S.CollectionsCell>
        <S.Thumbs>
          {Array.from({ length: THUMBS_PER_ROW }).map((_, i) => (
            <S.Skeleton key={i} data-thumb />
          ))}
        </S.Thumbs>
        <S.Count>
          <S.Skeleton />
        </S.Count>
      </S.CollectionsCell>
      <S.Num>
        <S.Skeleton />
      </S.Num>
      <S.AmountCell>
        <S.AmountRow>
          <S.Skeleton />
        </S.AmountRow>
      </S.AmountCell>
    </S.Row>
  )
}

export function WeekTopCreators() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['rankings', 'creators', 'week'],
    queryFn: () => fetchTopCreators('week', ROWS)
  })

  const creators = data ?? []
  const addresses = creators.map(c => c.id.toLowerCase())
  // One request for the whole table, keyed by the addresses it covers so it is fetched once per
  // ranking and served from cache on every later render. Artwork barely changes, hence the long
  // staleTime; a failure here leaves `thumbnails` empty and the cells fall back to the count.
  const { data: thumbnails } = useQuery({
    queryKey: ['creator-collection-thumbs', addresses.join(',')],
    queryFn: () => fetchCreatorCollectionThumbnails(addresses, { perCreator: THUMBS_PER_ROW, first: THUMB_PAGE }),
    enabled: addresses.length > 0,
    staleTime: 5 * 60_000
  })

  // Hide the whole section on error OR when there's nothing to show (no broken/empty table).
  if (isError || (!isLoading && creators.length === 0)) return null

  return (
    <S.Creators>
      <S.Head>
        <S.Title>{t('weekTopCreators.title')}</S.Title>
      </S.Head>

      <S.Scroll>
        <S.Table>
          <thead>
            <tr>
              <S.Th data-rank scope="col">
                {t('weekTopCreators.rank')}
              </S.Th>
              <S.Th data-creator scope="col">
                {t('weekTopCreators.creator')}
              </S.Th>
              <S.Th data-center scope="col">
                {t('weekTopCreators.collections')}
              </S.Th>
              <S.Th data-center scope="col">
                {t('weekTopCreators.sales')}
              </S.Th>
              <S.Th data-amount scope="col">
                {t('weekTopCreators.volume')}
              </S.Th>
            </tr>
          </thead>
          <tbody>
            {isLoading
              ? Array.from({ length: ROWS }).map((_, i) => <SkeletonRow key={i} />)
              : creators.map((c, i) => (
                  <CreatorRow key={c.id} rank={i + 1} creator={c} thumbnails={thumbnails?.[c.id.toLowerCase()] ?? []} />
                ))}
          </tbody>
        </S.Table>
      </S.Scroll>
    </S.Creators>
  )
}
