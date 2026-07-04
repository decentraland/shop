import { useQuery } from '@tanstack/react-query'
import { fetchCreatorItems } from '~/lib/collections'
import { AssetCard } from '~/components/AssetCard'
import { useFollows } from '~/store/follows'
import type { CatalogItem } from '~/lib/api'

// Bound the fan-out so a visitor following many creators doesn't fire dozens of requests.
const MAX_CREATORS = 8
const PER_CREATOR = 8
const MAX_ITEMS = 12

// "From creators you follow" — a personalized discovery row on the overview. Renders nothing
// until the visitor follows at least one creator (and nothing if none of them have buyable
// items). Client-side: fans out fetchCreatorItems over the followed set and interleaves the
// results so the row isn't dominated by a single creator. No backend.
export function FollowedCreatorsRow() {
  const followed = useFollows(s => s.followed)
  const creators = followed.slice(0, MAX_CREATORS)

  const { data: items = [], isLoading } = useQuery({
    // Key on the follow set so the row refreshes when the visitor follows/unfollows.
    queryKey: ['followed-creators-row', creators.join(',')],
    enabled: creators.length > 0,
    queryFn: async () => {
      const lists = await Promise.all(
        creators.map(c =>
          fetchCreatorItems(c, { first: PER_CREATOR })
            .then(r => r.items)
            .catch(() => [] as CatalogItem[])
        )
      )
      return interleave(lists)
        .filter(i => i.priceCredits > 0) // buyable only
        .slice(0, MAX_ITEMS)
    }
  })

  if (creators.length === 0) return null
  if (!isLoading && items.length === 0) return null

  return (
    <section className="row">
      <div className="row__head">
        <h2 className="row__title">From creators you follow</h2>
      </div>
      <div className="row__track">
        {isLoading
          ? Array.from({ length: 6 }).map((_, i) => <div className="card card--skeleton" key={i} />)
          : items.map(item => <AssetCard key={item.id} item={item} />)}
      </div>
    </section>
  )
}

// Round-robin across each creator's items, deduped by id, so the row mixes creators evenly.
function interleave(lists: CatalogItem[][]): CatalogItem[] {
  const out: CatalogItem[] = []
  const seen = new Set<string>()
  const max = lists.reduce((n, l) => Math.max(n, l.length), 0)
  for (let i = 0; i < max; i++) {
    for (const list of lists) {
      const item = list[i]
      if (item && !seen.has(item.id)) {
        seen.add(item.id)
        out.push(item)
      }
    }
  }
  return out
}

export default FollowedCreatorsRow
