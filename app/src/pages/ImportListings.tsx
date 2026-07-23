import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useWallet } from '~/store/wallet'
import { fetchImportable, type ImportItem } from '~/lib/import'
import { toast } from '~/store/toast'
import { MigrateModal, type MigrateEntry } from '~/components/MigrateModal'
import { CURRENCY } from '~/lib/currency'
import { CurrencyIcon } from '~/components/CurrencyIcon'
import { Button } from '~/components/Button'
import styled from '@emotion/styled'
import { useSeo } from '~/hooks/useSeo'
import { t } from '~/intl/i18n'
import '~/styles/import.css'

// The empty-state CTA sits below the copy (was `.imp-empty .btn { margin-top: 10px }`).
const ImpEmptyCta = styled(Button)`
  margin-top: 10px;
`

// The dock's "List all" CTA is a touch roomier than the base button.
const DockCta = styled(Button)`
  padding: 13px 24px;
`

const SECTIONS = [
  {
    key: 'creations' as const,
    title: 'importListings.creations.title',
    sub: 'importListings.creations.sub'
  },
  {
    key: 'owned' as const,
    title: 'importListings.owned.title',
    sub: 'importListings.owned.sub'
  }
]

export function ImportListings() {
  useSeo({ title: t('seo.import.title'), noindex: true })
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
    // Fire-and-forget cache invalidations — the refetch happens in the background, nothing here awaits it.
    void qc.invalidateQueries({ queryKey: ['importable'] })
    // The browse grids are keyed on 'shop-items'/'catalog-items' (see Assets.tsx) and the homepage on
    // 'overview-listings' (cart cross-sell on 'upsell-listings'); refresh them so freshly imported
    // listings show up without waiting for their staleTime to lapse or a hard reload.
    void qc.invalidateQueries({ queryKey: ['shop-items'] })
    void qc.invalidateQueries({ queryKey: ['catalog-items'] })
    void qc.invalidateQueries({ queryKey: ['overview-listings'] })
    void qc.invalidateQueries({ queryKey: ['upsell-listings'] })
    void qc.invalidateQueries({ queryKey: ['my-assets'] })
    void qc.invalidateQueries({ queryKey: ['collection-sale-state'] })
    toast.success(t('importListings.toastUpdated'))
  }

  // ---- states -------------------------------------------------------------
  if (!session) {
    return (
      <div className="imp-empty">
        <span className="imp-empty__ico" aria-hidden>
          📦
        </span>
        <h1 className="imp-empty__title">{t('importListings.signInTitle')}</h1>
        <p className="muted">{t('importListings.signInBody')}</p>
        <ImpEmptyCta variant="purple" onClick={() => signIn()}>
          {t('storeSettings.signIn')}
        </ImpEmptyCta>
      </div>
    )
  }

  if (!isLoading && all.length === 0) {
    return (
      <div className="imp-empty">
        <span className="imp-empty__ico" aria-hidden>
          ✨
        </span>
        <h1 className="imp-empty__title">{t('importListings.emptyTitle')}</h1>
        <p className="muted">{t('importListings.emptyBody')}</p>
        <ImpEmptyCta as={Link} to="/my-assets" variant="purple">
          {t('importListings.goToMyAssets')}
        </ImpEmptyCta>
      </div>
    )
  }

  return (
    <div className="imp">
      <header className="imp__head">
        <span className="imp__eyebrow">{t('importListings.eyebrow')}</span>
        <h1 className="imp__title">
          {t('importListings.titleLead')} <span className="imp__grad">{t('importListings.titleAccent')}</span>
        </h1>
        <p className="imp__lede">{t('importListings.lede', { currency: CURRENCY.name })}</p>
      </header>

      <div className="imp__ratebar">
        <CurrencyIcon className="ccy-mark imp__diamond" />{' '}
        {t('importListings.rate', { currency: CURRENCY.nameSingular })}
      </div>

      {isLoading ? (
        <div className="imp__list">
          {Array.from({ length: 4 }).map((_, i) => (
            <div className="imp-row imp-row--skeleton" key={i} />
          ))}
        </div>
      ) : (
        SECTIONS.map(sec => {
          const items = data?.[sec.key] ?? []
          if (items.length === 0) return null
          return (
            <section className="imp__section" key={sec.key}>
              <div className="imp__section-head">
                <h2 className="imp__section-title">{t(sec.title)}</h2>
                <span className="imp__section-sub">{t(sec.sub)}</span>
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
                        aria-label={t('importListings.includeItem', { name: item.name })}
                      />
                      <div className="imp-thumb">{item.thumbnail ? <img src={item.thumbnail} alt="" /> : null}</div>
                      <div className="imp-meta">
                        <div className="imp-name" title={item.name}>
                          {item.name || t('importListings.itemFallback')}
                        </div>
                        <span className="imp-chip">{item.rarity}</span>
                      </div>
                      <div className="imp-price">
                        <div className="imp-price__field">
                          <CurrencyIcon className="ccy-mark imp-price__diamond" />
                          <input
                            className="imp-price__input"
                            data-testid="imp-price-input"
                            inputMode="numeric"
                            value={credits.toLocaleString()}
                            onChange={e => setPrice(item.oldTradeId, e.target.value)}
                            aria-label={t('importListings.priceAria', { currency: CURRENCY.name, name: item.name })}
                          />
                        </div>
                        <div className="imp-price__sub">
                          <span>${(credits * 0.1).toFixed(2)}</span>
                          {edited ? (
                            <button
                              className="imp-price__reset"
                              onClick={() => setPrices(p => ({ ...p, [item.oldTradeId]: item.suggestedCredits }))}
                            >
                              {t('importListings.resetTo')} <CurrencyIcon className="ccy-mark" />
                              {item.suggestedCredits.toLocaleString()}
                            </button>
                          ) : null}
                        </div>
                      </div>
                      <div className="imp-action">
                        <Button
                          size="sm"
                          className="imp-row__list"
                          disabled={!isSelected(item.oldTradeId)}
                          onClick={() => setQueue(buildQueue([item]))}
                        >
                          {t('importListings.list')}
                        </Button>
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
            <div className="imp-dock__total">
              <CurrencyIcon className="ccy-mark imp__diamond" /> {total.toLocaleString()}
            </div>
            <div className="imp-dock__sub">
              {t('importListings.selectedSummary', {
                count: selectedItems.length,
                usd: (total * 0.1).toFixed(2)
              })}
            </div>
          </div>
          <span className="imp-dock__spacer" />
          <DockCta
            variant="purple"
            disabled={selectedItems.length === 0}
            onClick={() => setQueue(buildQueue(selectedItems))}
          >
            {t('importListings.listAll', { count: selectedItems.length })}
          </DockCta>
        </div>
      </div>

      {queue && session ? (
        <MigrateModal queue={queue} session={session} onClose={() => setQueue(null)} onDone={afterMigrate} />
      ) : null}
    </div>
  )
}
