import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useWallet } from '~/store/wallet'
import { fetchImportable, type ImportItem } from '~/lib/import'
import { toast } from '~/store/toast'
import { MigrateModal, type MigrateEntry } from '~/components/MigrateModal'
import { CURRENCY, creditsToUsd } from '~/lib/currency'
import { CurrencyIcon } from '~/components/CurrencyIcon'
import { useSeo } from '~/hooks/useSeo'
import { useSecondarySales } from '~/hooks/useSecondarySales'
import { t } from '~/intl/i18n'
import * as S from './ImportListings.styles'
import { theme } from '~/styles/theme'

// `owned` is the SECONDARY half: re-listing a token you hold. It is only offered when the Shop offers
// secondary sales at all — otherwise this page would be a back door into the flow the Sell action hides,
// and it would sign exactly the resale listings we stopped creating everywhere else.
const SECTIONS = [
  {
    key: 'creations' as const,
    title: 'importListings.creations.title',
    sub: 'importListings.creations.sub'
  },
  {
    key: 'owned' as const,
    title: 'importListings.owned.title',
    sub: 'importListings.owned.sub',
    secondary: true
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

  const secondarySales = useSecondarySales()
  const sections = useMemo(() => SECTIONS.filter(sec => !sec.secondary || secondarySales), [secondarySales])

  const [prices, setPrices] = useState<Record<string, number>>({})
  const [excluded, setExcluded] = useState<Set<string>>(new Set())
  const [queue, setQueue] = useState<MigrateEntry[] | null>(null)

  // Drives selection, pricing and the migrate queue. Excludes the secondary half when it is hidden, so
  // "migrate all" cannot pick up a resale the page never showed.
  const all = useMemo(
    () => [...(data?.creations ?? []), ...(secondarySales ? (data?.owned ?? []) : [])],
    [data, secondarySales]
  )

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
      <S.Empty>
        <S.EmptyIco aria-hidden>📦</S.EmptyIco>
        <S.EmptyTitle>{t('importListings.signInTitle')}</S.EmptyTitle>
        <p className="muted">{t('importListings.signInBody')}</p>
        <S.EmptyCta variant="purple" onClick={() => signIn()}>
          {t('storeSettings.signIn')}
        </S.EmptyCta>
      </S.Empty>
    )
  }

  if (!isLoading && all.length === 0) {
    return (
      <S.Empty>
        <S.EmptyIco aria-hidden>✨</S.EmptyIco>
        <S.EmptyTitle>{t('importListings.emptyTitle')}</S.EmptyTitle>
        <p className="muted">{t('importListings.emptyBody')}</p>
        <S.EmptyCta as={Link} to="/my-assets" variant="purple">
          {t('importListings.goToMyAssets')}
        </S.EmptyCta>
      </S.Empty>
    )
  }

  return (
    <S.Root>
      <S.Head>
        <S.Eyebrow>{t('importListings.eyebrow')}</S.Eyebrow>
        <S.Title>
          {t('importListings.titleLead')} <S.Grad>{t('importListings.titleAccent')}</S.Grad>
        </S.Title>
        <S.Lede>{t('importListings.lede', { currency: CURRENCY.name })}</S.Lede>
      </S.Head>

      <S.Ratebar>
        <CurrencyIcon className="ccy-mark" color={theme.colors.text} />{' '}
        {t('importListings.rate', { currency: CURRENCY.nameSingular })}
      </S.Ratebar>

      {isLoading ? (
        <S.List>
          {Array.from({ length: 4 }).map((_, i) => (
            <S.SkeletonRow key={i} />
          ))}
        </S.List>
      ) : (
        sections.map(sec => {
          const items = data?.[sec.key] ?? []
          if (items.length === 0) return null
          return (
            <S.Section key={sec.key}>
              <S.SectionHead>
                <S.SectionTitle>{t(sec.title)}</S.SectionTitle>
                <S.SectionSub>{t(sec.sub)}</S.SectionSub>
              </S.SectionHead>
              <S.List>
                {items.map(item => {
                  const credits = priceOf(item)
                  const edited = credits !== item.suggestedCredits
                  return (
                    <S.Row data-off={isSelected(item.oldTradeId) ? undefined : true} key={item.oldTradeId}>
                      <S.Check
                        type="checkbox"
                        checked={isSelected(item.oldTradeId)}
                        onChange={() => toggle(item.oldTradeId)}
                        aria-label={t('importListings.includeItem', { name: item.name })}
                      />
                      <S.Thumb>{item.thumbnail ? <img src={item.thumbnail} alt="" /> : null}</S.Thumb>
                      <S.Meta>
                        <S.Name title={item.name}>{item.name || t('importListings.itemFallback')}</S.Name>
                        <S.Chip>{item.rarity}</S.Chip>
                      </S.Meta>
                      <S.Price>
                        <S.PriceField>
                          <CurrencyIcon size={15} color={theme.colors.text} />
                          <S.PriceInput
                            data-testid="imp-price-input"
                            inputMode="numeric"
                            value={credits.toLocaleString()}
                            onChange={e => setPrice(item.oldTradeId, e.target.value)}
                            aria-label={t('importListings.priceAria', { currency: CURRENCY.name, name: item.name })}
                          />
                        </S.PriceField>
                        <S.PriceSub>
                          <span>${creditsToUsd(credits).toFixed(2)}</span>
                          {edited ? (
                            <S.PriceReset
                              onClick={() => setPrices(p => ({ ...p, [item.oldTradeId]: item.suggestedCredits }))}
                            >
                              {t('importListings.resetTo')} <CurrencyIcon className="ccy-mark" />
                              {item.suggestedCredits.toLocaleString()}
                            </S.PriceReset>
                          ) : null}
                        </S.PriceSub>
                      </S.Price>
                      <S.Action>
                        <S.ListBtn
                          size="sm"
                          disabled={!isSelected(item.oldTradeId)}
                          onClick={() => setQueue(buildQueue([item]))}
                        >
                          {t('importListings.list')}
                        </S.ListBtn>
                      </S.Action>
                    </S.Row>
                  )
                })}
              </S.List>
            </S.Section>
          )
        })
      )}

      <S.Dock>
        <S.DockInner>
          <div>
            <S.DockTotal>
              <CurrencyIcon className="ccy-mark" color={theme.colors.text} /> {total.toLocaleString()}
            </S.DockTotal>
            <S.DockSub>
              {t('importListings.selectedSummary', {
                count: selectedItems.length,
                usd: creditsToUsd(total).toFixed(2)
              })}
            </S.DockSub>
          </div>
          <S.DockSpacer />
          <S.DockCta
            variant="purple"
            disabled={selectedItems.length === 0}
            onClick={() => setQueue(buildQueue(selectedItems))}
          >
            {t('importListings.listAll', { count: selectedItems.length })}
          </S.DockCta>
        </S.DockInner>
      </S.Dock>

      {queue && session ? (
        <MigrateModal queue={queue} session={session} onClose={() => setQueue(null)} onDone={afterMigrate} />
      ) : null}
    </S.Root>
  )
}
