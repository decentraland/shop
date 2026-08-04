import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useWallet } from '~/store/wallet'
import { fetchImportable, type ImportItem } from '~/lib/import'
import { toast } from '~/store/toast'
import { MigrateModal, type MigrateEntry } from '~/components/MigrateModal'
import { CURRENCY, creditsToUsd } from '~/lib/currency'
import { CreditRate } from '~/components/CreditRate'
import { CreditMarkIcon } from '~/components/Icons/CreditMarkIcon'
import { CurrencyIcon } from '~/components/CurrencyIcon'
import { Icon } from '~/components/Icon'
import { categoryIcon } from '~/lib/itemIcons'
import { rarityInk, rarityTint } from '~/lib/rarity'
import { formatMana } from '~/lib/mana-format'
import { capitalizeFirst } from '~/lib/text'
import { useSeo } from '~/hooks/useSeo'
import { useSecondarySales } from '~/hooks/useSecondarySales'
import * as F from '~/styles/field.styles'
import { t } from '~/intl/i18n'
import * as S from './ImportListings.styles'

const LEARN_MORE_URL = 'https://docs.decentraland.org'

// The old price is shown for reference only, so a malformed amount from the server drops the line
// rather than taking the page down with a BigInt throw.
function manaLabel(wei: string): string | null {
  try {
    return formatMana(BigInt(wei))
  } catch {
    return null
  }
}

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

  const [prices, setPrices] = useState<Record<string, number>>({})
  const [excluded, setExcluded] = useState<Set<string>>(new Set())
  const [queue, setQueue] = useState<MigrateEntry[] | null>(null)

  // The secondary half is dropped while resales are off, so "list all" can never pick up a resale the
  // page never showed.
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
  const allSelected = all.length > 0 && selectedItems.length === all.length
  const partiallySelected = selectedItems.length > 0 && !allSelected

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
  function toggleAll() {
    setExcluded(allSelected ? new Set(all.map(i => i.oldTradeId)) : new Set())
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
        <S.EmptyCta as={Link} to="/my-items" variant="purple">
          {t('importListings.goToMyAssets')}
        </S.EmptyCta>
      </S.Empty>
    )
  }

  return (
    <S.Root>
      <S.Head>
        <S.Intro>
          <S.Title>{t('importListings.title')}</S.Title>
          <div>
            {/* The design treats the currency as a proper noun mid-sentence, hence the capitalization. */}
            <S.Lede>{t('importListings.lede', { currency: capitalizeFirst(CURRENCY.name) })}</S.Lede>
            <S.LearnMore href={LEARN_MORE_URL} target="_blank" rel="noopener noreferrer">
              {t('importListings.learnMore')}
              <Icon name="external-link" className="ico" aria-hidden />
            </S.LearnMore>
          </div>
        </S.Intro>
        <CreditRate />
      </S.Head>

      <S.Divider />

      <S.Body>
        <S.Progress data-testid="import-progress">
          <S.Count data-testid="import-count">{all.length}</S.Count>
          {t('importListings.updatePricing')}
        </S.Progress>

        <S.ListBlock>
          <S.SelectAll>
            <S.CheckSlot>
              <F.Checkbox
                type="checkbox"
                checked={allSelected}
                // Mirrored onto the DOM property as well as the attribute, so assistive tech reports
                // a partial selection as "mixed" instead of plainly unchecked.
                ref={el => {
                  if (el) el.indeterminate = partiallySelected
                }}
                data-indeterminate={partiallySelected}
                onChange={toggleAll}
                data-testid="import-select-all"
              />
            </S.CheckSlot>
            {t('importListings.selectAll')}
          </S.SelectAll>

          <S.List>
            {isLoading
              ? Array.from({ length: 4 }).map((_, i) => <S.SkeletonRow key={i} />)
              : all.map(item => {
                  const credits = priceOf(item)
                  const catIco = categoryIcon({ ...item, wearableCategory: item.wearableCategory ?? undefined })
                  const mana = manaLabel(item.manaWei)
                  return (
                    <S.Row data-off={isSelected(item.oldTradeId) ? undefined : true} key={item.oldTradeId}>
                      <S.Lead>
                        <S.CheckSlot>
                          <F.Checkbox
                            type="checkbox"
                            checked={isSelected(item.oldTradeId)}
                            onChange={() => toggle(item.oldTradeId)}
                            aria-label={t('importListings.includeItem', { name: item.name })}
                          />
                        </S.CheckSlot>
                        <S.Thumb>{item.thumbnail ? <img src={item.thumbnail} alt="" /> : null}</S.Thumb>
                      </S.Lead>

                      <S.Info>
                        <S.Name title={item.name}>{item.name || t('importListings.itemFallback')}</S.Name>
                        <S.Chips>
                          <S.Chip
                            data-variant="rarity"
                            style={{ background: rarityTint(item.rarity), color: rarityInk(item.rarity) }}
                          >
                            {item.rarity}
                          </S.Chip>
                          {catIco ? (
                            <S.Chip data-variant="icon">
                              <Icon name={catIco} aria-hidden />
                            </S.Chip>
                          ) : null}
                        </S.Chips>
                      </S.Info>

                      <S.Price>
                        <S.PriceField>
                          {/* Sized and coloured by PriceField's own `.ico` rule. */}
                          <CurrencyIcon />
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
                          {mana ? <S.PriceWas>{t('importListings.wasMana', { amount: mana })}</S.PriceWas> : null}
                        </S.PriceSub>
                      </S.Price>
                    </S.Row>
                  )
                })}
          </S.List>
        </S.ListBlock>
      </S.Body>

      <S.Dock>
        <S.DockInner>
          <div>
            <S.DockTotal>
              <CreditMarkIcon /> {total.toLocaleString()}
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
