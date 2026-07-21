import { ethers } from 'ethers'
import { useQuery } from '@tanstack/react-query'
import { t } from '~/intl/i18n'
import { fetchTopCreators, type CreatorRank } from '~/lib/rankings'
import * as S from './WeekTopCreators.styles'

// "Week Top Creators" table (Figma node 913-135614). Real data from marketplace-server
// /v1/rankings/creators/week (see lib/rankings.ts). We render the columns we have a data source for —
// Rank · Creator · Collections · Sales · Volume — and drop the Figma's collection-name+thumbnail and
// "prize" columns (no source; expected). Volume = the creator's `earned` MANA (wei → whole MANA).
//
// States: skeleton rows while loading; on error OR empty result the whole section renders nothing (no
// broken/empty table). The Figma has a period/category dropdown — v1 ships a static "This Week" label.

const ROWS = 10

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

function CreatorRow({ rank, creator }: { rank: number; creator: CreatorRank }) {
  return (
    <S.Row>
      <S.RankCell>
        <S.Rank>{rank}</S.Rank>
      </S.RankCell>
      <S.CreatorCell>
        <S.Creator address={creator.id} linkToProfile />
      </S.CreatorCell>
      <S.Num>{creator.collections.toLocaleString('en-US')}</S.Num>
      <S.Num>{creator.sales.toLocaleString('en-US')}</S.Num>
      <S.Num data-volume>
        <S.Coin />
        {formatManaVolume(creator.earned)}
      </S.Num>
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
      <S.Num>
        <S.Skeleton />
      </S.Num>
      <S.Num>
        <S.Skeleton />
      </S.Num>
      <S.Num>
        <S.Skeleton />
      </S.Num>
    </S.Row>
  )
}

export function WeekTopCreators() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['rankings', 'creators', 'week'],
    queryFn: () => fetchTopCreators('week', ROWS)
  })

  const creators = data ?? []
  // Hide the whole section on error OR when there's nothing to show (no broken/empty table).
  if (isError || (!isLoading && creators.length === 0)) return null

  return (
    <S.Creators>
      <S.Head>
        <S.Title>{t('weekTopCreators.title')}</S.Title>
        <S.Period>{t('weekTopCreators.thisWeek')}</S.Period>
      </S.Head>

      <S.Scroll>
        <S.Table>
          <thead>
            <tr>
              <S.Th data-rank scope="col">
                {t('weekTopCreators.rank')}
              </S.Th>
              <S.Th scope="col">{t('weekTopCreators.creator')}</S.Th>
              <S.Th data-num scope="col">
                {t('weekTopCreators.collections')}
              </S.Th>
              <S.Th data-num scope="col">
                {t('weekTopCreators.sales')}
              </S.Th>
              <S.Th data-num scope="col">
                {t('weekTopCreators.volume')}
              </S.Th>
            </tr>
          </thead>
          <tbody>
            {isLoading
              ? Array.from({ length: ROWS }).map((_, i) => <SkeletonRow key={i} />)
              : creators.map((c, i) => <CreatorRow key={c.id} rank={i + 1} creator={c} />)}
          </tbody>
        </S.Table>
      </S.Scroll>
    </S.Creators>
  )
}
