import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useWallet } from '~/store/wallet'
import { fetchImportable, type ImportItem } from '~/lib/import'
import { toast } from '~/store/toast'
import { MigrateModal, type MigrateEntry } from '~/components/MigrateModal'
import '~/styles/import.css'

const SECTIONS = [
  {
    key: 'creations' as const,
    title: 'Your creations',
    sub: 'Items you made. Put them on sale in the Shop.'
  },
  {
    key: 'owned' as const,
    title: 'Items you own',
    sub: "Things you've bought elsewhere — resell them in the Shop."
  }
]

export function ImportListings() {
  const { session, signIn, restore } = useWallet()
  const qc = useQueryClient()
  const address = session?.address

  useEffect(() => {
    void restore()
  }, [restore])

  const { data, isLoading } = useQuery({
    queryKey: ['importable', address],
    queryFn: () => fetchImportable(address as string),
    enabled: !!address
  })

  const [prices, setPrices] = useState<Record<string, number>>({})
  const [excluded, setExcluded] = useState<Set<string>>(new Set())
  const [queue, setQueue] = useState<MigrateEntry[] | null>(null)

  const all = useMemo(() => [...(data?.creations ?? []), ...(data?.owned ?? [])], [data])

  // Seed each price with the auto-converted suggestion (keep any edits the user already made).
  useEffect(() => {
    if (!all.length) return
    setPrices(prev => {
      const next = { ...prev }
      for (const i of all) if (next[i.oldTradeId] == null) next[i.oldTradeId] = i.suggestedCredits
      return next
    })
  }, [all])

  const isSelected = (id: string) => !excluded.has(id)
  const priceOf = (i: ImportItem) => prices[i.oldTradeId] ?? i.suggestedCredits

  const selectedItems = all.filter(i => isSelected(i.oldTradeId))
  const total = selectedItems.reduce((sum, i) => sum + priceOf(i), 0)

  function setPrice(id: string, raw: string) {
    const n = raw.replace(/[^\d]/g, '')
    setPrices(p => ({ ...p, [id]: n === '' ? 0 : parseInt(n, 10) }))
  }
  function toggle(id: string) {
    setExcluded(s => {
      const next = new Set(s)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }
  function buildQueue(items: ImportItem[]): MigrateEntry[] {
    return items.map(i => ({ item: i, priceCredits: Math.max(1, priceOf(i)) }))
  }

  function afterMigrate() {
    qc.invalidateQueries({ queryKey: ['importable'] })
    qc.invalidateQueries({ queryKey: ['listings'] })
    qc.invalidateQueries({ queryKey: ['my-assets'] })
    qc.invalidateQueries({ queryKey: ['collection-sale-state'] })
    toast.success('Your Shop is updated.')
  }

  // ---- states -------------------------------------------------------------
  if (!session) {
    return (
      <div className="imp-empty">
        <span className="imp-empty__ico" aria-hidden>📦</span>
        <h1 className="imp-empty__title">Import your listings</h1>
        <p className="muted">Sign in to bring the items you already sell into the Shop.</p>
        <button className="btn btn--purple" onClick={() => signIn()}>Sign in</button>
      </div>
    )
  }

  if (!isLoading && all.length === 0) {
    return (
      <div className="imp-empty">
        <span className="imp-empty__ico" aria-hidden>✨</span>
        <h1 className="imp-empty__title">You're all caught up</h1>
        <p className="muted">Everything you sell is already in the Shop — nothing to import.</p>
        <Link className="btn btn--purple" to="/my-assets">Go to My Assets</Link>
      </div>
    )
  }

  return (
    <div className="imp">
      <header className="imp__head">
        <span className="imp__eyebrow">Import to the Shop</span>
        <h1 className="imp__title">Bring your listings <span className="imp__grad">into the Shop</span></h1>
        <p className="imp__lede">
          These items are already for sale elsewhere. We suggested a price in credits for each —
          matched to today's rate and rounded up. Adjust anything, then list them.
        </p>
      </header>

      <div className="imp__ratebar"><span className="imp__diamond">◈</span> 1 credit = $0.10 · prices rounded up</div>

      {isLoading ? (
        <div className="imp__list">
          {Array.from({ length: 4 }).map((_, i) => <div className="imp-row imp-row--skeleton" key={i} />)}
        </div>
      ) : (
        SECTIONS.map(sec => {
          const items = data?.[sec.key] ?? []
          if (items.length === 0) return null
          return (
            <section className="imp__section" key={sec.key}>
              <div className="imp__section-head">
                <h2 className="imp__section-title">{sec.title}</h2>
                <span className="imp__section-sub">{sec.sub}</span>
              </div>
              <div className="imp__list">
                {items.map(item => {
                  const credits = priceOf(item)
                  const edited = credits !== item.suggestedCredits
                  return (
                    <article className={`imp-row${isSelected(item.oldTradeId) ? '' : ' is-off'}`} key={item.oldTradeId}>
                      <input
                        type="checkbox"
                        className="imp-check"
                        checked={isSelected(item.oldTradeId)}
                        onChange={() => toggle(item.oldTradeId)}
                        aria-label={`Include ${item.name}`}
                      />
                      <div className="imp-thumb">{item.thumbnail ? <img src={item.thumbnail} alt="" /> : null}</div>
                      <div className="imp-meta">
                        <div className="imp-name" title={item.name}>{item.name || 'Item'}</div>
                        <span className="imp-chip">{item.rarity}</span>
                      </div>
                      <div className="imp-price">
                        <div className="imp-price__field">
                          <span className="imp-price__diamond" aria-hidden>◈</span>
                          <input
                            className="imp-price__input"
                            inputMode="numeric"
                            value={credits.toLocaleString()}
                            onChange={e => setPrice(item.oldTradeId, e.target.value)}
                            aria-label={`Price in credits for ${item.name}`}
                          />
                        </div>
                        <div className="imp-price__sub">
                          <span>${(credits * 0.1).toFixed(2)}</span>
                          {edited ? (
                            <button
                              className="imp-price__reset"
                              onClick={() => setPrices(p => ({ ...p, [item.oldTradeId]: item.suggestedCredits }))}
                            >
                              Reset to ◈{item.suggestedCredits.toLocaleString()}
                            </button>
                          ) : null}
                        </div>
                      </div>
                      <div className="imp-action">
                        <button
                          className="btn btn--sm imp-row__list"
                          disabled={!isSelected(item.oldTradeId)}
                          onClick={() => setQueue(buildQueue([item]))}
                        >
                          List
                        </button>
                      </div>
                    </article>
                  )
                })}
              </div>
            </section>
          )
        })
      )}

      <div className="imp-dock">
        <div className="imp-dock__inner">
          <div className="imp-dock__summary">
            <div className="imp-dock__total"><span className="imp__diamond">◈</span> {total.toLocaleString()}</div>
            <div className="imp-dock__sub">
              {selectedItems.length} item{selectedItems.length === 1 ? '' : 's'} selected · ${(total * 0.1).toFixed(2)}
            </div>
          </div>
          <span className="imp-dock__spacer" />
          <button
            className="btn btn--purple imp-dock__cta"
            disabled={selectedItems.length === 0}
            onClick={() => setQueue(buildQueue(selectedItems))}
          >
            List all ({selectedItems.length})
          </button>
        </div>
      </div>

      {queue && session ? (
        <MigrateModal queue={queue} session={session} onClose={() => setQueue(null)} onDone={afterMigrate} />
      ) : null}
    </div>
  )
}
