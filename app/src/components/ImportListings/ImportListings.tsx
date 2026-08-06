import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { useWallet } from '~/store/wallet'
import { type ImportItem } from '~/lib/import'
import { toast } from '~/store/toast'
import { MigrateModal, type MigrateEntry, type MigrateResult } from '~/components/MigrateModal'
import { CURRENCY, creditsToUsd } from '~/lib/currency'
import { CreditRate } from '~/components/CreditRate'
import { CurrencyIcon } from '~/components/CurrencyIcon'
import { Faq, type FaqEntry } from '~/components/Faq'
import { Icon } from '~/components/Icon'
import { categoryIcon } from '~/lib/itemIcons'
import { rarityInk, rarityTint } from '~/lib/rarity'
import { formatMana } from '~/lib/mana-format'
import { capitalizeFirst } from '~/lib/text'
import { useImportable } from '~/hooks/useImportable'
import * as F from '~/styles/field.styles'
import { t } from '~/intl/i18n'
import { rarityLabel } from '~/lib/rarity'
import { MY_CREATIONS } from '~/lib/routes'
import doneRing from '~/assets/done-ring.svg'
import * as S from './ImportListings.styles'

// The server builds this feed from a materialized view on a ~30s debounce, so the answer straight after a
// signature is the one from before it. Rather than hard-code that interval — it lives in another repo, and
// nothing here would notice it moving — re-ask on a widening ladder and stop as soon as the server agrees.
// The last rung is a ceiling, not the plan: if the server still calls the rows importable by then, it wins.
const RECONCILE_MS = [5_000, 15_000, 35_000]

type ImportableFeed = { creations: ImportItem[]; owned: ImportItem[] }

// Keys, not copy — the strings live in the locale files. MANA is named here on purpose:
// this is the creator-facing migration tool, whose surrounding copy already prices in MANA, and the
// web2-first ban in CONVENTIONS.md is about the shopper-facing Shop. The buyers' FAQ never mentions it.
const SELLER_FAQ: readonly FaqEntry[] = [
  { question: 'faq.sellers.whatAreQ', answer: 'faq.sellers.whatAreA' },
  { question: 'faq.sellers.whyCreditsQ', answer: 'faq.sellers.whyCreditsA' },
  { question: 'faq.sellers.receiveCreditsQ', answer: 'faq.sellers.receiveCreditsA' },
  { question: 'faq.sellers.changePriceQ', answer: 'faq.sellers.changePriceA' },
  { question: 'faq.sellers.mustSwitchQ', answer: 'faq.sellers.mustSwitchA' },
  { question: 'faq.sellers.suggestedPriceQ', answer: 'faq.sellers.suggestedPriceA' }
]

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
  const { session } = useWallet()
  const qc = useQueryClient()

  const { items: all, isLoading } = useImportable()

  const [prices, setPrices] = useState<Record<string, number>>({})
  const [excluded, setExcluded] = useState<Set<string>>(new Set())
  const [queue, setQueue] = useState<MigrateEntry[] | null>(null)
  // The reconcile ladder outlives a render but must not outlive the component: `alive` stops a refetch
  // that resolves after unmount from booking another rung the cleanup can no longer reach.
  //
  // `migrated` ACCUMULATES across runs. A seller who leaves some rows unticked can migrate the rest
  // moments later, and that second run restarts the ladder — so if it only carried its own ids, its first
  // refetch would write the earlier run's rows back with nothing left to prune them out again.
  const reconcileRef = useRef<{
    timer: ReturnType<typeof setTimeout> | null
    alive: boolean
    migrated: Set<string>
  }>({
    timer: null,
    alive: true,
    migrated: new Set()
  })
  useEffect(() => {
    const state = reconcileRef.current
    state.alive = true
    return () => {
      state.alive = false
      if (state.timer) clearTimeout(state.timer)
    }
  }, [])

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

  /** Take the given rows out of every cached copy of the importable feed. */
  function pruneImportable(migrated: Set<string>) {
    const keep = (rows: ImportItem[] = []) => rows.filter(r => !migrated.has(r.oldTradeId))
    qc.setQueriesData<ImportableFeed>({ queryKey: ['importable'] }, prev =>
      prev ? { creations: keep(prev.creations), owned: keep(prev.owned) } : prev
    )
  }

  function stillImportable(migrated: Set<string>) {
    return qc
      .getQueriesData<ImportableFeed>({ queryKey: ['importable'] })
      .flatMap(([, feed]) => [...(feed?.creations ?? []), ...(feed?.owned ?? [])])
      .some(r => migrated.has(r.oldTradeId))
  }

  /**
   * Ask the server again, one rung at a time, until it stops listing the rows we just migrated.
   *
   * Re-pruning after each refetch is the load-bearing part: a refetch that lands while the view is still
   * stale writes the migrated rows straight back into the cache, so without this the first rung would
   * flash them into the tool — the very bug being fixed — until the next one cleared them again.
   */
  function reconcile(step: number) {
    const state = reconcileRef.current
    if (state.timer) clearTimeout(state.timer)
    state.timer = setTimeout(
      () => {
        void qc.refetchQueries({ queryKey: ['importable'] }).then(() => {
          if (!state.alive) return
          // Either the server has caught up or we are out of rungs; either way its answer now stands, and
          // holding on to the ids would prune a row the seller legitimately re-lists on the old pricing.
          if (!stillImportable(state.migrated) || step + 1 >= RECONCILE_MS.length) {
            state.migrated.clear()
            return
          }
          pruneImportable(state.migrated)
          reconcile(step + 1)
        })
      },
      RECONCILE_MS[step] - (RECONCILE_MS[step - 1] ?? 0)
    )
  }

  function afterMigrate(result: MigrateResult) {
    /**
     * Drop the migrated rows from the cache HERE, rather than refetching for them.
     *
     * The listings feed is served from a materialized view the server refreshes on a 30s debounce, so for
     * up to half a minute after signing it still reports the old listing as importable. Invalidating right
     * away therefore repopulated the very rows that had just been migrated, and the tool stayed on the
     * list instead of moving to "all set" — then held that wrong answer for the query's 5-minute staleTime.
     *
     * Only a run in which EVERY queued item listed may prune. A failure leaves the item importable, and
     * so does a decline — `cancelled` is the seller saying no, not an error — and the run reports counts,
     * not which row was which, so a partial run gives us no way to tell the pruned from the survivors.
     * Those fall through to the plain invalidate below, which is the honest answer: still importable.
     */
    if (result.failed === 0 && result.cancelled === 0 && result.listed > 0 && queue?.length) {
      const { migrated } = reconcileRef.current
      for (const entry of queue) migrated.add(entry.item.oldTradeId)
      pruneImportable(migrated)
      // …then reconcile, so the cache is not left holding a guess indefinitely.
      reconcile(0)
    } else {
      void qc.invalidateQueries({ queryKey: ['importable'] })
    }
    // The browse grids are keyed on 'shop-items'/'catalog-items' (see Assets.tsx) and the homepage on
    // 'overview-listings' (cart cross-sell on 'upsell-listings'); refresh them so freshly imported
    // listings show up without waiting for their staleTime to lapse or a hard reload.
    void qc.invalidateQueries({ queryKey: ['shop-items'] })
    void qc.invalidateQueries({ queryKey: ['catalog-items'] })
    void qc.invalidateQueries({ queryKey: ['overview-listings'] })
    void qc.invalidateQueries({ queryKey: ['upsell-listings'] })
    void qc.invalidateQueries({ queryKey: ['my-assets'] })
    void qc.invalidateQueries({ queryKey: ['collection-sale-state'] })

    // Only a clean run is announced as one. A run with failures in it gets the error toast whether or
    // not some items made it, and a run the seller simply declined says nothing at all.
    if (result.failed > 0) {
      toast.error(t(result.listed > 0 ? 'importListings.toastPartial' : 'importListings.toastFailed'))
    } else if (result.listed > 0) {
      toast.success(t('importListings.toastUpdated'))
    }
  }

  // Nothing to migrate — either the creator has no classic listings or they have already moved them all.
  //
  // The FAQ still renders. It answers "what are Credits", "how does pricing work", "when do I get paid" —
  // questions a creator with nothing left to migrate has just as much reason to ask, and this page is the
  // link we hand them to read the answers. The early return used to stop at the empty card, so reaching
  // "all set" silently took the explanation away at the exact moment it became shareable.
  if (!isLoading && all.length === 0) {
    return (
      <S.Root>
        <S.Empty data-testid="import-empty">
          <S.EmptyCard>
            <S.EmptyIco aria-hidden>
              <img src={doneRing} alt="" width={85} height={85} />
            </S.EmptyIco>
            <S.EmptyText>
              <S.EmptyTitle>{t('importListings.emptyTitle')}</S.EmptyTitle>
              <S.EmptyBody>{t('importListings.emptyBody')}</S.EmptyBody>
            </S.EmptyText>
            <S.EmptyActions>
              <S.EmptyCta as={Link} to={MY_CREATIONS} variant="purple">
                {t('importListings.goToMyAssets')}
              </S.EmptyCta>
            </S.EmptyActions>
          </S.EmptyCard>
        </S.Empty>

        {/* The same outlined dark skin as the tool's own FAQ — the page under it is the violet field in
            both states, so the light skin's black-on-translucent rows have nothing to sit on. */}
        <S.FaqBlock>
          <Faq title="faq.title" entries={SELLER_FAQ} tone="on-dark" />
        </S.FaqBlock>
      </S.Root>
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
        <CreditRate tone="on-dark" />
      </S.Head>

      <S.Divider />

      <S.Body>
        <S.Progress data-testid="import-progress">
          <S.Count data-testid="import-count">{all.length}</S.Count>
          {t('importListings.updatePricing')}
        </S.Progress>

        <S.ListBlock>
          <S.SelectAll>
            <S.CheckSlot data-tone="on-dark">
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
                // The visible "Select All" says nothing about WHAT, which is all a screen reader gets
                // out of context. The spelled-out name still contains the visible label (WCAG 2.5.3).
                aria-label={t('importListings.selectAllAria')}
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
                            data-testid="import-row-check"
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
                            {rarityLabel(item.rarity)}
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

      <S.Divider />

      <S.FaqBlock>
        <Faq title="faq.title" entries={SELLER_FAQ} tone="on-dark" />
      </S.FaqBlock>

      <S.Dock>
        <S.DockInner>
          <S.DockInfo>
            <S.DockTotal>
              {/* The outlined mark, in the bar's own ink — the filled gradient one belongs to the peg
                  line up top, where the currency is being explained rather than counted. */}
              <CurrencyIcon /> {total.toLocaleString()}
            </S.DockTotal>
            <S.DockSub>
              {t('importListings.selectedSummary', {
                count: selectedItems.length,
                usd: creditsToUsd(total).toFixed(2)
              })}
            </S.DockSub>
          </S.DockInfo>
          <S.DockSpacer />
          <S.DockCta
            variant="red"
            data-testid="import-list-all"
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
