import { useEffect, useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Icon } from '~/components/Icon'
import { config } from '~/config'
import { useWallet } from '~/store/wallet'
import { fetchCollectionSaleState, fetchMyAssets, fetchTrade, type CatalogItem, type MyAsset } from '~/lib/api'
import { fetchImportable } from '~/lib/import'
import { fetchPublishableItems, type PublishableItem } from '~/lib/builder'
import { cancelListing } from '~/lib/buy'
import { captureError } from '~/lib/monitoring'
import { toast } from '~/store/toast'
import { Button } from '~/components/Button'
import { SellModal } from '~/components/SellModal'
import { PrimaryListModal } from '~/components/PrimaryListModal'
import { AssetCard } from '~/components/AssetCard'
import { SkeletonCards } from '~/components/SkeletonCards'
import { LoadMore } from '~/components/LoadMore'
import { FilterBar, RARITIES, type FilterChip } from '~/components/FilterBar'
import { CATEGORIES } from '~/components/CategoryFilter'
import { type FilterStatus } from '~/components/Filters'
import { useInfiniteGrid } from '~/hooks/useInfiniteGrid'
import { SUBCAT_MAP } from '~/lib/categories'
import { capitalizeFirst } from '~/lib/text'
import { track } from '~/lib/analytics'
import { useSeo } from '~/hooks/useSeo'
import { t } from '~/intl/i18n'
import { theme } from '~/styles/theme'
import { ErrorNotice } from '~/components/ErrorNotice'
import * as A from './Assets.styles'
import * as F from '~/components/Filters/Filters.styles'
import * as S from './MyAssets.styles'

const PAGE_SIZE = 48

// The four owned-asset sections in the sidebar. `category` is the /v1/nfts category for the owned
// sections (wearable/emote/ens); 'creations' has no NFT category — it reads the builder feed instead.
type SectionKey = 'wearables' | 'emotes' | 'names' | 'creations'
const SECTIONS: { key: SectionKey; labelKey: string; category?: string }[] = [
  { key: 'wearables', labelKey: 'myAssets.sectionWearables', category: 'wearable' },
  { key: 'emotes', labelKey: 'myAssets.sectionEmotes', category: 'emote' },
  { key: 'names', labelKey: 'myAssets.sectionNames', category: 'ens' },
  { key: 'creations', labelKey: 'myAssets.sectionCreations' }
]

// Sort menu shown in the toolbar. Server values are a subset of the NFT endpoint's NFTSortBy; the same
// keys drive the (client-side) creations sort.
const MY_SORTS: { key: string; label: string; server: 'newest' | 'name' | 'cheapest' }[] = [
  { key: 'newest', label: 'filterBar.sortNewest', server: 'newest' },
  { key: 'name', label: 'filterBar.sortName', server: 'name' },
  { key: 'cheapest', label: 'filterBar.sortCheapest', server: 'cheapest' }
]

// Rarity/Category filters only make sense for wearables & emotes (Names/Creations don't carry them).
function hasRarityAndCategory(section: SectionKey) {
  return section === 'wearables' || section === 'emotes'
}

// The sub-categories to offer for the active section (wearable vs. emote), pulled from the shared
// CategoryFilter definition so My Assets and Collectibles stay in lockstep.
function subsFor(section: SectionKey) {
  const key = section === 'emotes' ? 'emote' : 'wearable'
  return CATEGORIES.find(c => c.key === key)?.subs ?? []
}

// Owned NFT (secondary) → the CatalogItem shape AssetCard renders (carries tokenId so the card links to
// the item detail). `priceCredits` reflects the open listing when on sale (else 0 → "not for sale").
function assetToItem(a: MyAsset): CatalogItem {
  return {
    id: a.id,
    name: a.name,
    creator: '',
    contractAddress: a.contractAddress,
    itemId: a.itemId,
    category: a.category,
    rarity: a.rarity ?? 'common',
    network: a.network,
    chainId: a.chainId,
    thumbnail: a.image,
    priceCredits: a.listingPrice ?? 0,
    gender: null,
    isSmart: false,
    tokenId: a.tokenId
  }
}

// Created collection item (primary) → CatalogItem (itemId = on-chain blockchain item id). `price` is
// the listed credit price when the item is currently on sale.
function publishableToItem(p: PublishableItem, price = 0): CatalogItem {
  return {
    id: `${p.contractAddress}-${p.blockchainItemId}`,
    name: p.name,
    creator: '',
    contractAddress: p.contractAddress,
    itemId: p.blockchainItemId,
    category: p.category,
    rarity: p.rarity,
    network: 'MATIC',
    chainId: config.chainId,
    thumbnail: p.thumbnail,
    priceCredits: price,
    gender: null,
    isSmart: false
  }
}

export function MyAssets() {
  useSeo({ title: t('nav.myAssets'), noindex: true })
  const { session, error, signIn, restore } = useWallet()
  const qc = useQueryClient()

  const [section, setSection] = useState<SectionKey>('wearables')
  const [status, setStatus] = useState<FilterStatus>('all')
  const [rarities, setRarities] = useState<string[]>([])
  const [subCategory, setSubCategory] = useState<string | null>(null)
  const [sort, setSort] = useState('newest')
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('') // debounced
  const [filtersOpen, setFiltersOpen] = useState(false) // mobile sidebar drawer

  const [selling, setSelling] = useState<MyAsset | null>(null)
  const [publishing, setPublishing] = useState<PublishableItem | null>(null)
  const [cancelling, setCancelling] = useState<string | null>(null)
  const [cancelError, setCancelError] = useState<string | null>(null)

  useEffect(() => {
    void restore()
  }, [restore])

  // Debounce the search box so a query fires once the user pauses, not per keystroke.
  useEffect(() => {
    const id = setTimeout(() => setSearch(searchInput.trim()), 300)
    return () => clearTimeout(id)
  }, [searchInput])

  // Close the mobile filters drawer on Escape + lock body scroll while open (mirrors Assets).
  useEffect(() => {
    if (!filtersOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setFiltersOpen(false)
    }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [filtersOpen])

  const address = session?.address
  const active = SECTIONS.find(s => s.key === section)!
  const showRarityCat = hasRarityAndCategory(section)
  const serverSort = (MY_SORTS.find(s => s.key === sort) ?? MY_SORTS[0]).server

  // Reset the contextual filters when moving to a section that doesn't use them.
  function pickSection(next: SectionKey) {
    setSection(next)
    setSubCategory(null)
    if (!hasRarityAndCategory(next)) setRarities([])
    setFiltersOpen(false)
  }
  function toggleRarity(r: string) {
    setRarities(rs => (rs.includes(r) ? rs.filter(x => x !== r) : [...rs, r]))
  }

  // ---------------- Owned sections (wearables / emotes / names) ----------------
  const {
    items: ownedRaw,
    total: ownedTotal,
    isLoading: ownedLoading,
    isPlaceholderData,
    error: ownedError,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage
  } = useInfiniteGrid<MyAsset>(
    ['my-assets', address, section, status, rarities, subCategory, search, serverSort],
    skip =>
      fetchMyAssets(address as string, {
        category: active.category,
        first: PAGE_SIZE,
        skip,
        search: search || undefined,
        rarities: showRarityCat && rarities.length ? rarities : undefined,
        wearableCategories: section === 'wearables' && subCategory ? SUBCAT_MAP[subCategory] : undefined,
        emoteCategories: section === 'emotes' && subCategory ? SUBCAT_MAP[subCategory] : undefined,
        onlyOnSale: status === 'on_sale' || undefined,
        sortBy: serverSort
      }).then(r => ({ items: r.assets, total: r.total })),
    { enabled: !!address && section !== 'creations' }
  )

  // The endpoint has no "not for sale" flag, so that case is filtered here from each row's isOnSale.
  const ownedAssets = useMemo(
    () => (status === 'not_for_sale' ? ownedRaw.filter(a => !a.isOnSale) : ownedRaw),
    [ownedRaw, status]
  )

  // ---------------- Creations (builder feed) ----------------
  const {
    data: publishable,
    isLoading: publishableLoading,
    isError: publishableError
  } = useQuery({
    queryKey: ['publishable-items', address],
    queryFn: () => fetchPublishableItems(address as string, session!.identity),
    enabled: !!session && section === 'creations',
    retry: false
  })

  const contractAddresses = useMemo(() => [...new Set((publishable ?? []).map(p => p.contractAddress))], [publishable])
  const { data: saleState } = useQuery({
    queryKey: ['collection-sale-state', address, contractAddresses],
    enabled: contractAddresses.length > 0,
    queryFn: async () => {
      const maps = await Promise.all(
        contractAddresses.map(async ca => [ca, await fetchCollectionSaleState(ca)] as const)
      )
      const merged: Record<string, { isOnSale: boolean; priceCredits: number; tradeId: string }> = {}
      for (const [ca, m] of maps) {
        for (const [itemId, v] of Object.entries(m)) merged[`${ca}-${itemId}`] = v
      }
      return merged
    }
  })
  const saleFor = (item: PublishableItem) => saleState?.[`${item.contractAddress}-${item.blockchainItemId}`]

  // Creations filtered (status + search) + sorted client-side (the builder feed isn't paginated/queryable).
  const creations = useMemo(() => {
    let list = publishable ?? []
    if (status === 'on_sale') list = list.filter(p => saleFor(p)?.isOnSale)
    else if (status === 'not_for_sale') list = list.filter(p => !saleFor(p)?.isOnSale)
    if (search) {
      const q = search.toLowerCase()
      list = list.filter(p => p.name.toLowerCase().includes(q))
    }
    const sorted = [...list]
    if (sort === 'name') sorted.sort((a, b) => a.name.localeCompare(b.name))
    else if (sort === 'cheapest')
      sorted.sort((a, b) => (saleFor(a)?.priceCredits ?? 0) - (saleFor(b)?.priceCredits ?? 0))
    return sorted
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [publishable, saleState, status, search, sort])

  // Old (classic) listings the seller could import into the Shop → surfaces the import banner.
  const { data: importable } = useQuery({
    queryKey: ['importable', address],
    queryFn: () => fetchImportable(address as string),
    enabled: !!address
  })
  const importCount = (importable?.creations.length ?? 0) + (importable?.owned.length ?? 0)

  // Take a listing down (owned secondary OR created primary). Refreshes the affected grids on success.
  async function cancelByTrade(tradeId: string, name: string, key: string) {
    if (!session) return
    setCancelError(null)
    setCancelling(key)
    try {
      const trade = await fetchTrade(tradeId)
      await cancelListing({ trade, signer: session.signer })
      toast.success(t('myAssets.removedFromSale', { name }))
      await qc.invalidateQueries({ queryKey: ['my-assets', session.address] })
      await qc.invalidateQueries({ queryKey: ['collection-sale-state'] })
      await qc.invalidateQueries({ queryKey: ['publishable-items'] })
    } catch (e) {
      const err = e as { code?: number; message?: string }
      const msg = (err.message ?? '').toLowerCase()
      const rejected = err.code === 4001 || msg.includes('reject') || msg.includes('denied')
      if (!rejected) captureError(e, { flow: 'remove-listing', tradeId })
      setCancelError(rejected ? t('getCredits.errorCanceled') : t('myAssets.removeListingError'))
    } finally {
      setCancelling(null)
    }
  }

  // ---------------- Sign-in gate ----------------
  if (!session) {
    return (
      <S.Gate>
        <S.GateTitle>{t('nav.myAssets')}</S.GateTitle>
        <S.GateText>{t('myAssets.signInPrompt')}</S.GateText>
        <Button variant="purple" onClick={() => signIn()}>
          {t('storeSettings.signIn')}
        </Button>
        <ErrorNotice message={error} />
      </S.Gate>
    )
  }

  // ---------------- Toolbar count + applied-filter chips ----------------
  const loading = section === 'creations' ? publishableLoading : ownedLoading || isPlaceholderData
  const total = section === 'creations' ? creations.length : status === 'not_for_sale' ? ownedAssets.length : ownedTotal

  const chips: FilterChip[] = []
  if (status !== 'all')
    chips.push({
      key: 'status',
      label: status === 'on_sale' ? t('filter.onSale') : t('filter.notForSale'),
      onRemove: () => setStatus('all')
    })
  if (showRarityCat)
    for (const r of RARITIES)
      if (rarities.includes(r))
        chips.push({ key: `rarity-${r}`, label: capitalizeFirst(r), onRemove: () => toggleRarity(r) })
  if (showRarityCat && subCategory) {
    const sub = subsFor(section).find(s => s.key === subCategory)
    chips.push({ key: 'sub', label: sub ? t(sub.labelKey) : subCategory, onRemove: () => setSubCategory(null) })
  }
  function clearFilters() {
    setStatus('all')
    setRarities([])
    setSubCategory(null)
  }

  // ---------------- Sidebar (shared between desktop + mobile drawer) ----------------
  const sidebar = (
    <>
      <S.Group>
        <S.GroupTitle>{t('myAssets.assetsHeading')}</S.GroupTitle>
        {SECTIONS.map(s => (
          <S.SectionButton
            key={s.key}
            type="button"
            selected={section === s.key}
            aria-pressed={section === s.key}
            onClick={() => pickSection(s.key)}
          >
            {t(s.labelKey)}
          </S.SectionButton>
        ))}
      </S.Group>

      <F.Divider />

      <S.FilterGroup>
        <S.FilterTitle>{t('filter.status')}</S.FilterTitle>
        {(
          [
            ['all', t('filter.statusAll')],
            ['on_sale', t('filter.onSale')],
            ['not_for_sale', t('filter.notForSale')]
          ] as [FilterStatus, string][]
        ).map(([value, label]) => (
          <F.StatusRow key={value}>
            <F.StatusRadio
              type="radio"
              name="myassets-status"
              checked={status === value}
              onChange={() => setStatus(value)}
            />
            <F.StatusLabel>{label}</F.StatusLabel>
          </F.StatusRow>
        ))}
      </S.FilterGroup>

      {showRarityCat ? (
        <>
          <F.Divider />
          <S.FilterGroup>
            <S.FilterTitle>{t('assets.rarity')}</S.FilterTitle>
            <F.RarityChips data-testid="rarity-filter">
              {RARITIES.map(r => {
                const selected = rarities.includes(r)
                return (
                  <F.RarityChip
                    key={r}
                    type="button"
                    selected={selected}
                    aria-pressed={selected}
                    onClick={() => toggleRarity(r)}
                    data-testid="rarity-filter-check"
                  >
                    <F.RaritySwatch color={theme.rarities[r as keyof typeof theme.rarities]}>
                      {selected ? <F.RaritySwatchCheck name="check" aria-hidden /> : null}
                    </F.RaritySwatch>
                    <F.RarityName selected={selected}>{r}</F.RarityName>
                  </F.RarityChip>
                )
              })}
            </F.RarityChips>
          </S.FilterGroup>

          <F.Divider />
          <S.FilterGroup>
            <S.FilterTitle>{t('assets.category')}</S.FilterTitle>
            <S.SubPills data-testid="category-filter">
              {subsFor(section).map(sub => {
                const selected = subCategory === sub.key
                return (
                  <S.SubPill
                    key={sub.key}
                    type="button"
                    selected={selected}
                    aria-pressed={selected}
                    onClick={() => setSubCategory(selected ? null : sub.key)}
                  >
                    {t(sub.labelKey)}
                  </S.SubPill>
                )
              })}
            </S.SubPills>
          </S.FilterGroup>
        </>
      ) : null}
    </>
  )

  return (
    <A.Root data-testid="my-assets">
      {filtersOpen ? <A.Scrim onClick={() => setFiltersOpen(false)} aria-hidden /> : null}
      <A.Sidebar className={filtersOpen ? 'is-open' : ''} data-testid="my-assets-sidebar">
        <A.DrawerHead>
          <A.DrawerTitle>{t('assets.filters')}</A.DrawerTitle>
          <A.CloseBtn onClick={() => setFiltersOpen(false)} aria-label={t('assets.closeFilters')}>
            ✕
          </A.CloseBtn>
        </A.DrawerHead>
        <A.SidebarScroll>{sidebar}</A.SidebarScroll>
        <A.DrawerFoot>
          <A.ShowItems type="button" onClick={() => setFiltersOpen(false)}>
            {t('assets.showItems')}
          </A.ShowItems>
        </A.DrawerFoot>
      </A.Sidebar>

      <A.Main>
        <S.SearchBar>
          <S.SearchIcon name="search" aria-hidden />
          <S.SearchInput
            type="search"
            value={searchInput}
            placeholder={t('myAssets.searchPlaceholder')}
            aria-label={t('myAssets.searchPlaceholder')}
            onChange={e => setSearchInput(e.target.value)}
          />
          {searchInput ? (
            <S.SearchClear type="button" aria-label={t('myAssets.clearSearch')} onClick={() => setSearchInput('')}>
              <S.ClearIcon name="close" aria-hidden />
            </S.SearchClear>
          ) : null}
        </S.SearchBar>

        {importCount > 0 ? (
          <S.ImportBanner to="/import">
            <span aria-hidden>📦</span>
            <S.ImportText>
              <S.ImportTitle>{t('myAssets.importTitle')}</S.ImportTitle>
              <S.ImportSub>{t('myAssets.importSub', { count: importCount })}</S.ImportSub>
            </S.ImportText>
            <S.ImportCta>{t('myAssets.import')}</S.ImportCta>
          </S.ImportBanner>
        ) : null}

        <FilterBar
          sort={sort}
          onSort={setSort}
          sortOptions={MY_SORTS}
          total={total}
          loading={loading}
          query={search}
          onOpenFilters={() => setFiltersOpen(true)}
          chips={chips}
          onClearChips={clearFilters}
        />

        {(section === 'creations' ? publishableError : !!ownedError) ? (
          <ErrorNotice message={t('myAssets.ownedError')} testId="my-assets-error" />
        ) : null}
        <ErrorNotice message={cancelError} />

        {/* ---- Creations grid ---- */}
        {section === 'creations' ? (
          <>
            <S.Grid data-testid="grid">
              {publishableLoading ? (
                <SkeletonCards count={12} />
              ) : (
                creations.map(item => {
                  const sale = saleFor(item)
                  const listed = !!sale?.isOnSale
                  return (
                    <AssetCard
                      key={`${item.contractAddress}-${item.blockchainItemId}`}
                      item={publishableToItem(item, sale?.priceCredits ?? 0)}
                      mode="manage"
                      listed={listed}
                      busy={cancelling === item.id}
                      onList={() => {
                        track('Shop Started Listing', { listing_type: 'primary', item_id: item.blockchainItemId })
                        setPublishing(item)
                      }}
                      onUnlist={() => {
                        if (sale?.tradeId) void cancelByTrade(sale.tradeId, item.name, item.id)
                      }}
                    />
                  )
                })
              )}
            </S.Grid>
            {!publishableLoading && creations.length === 0 ? (
              <S.EmptyState>
                <S.EmptyIcon>
                  <Icon name="pen" size={30} aria-hidden />
                </S.EmptyIcon>
                <S.EmptyTitle>{t('myAssets.emptyCreationsTitle')}</S.EmptyTitle>
                <S.EmptyText>{t('myAssets.nothingToPublish')}</S.EmptyText>
              </S.EmptyState>
            ) : null}
          </>
        ) : (
          /* ---- Owned grid (wearables / emotes / names) ---- */
          <>
            <S.Grid data-testid="grid">
              {ownedLoading || isPlaceholderData ? (
                <SkeletonCards count={12} />
              ) : (
                ownedAssets.map(asset =>
                  section === 'names' ? (
                    // NAMEs can't be resold through the Shop (the credit rail is Polygon-only, NAMEs are
                    // on Ethereum L1) — show them view-only, no list control. Force category 'ens' so the
                    // card renders the typographic "@name" tile (Figma 696-33957).
                    <AssetCard key={asset.id} item={{ ...assetToItem(asset), category: 'ens' }} mode="view" />
                  ) : (
                    <AssetCard
                      key={asset.id}
                      item={assetToItem(asset)}
                      mode="manage"
                      listed={asset.isOnSale}
                      busy={cancelling === asset.id}
                      onList={() => {
                        track('Shop Started Listing', {
                          listing_type: 'secondary',
                          item_id: asset.itemId ?? asset.tokenId ?? null
                        })
                        setSelling(asset)
                      }}
                      onUnlist={() => {
                        if (asset.tradeId) void cancelByTrade(asset.tradeId, asset.name, asset.id)
                      }}
                    />
                  )
                )
              )}
              {isFetchingNextPage ? <SkeletonCards count={6} /> : null}
            </S.Grid>
            {status !== 'not_for_sale' ? (
              <LoadMore
                hasNextPage={hasNextPage}
                isFetching={isFetchingNextPage}
                onLoadMore={() => void fetchNextPage()}
              />
            ) : null}
            {!ownedLoading && !isPlaceholderData && ownedAssets.length === 0 ? (
              <S.EmptyState>
                <S.EmptyIcon>
                  <Icon
                    name={section === 'names' ? 'website' : section === 'emotes' ? 'emote-dance' : 'cat-upper'}
                    size={30}
                    aria-hidden
                  />
                </S.EmptyIcon>
                <S.EmptyTitle>
                  {section === 'names' ? t('myAssets.emptyNamesTitle') : t('myAssets.emptyOwnedTitle')}
                </S.EmptyTitle>
                <S.EmptyText>{section === 'names' ? t('myAssets.namesEmpty') : t('myAssets.ownedEmpty')}</S.EmptyText>
                {section !== 'names' ? <S.EmptyCta to="/assets">{t('myAssets.emptyBrowse')}</S.EmptyCta> : null}
              </S.EmptyState>
            ) : null}
          </>
        )}
      </A.Main>

      {selling ? <SellModal asset={selling} session={session} onClose={() => setSelling(null)} /> : null}
      {publishing ? <PrimaryListModal item={publishing} session={session} onClose={() => setPublishing(null)} /> : null}
    </A.Root>
  )
}
