import { ethers } from 'ethers'
import { useQuery } from '@tanstack/react-query'
import { CreatorBadge } from '~/components/CreatorBadge'
import { CurrencyIcon } from '~/components/CurrencyIcon'
import { fetchTopCreators, type CreatorRank } from '~/lib/rankings'

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
    <tr className="ov-creators__row">
      <td className="ov-creators__rank-cell">
        <span className="ov-creators__rank">{rank}</span>
      </td>
      <td className="ov-creators__creator-cell">
        <CreatorBadge address={creator.id} className="ov-creators__creator" linkToProfile />
      </td>
      <td className="ov-creators__num">{creator.collections.toLocaleString('en-US')}</td>
      <td className="ov-creators__num">{creator.sales.toLocaleString('en-US')}</td>
      <td className="ov-creators__num ov-creators__volume">
        <CurrencyIcon className="ov-creators__coin" />
        {formatManaVolume(creator.earned)}
      </td>
    </tr>
  )
}

function SkeletonRow() {
  return (
    <tr className="ov-creators__row">
      <td className="ov-creators__rank-cell">
        <span className="ov-creators__rank ov-creators__rank--skeleton" />
      </td>
      <td className="ov-creators__creator-cell">
        <span className="ov-creators__skeleton ov-creators__skeleton--creator" />
      </td>
      <td className="ov-creators__num">
        <span className="ov-creators__skeleton" />
      </td>
      <td className="ov-creators__num">
        <span className="ov-creators__skeleton" />
      </td>
      <td className="ov-creators__num">
        <span className="ov-creators__skeleton" />
      </td>
    </tr>
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
    <section className="ov-creators">
      <div className="ov-creators__head">
        <h2 className="ov-creators__title">Week Top Creators</h2>
        <span className="ov-creators__period">This Week</span>
      </div>

      <div className="ov-creators__scroll">
        <table className="ov-creators__table">
          <thead>
            <tr className="ov-creators__header">
              <th className="ov-creators__th ov-creators__th--rank" scope="col">
                Rank
              </th>
              <th className="ov-creators__th" scope="col">
                Creator
              </th>
              <th className="ov-creators__th ov-creators__th--num" scope="col">
                Collections
              </th>
              <th className="ov-creators__th ov-creators__th--num" scope="col">
                Sales
              </th>
              <th className="ov-creators__th ov-creators__th--num" scope="col">
                Volume
              </th>
            </tr>
          </thead>
          <tbody>
            {isLoading
              ? Array.from({ length: ROWS }).map((_, i) => <SkeletonRow key={i} />)
              : creators.map((c, i) => <CreatorRow key={c.id} rank={i + 1} creator={c} />)}
          </tbody>
        </table>
      </div>
    </section>
  )
}
