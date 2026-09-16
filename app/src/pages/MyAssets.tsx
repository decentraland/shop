import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { config } from '~/config'
import { useWallet } from '~/store/wallet'
import { fetchMyAssets, fetchSecondarySaleState, type CatalogItem, type MyAsset } from '~/lib/api'
import { fetchCollectionSaleState, type CollectionSaleState } from '~/lib/collections'
import { displayCredits } from '~/lib/mana-convert'
import { useManaRate } from '~/hooks/useManaRate'
import { fetchPublishableItems, type PublishableItem } from '~/lib/builder'
import { CreatorSaleModal, type SaleableCollection } from '~/components/CreatorSaleModal'
import { CollectionThumb } from '~/components/CollectionThumb'
import { CreatorSales } from '~/components/CreatorSales'
import { useCreatorSales } from '~/hooks/useCreatorSales'
import { useCreatorSalesEnabled } from '~/hooks/useCreatorSalesEnabled'
import { Button } from '~/components/Button'
import { AssetCard } from '~/components/AssetCard'
import { SkeletonCards } from '~/components/SkeletonCards'
import { LoadMore } from '~/components/LoadMore'
import { FilterBar, RARITIES, type FilterChip } from '~/components/FilterBar'
import { CATEGORIES, CategoryFilter } from '~/components/CategoryFilter'
import { CurrencyIcon } from '~/components/CurrencyIcon'
import { FilterSection, type FilterStatus } from '~/components/Filters'
import { useInfiniteGrid } from '~/hooks/useInfiniteGrid'
import { SUBCAT_MAP } from '~/lib/categories'
import { capitalizeFirst } from '~/lib/text'
import { useSeo } from '~/hooks/useSeo'
import { useScrollTopOnChange } from '~/hooks/useScrollTopOnChange'
import { useImportable } from '~/hooks/useImportable'
import { t } from '~/intl/i18n'
import { theme } from '~/styles/theme'
import { ErrorNotice } from '~/components/ErrorNotice'
import { EmptyState } from '~/components/EmptyState'
import { NewPricingModal } from '~/components/NewPricingModal'
import itemsEmptyIllustration from '~/assets/empty/items-empty.svg'
import salesEmptyIllustration from '~/assets/empty/sales-empty.svg'
import collectionsEmptyIllustration from '~/assets/empty/collections-empty.svg'
import { dismissPrompt, isPromptDismissed, MANA_PRICING_PROMPT } from '~/lib/dismissed-prompts'
import * as A from '~/styles/browseLayout.styles'
import * as F from '~/components/Filters/Filters.styles'
import * as S from './MyAssets.styles'
import manaLight from '~/assets/mana-matic-light.svg'

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

/**
 * How a creation is priced, for the creations-only Price filter.
 *
 * 'credits' is a Shop listing (USD-pegged); 'mana' is an old listing the seller has not migrated yet —
 * the same set the pricing banner counts. An unlisted creation is neither, so it only shows under 'all'.
 */
type PriceType = 'all' | 'credits' | 'mana'
const PRICE_TYPES: PriceType[] = ['all', 'credits', 'mana']
const PRICE_LABEL_KEY: Record<PriceType, string> = {
  all: 'filter.priceAll',
  credits: 'filter.priceCredits',
  mana: 'filter.priceMana'
}

/** The currency each option is about, in front of its name. 'All' spans both, so it carries no mark. */
function priceMark(type: PriceType) {
  if (type === 'credits') return <CurrencyIcon size={14} />
  // The light mark: this sidebar is the dark purple field, where the dark one disappears.
  if (type === 'mana') return <F.StatusMark src={manaLight} alt="" aria-hidden />
  return null
}

// Sort menu shown in the toolbar. Server values are a subset of the NFT endpoint's NFTSortBy; the same
// keys drive the (client-side) creations sort.
const MY_SORTS: { key: string; label: string; server: 'newest' | 'name' | 'cheapest' }[] = [
  { key: 'newest', label: 'filterBar.sortNewest', server: 'newest' },
  { key: 'name', label: 'filterBar.sortName', server: 'name' },
  { key: 'cheapest', label: 'filterBar.sortCheapest', server: 'cheapest' }
]

// Rarity filter only makes sense for wearables & emotes (Names/Creations don't carry rarities).
function hasRarityAndCategory(section: SectionKey) {
  return section === 'wearables' || section === 'emotes'
}

// The section nav reuses Collectibles' CategoryFilter, which is keyed by 'wearable'/'emote'/'names'.
// Map between that and My Assets' section keys ('creations' has no CategoryFilter entry — it's the
// relabelled "extra" slot).
const CATEGORY_OF_SECTION: Record<SectionKey, string> = {
  wearables: 'wearable',
  emotes: 'emote',
  names: 'names',
  creations: ''
}
const SECTION_OF_CATEGORY: Record<string, SectionKey> = {
  wearable: 'wearables',
  emote: 'emotes',
  names: 'names'
}

// An owned NAME → its Builder management page (external), mirroring the classic marketplace's
// `${builderUrl}/names/<name>` deep link. The Builder resolves the bare name to its `.dcl.eth`
// subdomain, so the raw NAME (as returned by /v1/nfts) is what goes in the path.
function builderNameUrl(name: string): string {
  return `${config.builderUrl}/names/${encodeURIComponent(name)}`
}

// Owned NFT (secondary) → the CatalogItem shape AssetCard renders (carries tokenId so the card links to
// the item detail). `priceCredits`/`tradeId` reflect the open listing when on sale (else 0 → "not for
// sale"). The authoritative shop (USD-pegged) listing — resolved from the shop feed by tokenId — wins
// over the row's legacy `order` fields, which don't carry the credit price for a shop resale.
function assetToItem(a: MyAsset, sale?: { priceCredits: number; tradeId: string }): CatalogItem {
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
    priceCredits: sale?.priceCredits ?? a.listingPrice ?? 0,
    gender: null,
    isSmart: false,
    tokenId: a.tokenId,
    issuedId: a.issuedId,
    tradeId: sale?.tradeId ?? a.tradeId
  }
}

// Created collection item (primary) → CatalogItem (itemId = on-chain blockchain item id). `price` is
// the listed credit price when the item is currently on sale.
// `creator` is the connected user's address: My Creations only ever lists items the user made
// (fetchPublishableItems is scoped to them), and the item-detail page relies on `creator === you` to
// recognize you as the creator and offer "Put up for sale" (isOwnListing). Passing '' left the detail
// page treating you as a stranger, so the publish CTA never showed after MANAGE.
function publishableToItem(p: PublishableItem, price: number, creator: string): CatalogItem {
  return {
    id: `${p.contractAddress}-${p.blockchainItemId}`,
    name: p.name,
    creator,
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
  const navigate = useNavigate()

  // The active section lives in the URL (?section=…) so it survives refresh + is shareable. Fall back to
  // 'wearables' for a missing/unknown value.
  const [searchParams, setSearchParams] = useSearchParams()
  const sectionParam = searchParams.get('section')
  const section: SectionKey = SECTIONS.some(s => s.key === sectionParam) ? (sectionParam as SectionKey) : 'wearables'
  const [status, setStatus] = useState<FilterStatus>('all')
  // How a creation is priced. Creations only: it separates the Shop's own credit listings from the classic
  // MANA ones the migration banner is about, which is a distinction no other section has.
  const [priceType, setPriceType] = useState<PriceType>('all')
  const [rarities, setRarities] = useState<string[]>([])
  const [subCategory, setSubCategory] = useState<string | null>(null)
  // A section is a different set of items, not more of the same one — read it from the top.
  useScrollTopOnChange(`${section}:${subCategory ?? ''}`)
  const [sort, setSort] = useState('newest')
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('') // debounced
  const [filtersOpen, setFiltersOpen] = useState(false) // mobile sidebar drawer
  // Collapsible filter groups — same defaults as Collectibles (rarity starts collapsed).
  const [openStatus, setOpenStatus] = useState(true)
  const [openPrice, setOpenPrice] = useState(true)
  const [openRarity, setOpenRarity] = useState(false)
  // Dismissing the classic-pricing banner lasts this visit only — deliberately not persisted, so the
  // nudge comes back while the listings it is about are still there.
  const [bannerDismissed, setBannerDismissed] = useState(false)
  // 'idle' → 'open' → 'closed' is one-way, so the prompt can fire at most once per visit even though
  // the classic-listing count it waits on keeps refetching underneath.
  const [pricingPrompt, setPricingPrompt] = useState<'idle' | 'open' | 'closed'>('idle')

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

  // Collapsed-group summaries (shown next to the header when a group is closed) — mirrors Collectibles.
  const statusSummary =
    status === 'on_sale' ? t('filter.onSale') : status === 'not_for_sale' ? t('filter.notForSale') : ''
  const priceSummary = priceType === 'all' ? '' : t(PRICE_LABEL_KEY[priceType])
  const raritySummary = RARITIES.filter(r => rarities.includes(r))
    .map(capitalizeFirst)
    .join(', ')

  // Reset the contextual filters when moving to a section that doesn't use them.
  function pickSection(next: SectionKey) {
    setSearchParams(
      prev => {
        const p = new URLSearchParams(prev)
        p.set('section', next)
        return p
      },
      { replace: true }
    )
    setSubCategory(null)
    if (!hasRarityAndCategory(next)) setRarities([])
    if (next !== 'creations') setPriceType('all')
    setFiltersOpen(false)
  }
  function toggleRarity(r: string) {
    setRarities(rs => (rs.includes(r) ? rs.filter(x => x !== r) : [...rs, r]))
  }
  // CategoryFilter drives the section nav — translate its category key back to a My Assets section.
  function pickCategory(catKey: string) {
    const next = SECTION_OF_CATEGORY[catKey]
    if (next) pickSection(next)
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
    isFetchNextPageError,
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

  // An owned wearable/emote on sale via a shop (USD-pegged) trade has no credit price on its /v1/nfts
  // `order` (that's a legacy on-chain MANA field, absent for an off-chain shop resale). Resolve the
  // authoritative price + tradeId from the shop feed by tokenId — the secondary counterpart to the
  // creations `saleState` merge (fetchCollectionSaleState) for primary listings.
  const ownedContracts = useMemo(
    () => (section === 'wearables' || section === 'emotes' ? [...new Set(ownedRaw.map(a => a.contractAddress))] : []),
    [ownedRaw, section]
  )
  const { data: secondarySale } = useQuery({
    queryKey: ['secondary-sale-state', ownedContracts],
    enabled: ownedContracts.length > 0,
    queryFn: async () => {
      const maps = await Promise.all(ownedContracts.map(async ca => [ca, await fetchSecondarySaleState(ca)] as const))
      const merged: Record<string, { priceCredits: number; tradeId: string }> = {}
      for (const [ca, m] of maps) {
        for (const [tokenId, v] of Object.entries(m)) merged[`${ca}-${tokenId}`] = v
      }
      return merged
    }
  })
  const saleForToken = (a: MyAsset) => secondarySale?.[`${a.contractAddress}-${a.tokenId}`]
  // On sale if the shop feed lists this token (authoritative for credits) OR the row carries a legacy
  // order — so the "not for sale" client filter never hides a shop-listed token.
  const isTokenOnSale = (a: MyAsset) => !!saleForToken(a) || a.isOnSale

  // The endpoint has no "not for sale" flag, so that case is filtered here from each row's sale state.
  const ownedAssets = useMemo(
    () => (status === 'not_for_sale' ? ownedRaw.filter(a => !isTokenOnSale(a)) : ownedRaw),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ownedRaw, status, secondarySale]
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
      const merged: Record<string, CollectionSaleState> = {}
      for (const [ca, m] of maps) {
        for (const [itemId, v] of Object.entries(m)) merged[`${ca}-${itemId}`] = v
      }
      return merged
    }
  })
  const saleFor = (item: PublishableItem) => saleState?.[`${item.contractAddress}-${item.blockchainItemId}`]

  // Only a MANA-denominated listing needs the oracle, and most sellers have none — don't poll for nothing.
  const hasManaListing = useMemo(() => Object.values(saleState ?? {}).some(v => !!v.manaWei), [saleState])
  const { data: manaRate } = useManaRate(hasManaListing)

  /**
   * A MANA listing has no fixed credit price: convert at the LIVE rate, the same number the browse grid
   * and the item page show. The server's snapshot stands in until that rate resolves, so a listed item
   * never flashes NOT FOR SALE — `displayCredits` would return 0 without a rate.
   */
  const creditsFor = (sale: CollectionSaleState | undefined) => {
    if (!sale) return 0
    if (!sale.manaWei || !manaRate) return sale.priceCredits
    return displayCredits({ manaWei: sale.manaWei, priceCredits: sale.priceCredits }, manaRate)
  }

  // Creator sales: the collections with at least one Shop listing (what a sale can apply to) and the sales the
  // creator already runs. Both only matter on the creations section, and only once the flag opens the flow.
  const creatorSalesEnabled = useCreatorSalesEnabled()
  const { data: creatorSales } = useCreatorSales(address, creatorSalesEnabled && section === 'creations')
  const [saleModalOpen, setSaleModalOpen] = useState(false)
  const [saleModalFor, setSaleModalFor] = useState<string | undefined>(undefined)
  const saleableCollections = useMemo<SaleableCollection[]>(() => {
    const byAddress = new Map<string, SaleableCollection>()
    // Every creation goes in, listed or not: the sale only re-prices the listed ones, and the review step
    // has to be able to say which of the rest it will leave alone. The unfiltered list, so what the sale
    // covers never depends on how the grid happens to be filtered.
    for (const item of publishable ?? []) {
      const sale = saleState?.[`${item.contractAddress}-${item.blockchainItemId}`]
      // Three states, because "on sale" is not one thing here. A discount re-prices the Shop's own credit
      // listings, so an item still quoted in MANA cannot take one — but it IS listed, and the review has to
      // say that rather than call it not for sale.
      const state = !sale?.isOnSale ? 'unlisted' : sale.manaWei ? 'classic' : 'discounted'
      const listedInCredits = state === 'discounted'
      const key = item.contractAddress.toLowerCase()
      const entry = byAddress.get(key) ?? {
        contractAddress: key,
        name: item.collectionName,
        listedCount: 0,
        examplePriceCredits: null,
        items: []
      }
      entry.items.push({
        key: `${key}-${item.blockchainItemId}`,
        name: item.name,
        thumbnail: item.thumbnail,
        priceCredits: listedInCredits && sale ? sale.priceCredits : null,
        state,
        remainingSupply: item.remainingSupply
      })
      if (listedInCredits && sale) {
        entry.listedCount += 1
        entry.examplePriceCredits = Math.max(entry.examplePriceCredits ?? 0, sale.priceCredits)
      }
      byAddress.set(key, entry)
    }
    // A collection with nothing listed has nothing to discount, so it is not saleable.
    return [...byAddress.values()].filter(c => c.listedCount > 0)
  }, [publishable, saleState])

  // Old (classic) listings the seller could move into the Shop → surfaces the import banner. Shared
  // with the Activity chip, so the two can never quote different numbers.
  const { count: importableCount } = useImportable()
  const importCount = importableCount ?? 0

  // Creations filtered (status + price + search) + sorted client-side (the builder feed isn't
  // paginated/queryable).

  // Creations filtered (status + price + search) + sorted client-side (the builder feed isn't
  // paginated/queryable).
  const creations = useMemo(() => {
    let list = publishable ?? []
    if (status === 'on_sale') list = list.filter(p => saleFor(p)?.isOnSale)
    else if (status === 'not_for_sale') list = list.filter(p => !saleFor(p)?.isOnSale)
    // Both arms read the SAME listing the card prices from, so the filter can never disagree with what the
    // grid shows. `isOnSale` alone is not "priced in credits": a MANA listing is on sale too, it is just
    // quoted in the other currency, and `manaWei` is what tells them apart.
    if (priceType === 'credits') list = list.filter(p => !!saleFor(p)?.isOnSale && !saleFor(p)?.manaWei)
    else if (priceType === 'mana') list = list.filter(p => !!saleFor(p)?.manaWei)
    if (search) {
      const q = search.toLowerCase()
      list = list.filter(p => p.name.toLowerCase().includes(q))
    }
    const sorted = [...list]
    if (sort === 'name') sorted.sort((a, b) => a.name.localeCompare(b.name))
    else if (sort === 'cheapest') sorted.sort((a, b) => creditsFor(saleFor(a)) - creditsFor(saleFor(b)))
    return sorted
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [publishable, saleState, status, priceType, search, sort, manaRate])

  /**
   * The creations split into their collections, in the order the filtered list already put them.
   *
   * A creator manages by collection — a sale covers one, and so does the CTA in each header — so the grid
   * is grouped rather than flat. Insertion order is kept instead of re-sorting by name, so whatever the
   * Sort control chose still decides which collection leads.
   */
  const creationGroups = useMemo(() => {
    const groups = new Map<string, { contractAddress: string; name: string; listed: number; items: typeof creations }>()
    for (const item of creations) {
      const key = item.contractAddress.toLowerCase()
      const group = groups.get(key) ?? { contractAddress: key, name: item.collectionName, listed: 0, items: [] }
      group.items.push(item)
      if (saleState?.[`${item.contractAddress}-${item.blockchainItemId}`]?.isOnSale) group.listed += 1
      groups.set(key, group)
    }
    return [...groups.values()]
  }, [creations, saleState])

  /** Which collections a sale can actually cover, for the per-header CTA. */
  const saleableByAddress = useMemo(
    () => new Set(saleableCollections.map(c => c.contractAddress.toLowerCase())),
    [saleableCollections]
  )

  /** The collection the open modal is scoped to — a sale always covers exactly the one it was opened from. */
  const saleModalCollection = saleableCollections.find(c => c.contractAddress === saleModalFor)

  useEffect(() => {
    if (pricingPrompt !== 'idle' || importCount === 0) return
    if (isPromptDismissed(MANA_PRICING_PROMPT, address)) return
    setPricingPrompt('open')
  }, [pricingPrompt, importCount, address])

  // The opt-out only silences this prompt; the banner stays, so the tool is always still reachable.
  function closePricingPrompt(optOut: boolean) {
    if (optOut) dismissPrompt(MANA_PRICING_PROMPT, address)
    setPricingPrompt('closed')
  }

  // ---------------- Sign-in gate ----------------
  if (!session) {
    return (
      <S.Gate>
        <S.GateTitle>{t('nav.myAssets')}</S.GateTitle>
        <S.GateText>{t('myAssets.signInPrompt')}</S.GateText>
        <Button variant="white" onClick={() => signIn()}>
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
  if (section === 'creations' && priceType !== 'all')
    chips.push({
      key: 'price',
      label: t(PRICE_LABEL_KEY[priceType]),
      onRemove: () => setPriceType('all')
    })
  if (showRarityCat)
    for (const r of RARITIES)
      if (rarities.includes(r))
        chips.push({ key: `rarity-${r}`, label: capitalizeFirst(r), onRemove: () => toggleRarity(r) })
  if (showRarityCat && subCategory) {
    const sub = CATEGORIES.find(c => c.key === CATEGORY_OF_SECTION[section])?.subs?.find(s => s.key === subCategory)
    chips.push({ key: 'sub', label: sub ? t(sub.labelKey) : subCategory, onRemove: () => setSubCategory(null) })
  }
  function clearFilters() {
    setStatus('all')
    setPriceType('all')
    setRarities([])
    setSubCategory(null)
  }

  // ---------------- Sidebar (shared between desktop + mobile drawer) ----------------
  const sidebar = (
    // F.Root, not a bare fragment: it is what defines the 12px rhythm between a sidebar's blocks, and
    // Collectibles gets it for free by rendering <Filters>, which wraps its own children in it. This page
    // composes the same pieces by hand, so without it the last nav row sat flush against the divider
    // below it. Reused rather than re-spaced here so the two sidebars cannot drift apart.
    <F.Root>
      {/* Section nav = the SAME CategoryFilter as Collectibles (Wearables/Emotes expand to sub-cats),
          minus "Shop All" and with "My Creations" as the extra entry. */}
      <CategoryFilter
        title={t('myAssets.assetsHeading')}
        category={CATEGORY_OF_SECTION[section]}
        subCategory={subCategory}
        onCategory={pickCategory}
        onSub={setSubCategory}
        onCollections={() => pickSection('creations')}
        collections={section === 'creations'}
        extraLabelKey="myAssets.sectionCreations"
        hideAll
      />

      {showRarityCat ? (
        <>
          <F.Divider />
          <FilterSection
            title={t('assets.rarity')}
            open={openRarity}
            onToggle={() => setOpenRarity(o => !o)}
            summary={raritySummary}
            headerTestId="sidebar-section-toggle"
          >
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
          </FilterSection>
        </>
      ) : null}

      <F.Divider />
      <FilterSection
        title={t('filter.status')}
        open={openStatus}
        onToggle={() => setOpenStatus(o => !o)}
        summary={statusSummary}
      >
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
      </FilterSection>

      {/* Creations only: nothing else the seller owns can still be sitting on classic pricing. */}
      {section === 'creations' ? (
        <>
          <F.Divider />
          <FilterSection
            title={t('filter.salePrice')}
            open={openPrice}
            onToggle={() => setOpenPrice(o => !o)}
            summary={priceSummary}
          >
            {PRICE_TYPES.map(value => (
              <F.StatusRow key={value}>
                <F.StatusRadio
                  type="radio"
                  name="myassets-price"
                  checked={priceType === value}
                  onChange={() => setPriceType(value)}
                  data-testid={`price-filter-${value}`}
                />
                <F.StatusLabel>
                  {priceMark(value)}
                  {t(PRICE_LABEL_KEY[value])}
                </F.StatusLabel>
              </F.StatusRow>
            ))}
          </FilterSection>
        </>
      ) : null}
    </F.Root>
  )

  return (
    <A.Root data-testid="my-assets">
      {filtersOpen ? <A.Scrim onClick={() => setFiltersOpen(false)} aria-hidden /> : null}
      <A.Sidebar data-open={filtersOpen || undefined} data-testid="my-assets-sidebar">
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
        {importCount > 0 && !bannerDismissed ? (
          <S.ImportBanner count={importCount} onDismiss={() => setBannerDismissed(true)} />
        ) : null}

        {/* The search rides IN the toolbar, beside Sort By (Figma: count · search · SORT BY). It used to be
            a full-width bar of its own above it, four rows under the sub-nav's global search — two fields on
            screen at once with nothing to say which searched what, and the global one leaves the page. That
            one is now hidden on this route (see NavBar), so this is the only search here. */}
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
          search={
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
          }
        />

        {(section === 'creations' ? publishableError : !!ownedError) ? (
          <ErrorNotice message={t('myAssets.ownedError')} testId="my-assets-error" />
        ) : null}

        {/* ---- Creations grid ---- */}
        {section === 'creations' ? (
          <>
            {/* Only when there IS something to show: starting a sale is each collection header's job now,
                so an empty panel was a heading over a nudge with nowhere left to send anyone. */}
            {creatorSalesEnabled && session && creatorSales && creatorSales.length > 0 ? (
              <S.SalesPanel data-testid="creator-sales-panel">
                <S.SalesTitle>{t('creatorSale.salesTitle')}</S.SalesTitle>
                <CreatorSales sales={creatorSales} session={session} />
              </S.SalesPanel>
            ) : null}
            {saleModalOpen && session && saleModalCollection ? (
              <CreatorSaleModal
                session={session}
                collection={saleModalCollection}
                onClose={() => setSaleModalOpen(false)}
              />
            ) : null}
            {publishableLoading ? (
              <S.Grid data-testid="grid">
                <SkeletonCards count={12} />
              </S.Grid>
            ) : (
              creationGroups.map(group => (
                <S.CollectionGroup key={group.contractAddress} data-testid="creation-group">
                  <S.CollectionHead>
                    <S.CollectionThumbFrame>
                      <CollectionThumb contractAddress={group.contractAddress} />
                    </S.CollectionThumbFrame>
                    <S.CollectionHeadText>
                      <S.CollectionName data-testid="creation-group-name">{group.name}</S.CollectionName>
                      <S.CollectionCount data-testid="creation-group-count">
                        {t('myAssets.itemsCount', { count: group.items.length })}
                        {group.listed > 0 ? ` · ${t('myAssets.groupOnSale', { count: group.listed })}` : ''}
                      </S.CollectionCount>
                    </S.CollectionHeadText>
                    {creatorSalesEnabled && session && saleableByAddress.has(group.contractAddress) ? (
                      <S.SaleCta
                        variant="purple"
                        size="sm"
                        data-testid="creation-group-sale"
                        onClick={() => {
                          setSaleModalFor(group.contractAddress)
                          setSaleModalOpen(true)
                        }}
                      >
                        {t('creatorSale.putOnSale')}
                      </S.SaleCta>
                    ) : null}
                  </S.CollectionHead>
                  <S.Grid data-testid="grid">
                    {group.items.map(item => {
                      const sale = saleFor(item)
                      return (
                        // Creations use the same MANAGE cta as owned assets: it navigates to the item's
                        // detail page, where listing / editing / removing / issuing live. Publishing no
                        // longer happens inline from the My Creations card.
                        <AssetCard
                          key={`${item.contractAddress}-${item.blockchainItemId}`}
                          item={publishableToItem(item, creditsFor(sale), address ?? '')}
                          mode="manage-link"
                        />
                      )
                    })}
                  </S.Grid>
                </S.CollectionGroup>
              ))
            )}
            {!publishableLoading && creations.length === 0 ? (
              <EmptyState
                testId="creations-empty"
                icon={collectionsEmptyIllustration}
                title={t('myAssets.emptyCreationsTitle')}
                body={t('myAssets.nothingToPublish')}
              />
            ) : null}
          </>
        ) : (
          /* ---- Owned grid (wearables / emotes / names) ---- */
          <>
            <S.Grid data-testid="grid">
              {ownedLoading || isPlaceholderData ? (
                <SkeletonCards count={12} />
              ) : (
                // One card PER OWNED TOKEN: /v1/nfts returns a distinct row per tokenId, so N copies of
                // the same item render as N cards. Keyed by `asset.id` (= contractAddress-tokenId), which
                // is unique per copy (raw tokenId can repeat across collections) — never collapse copies.
                ownedAssets.map(asset =>
                  section === 'names' ? (
                    // NAMEs can't be resold through the Shop (the credit rail is Polygon-only, NAMEs are
                    // on Ethereum L1). The card's action is a MANAGE CTA that opens the name's Builder
                    // management page (external, like the classic marketplace). Force category 'ens' so
                    // the card renders the typographic "@name" tile (Figma 696-33957).
                    <AssetCard
                      key={asset.id}
                      item={{ ...assetToItem(asset), category: 'ens' }}
                      mode="manage-link"
                      manageHref={builderNameUrl(asset.name)}
                    />
                  ) : (
                    // Owned wearable/emote: the card's only action is MANAGE → the item detail page for
                    // this exact token, where listing (List / Update price / Remove) now lives. No inline
                    // put-on-sale from My Assets anymore.
                    <AssetCard key={asset.id} item={assetToItem(asset, saleForToken(asset))} mode="manage-link" />
                  )
                )
              )}
              {isFetchingNextPage ? <SkeletonCards count={6} /> : null}
            </S.Grid>
            {status !== 'not_for_sale' ? (
              <LoadMore
                hasNextPage={hasNextPage}
                isFetching={isFetchingNextPage}
                isError={isFetchNextPageError}
                onLoadMore={() => void fetchNextPage()}
              />
            ) : null}
            {!ownedLoading && !isPlaceholderData && ownedAssets.length === 0 ? (
              <EmptyState
                testId="owned-empty"
                // A "nothing on sale" grid is a listings state, not an empty backpack.
                icon={status === 'on_sale' ? salesEmptyIllustration : itemsEmptyIllustration}
                title={section === 'names' ? t('myAssets.emptyNamesTitle') : t('myAssets.emptyOwnedTitle')}
                body={section === 'names' ? t('myAssets.namesEmpty') : t('myAssets.ownedEmpty')}
                cta={section !== 'names' ? { label: t('myAssets.emptyBrowse'), to: '/items' } : undefined}
              />
            ) : null}
          </>
        )}
      </A.Main>

      {pricingPrompt === 'open' ? (
        <NewPricingModal
          onClose={closePricingPrompt}
          onConfirm={optOut => {
            closePricingPrompt(optOut)
            navigate('/import')
          }}
        />
      ) : null}
    </A.Root>
  )
}
