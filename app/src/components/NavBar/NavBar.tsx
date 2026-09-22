import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { NavLink, useNavigate, useSearchParams, useLocation } from 'react-router-dom'
import * as Sentry from '@sentry/react'
import { Network } from '@dcl/schemas'
import { Experimental_CssVarsProvider as CssVarsProvider } from '@mui/material/styles'
import { light as ui2Light } from 'decentraland-ui2/dist/theme'
import { Icon } from '~/components/Icon'
import { TopNav } from '~/components/TopNav'
import { useWallet } from '~/store/wallet'
import { useProfile } from '~/hooks/useProfile'
import { useIsOutfitCreator } from '~/hooks/useOutfits'
import { useMyStoreEnabled } from '~/hooks/useMyStoreEnabled'
import { useIsCreator } from '~/hooks/useIsCreator'
import { useEventTab } from '~/hooks/useEventTab'
import { useBalance } from '~/hooks/useBalance'
import { useWalletChain } from '~/hooks/useWalletChain'
import { useManaBalances } from '~/hooks/useManaBalance'
import { manaWeiToNumber } from '~/lib/mana-format'
import { useCart } from '~/store/cart'
import { CartPopover } from '~/components/CartPopover'
import { HeldCredits } from '~/components/HeldCredits'
import { SearchDropdown } from '~/components/SearchDropdown'
import { CURRENCY } from '~/lib/currency'
import { isIapMode } from '~/lib/iap'
import { detailRouteFor } from '~/lib/routes'
import { showsWalletConfirmations } from '~/lib/wallet-kind'
import { getRecentSearches, recordSearch, removeRecentSearch, clearRecentSearches } from '~/lib/recent-searches'
import { clearedSearchUrl } from '~/lib/searchClear'
import { NO_ACTIVE_ROW, SUGGESTIONS_LISTBOX_ID, searchKeyAction, type SuggestionRow } from '~/lib/suggestionNavigation'
import { searchHistoryMode } from '~/lib/searchHistory'
import { clearedSearchProps, suggestionClickedProps } from '~/lib/searchAnalytics'
import type { SuggestionChoice } from '~/components/SearchDropdown/SearchDropdown'
import { track } from '~/lib/analytics'
import type { CatalogItem } from '~/lib/api'
import type { CollectionHit, CreatorHit } from '~/lib/search'
import { t } from '~/intl/i18n'
import * as S from './NavBar.styles'
import { theme } from '~/styles/theme'

// The panel chrome is the shop's own, but the per-type notification ROWS are ui2's, and those are
// MUI-based (they read spacing/typography/palette off a MUI theme context) while the shop styles with
// emotion + its own tokens and mounts no MUI provider. So the bell is lazy-loaded (only when signed in)
// and wrapped in a scoped MUI CssVarsProvider carrying ui2's own theme — NOT ui2's ThemeProvider, which
// also injects a global CssBaseline reset that would clobber the shop's styles. The provider only defines
// namespaced `--mui-*` vars, so it doesn't leak into the rest of the app.
// Imported by concrete path, not through the folder's barrel: Rollup names a lazy chunk after its entry
// module, so going via index.ts would emit an anonymous `index-*.js` instead of `NotificationsBell-*.js`
// (same split either way — just far harder to spot in a bundle report).
const NotificationsBell = lazy(() => import('~/components/NotificationsBell/NotificationsBell'))

export function NavBar() {
  const { session, connecting, signIn, disconnect, restore } = useWallet()
  const isOutfitCreator = useIsOutfitCreator()
  const myStoreEnabled = useMyStoreEnabled()
  const isCreator = useIsCreator(session?.address)
  const address = session?.address
  const { data: avatar, isLoading: isLoadingProfile } = useProfile(address)
  const { data: balance, isError: balanceError, isLoading: balanceLoading } = useBalance(session)
  // Null for a managed (web2) wallet, so the hook never asks it where it is and ui2 hides its chain pill:
  // those users have no network to choose, every rail they touch being a relayed signature that works from
  // any chain — and network wording is what they must never be shown (CONVENTIONS.md).
  const { chainId, chains, switchTo } = useWalletChain(
    session && showsWalletConfirmations(session.providerType) ? session : null
  )
  // MANA the wallet holds on Ethereum AND Polygon. Drives the navbar chips (each rendered only when
  // > 0). Read per chain over that chain's own RPC, so both show regardless of the connected network.
  // No skeleton: an absent/zero balance renders nothing.
  const { data: manaBalancesWei } = useManaBalances(session)
  const cartCount = useCart(s => s.items.reduce((n, i) => n + i.quantity, 0))
  const openCart = useCart(s => s.setOpen)
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { pathname, search: locationSearch } = useLocation()
  // The Collectibles tab covers the whole browse surface: the grid (/items), an item's detail page
  // (/item/* and /token/* — both render ItemDetail), a collection page (/collection/*) and a creator
  // page (/items/creator/*, already under /items). A NavLink to /items alone wouldn't light up on
  // any of the detail/collection routes, so match them explicitly here.
  const collectiblesActive = /^\/(items|item|token|collection)(\/|$)/.test(pathname)
  // My Items has a search of its own, over the wallet's holdings. Showing the global one directly above it
  // put two search fields on screen at once, four rows apart, with no way to tell which searched what — and
  // the global one searches the whole shop, so typing in the wrong box silently leaves the page. The page's
  // own field wins because it is the one that matches what the page shows.
  const hidesGlobalSearch = /^\/my-items(\/|$)/.test(pathname)
  // Read once so every branch below decides off the same value (the module memoises it anyway).
  const iap = isIapMode()
  // The seasonal event tab, when one is running and actually has collections in it.
  const eventTab = useEventTab()
  // Checkout is a flow, not a place to browse from: inside the iOS web view the cart and its success
  // screen drop the shop's sub-nav entirely (Figma 2703:399357 Cart), leaving the back arrow the page
  // already renders as the only way out. The global bar above stays — it carries the credits balance,
  // which is exactly what a buyer looks at while checking out.
  const hidesSubnav = iap && /^\/(cart|success)(\/|$)/.test(pathname)
  const urlQuery = searchParams.get('q') ?? ''

  // Balances for the global ui2 navbar. Credits: undefined while loading/on error (hides the chip —
  // a dash would need a string prop), the loaded count (incl. 0) otherwise. MANA: only when the wallet
  // actually holds some, so the web2-first navbar shows no crypto by default.
  const shopCredits = session && !balanceLoading && !balanceError ? (balance?.credits ?? 0) : undefined
  // One entry per chain the wallet actually holds MANA on, so a user with MANA on both sees both and a
  // user with none still sees no crypto at all. Memoised because a fresh object on every render would
  // hand ui2 a new prop identity each time.
  const manaBalances = useMemo((): Partial<Record<Network, number>> | undefined => {
    if (!session || !manaBalancesWei) return undefined
    const balances: Partial<Record<Network, number>> = {}
    if (manaBalancesWei.ethereum > 0n) balances[Network.ETHEREUM] = manaWeiToNumber(manaBalancesWei.ethereum)
    if (manaBalancesWei.matic > 0n) balances[Network.MATIC] = manaWeiToNumber(manaBalancesWei.matic)
    return Object.keys(balances).length > 0 ? balances : undefined
  }, [session, manaBalancesWei])

  // What the input shows (drives the box) and what the dropdown queries (debounced) are separate:
  // the box updates instantly on keystroke; the dropdown lags 300ms so we don't fetch every letter.
  const [q, setQ] = useState(urlQuery)
  const [debounced, setDebounced] = useState(urlQuery)
  const [open, setOpen] = useState(false)
  const [recent, setRecent] = useState<string[]>([])
  // The dropdown's rows in visual order and which one the arrow keys are on (see lib/suggestionNavigation).
  const [rows, setRows] = useState<SuggestionRow[]>([])
  const [activeIndex, setActiveIndex] = useState(NO_ACTIVE_ROW)
  const searchInputRef = useRef<HTMLInputElement>(null)
  // The translucent band washes out over light content, so it deepens once the page scrolls.
  const [scrolled, setScrolled] = useState(false)
  const searchTimer = useRef<ReturnType<typeof setTimeout>>()
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onScroll = () => {
      const v = window.scrollY > 8
      setScrolled(v)
      // Mirrored on <body> so the global ui2 navbar (styled from TopNav via ancestor selectors,
      // outside this component) can deepen in step with the sub-nav.
      document.body.toggleAttribute('data-scrolled', v)
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  // Re-establish the previous session on load (silent, no popup) — handles the return from /auth.
  useEffect(() => {
    void restore()
  }, [restore])

  // Keep the input in sync with the URL so deep-links, refresh, and back/forward all reflect the
  // active query in the box (the previous local-only state left it blank on /items?q=…).
  useEffect(() => {
    cancelDebounce()
    setQ(urlQuery)
    setDebounced(urlQuery)
  }, [urlQuery])

  // A keystroke's pending debounce must never outlive what the box shows: the timer is dropped by
  // clearing, by a search, by a URL change, and on unmount.
  useEffect(() => cancelDebounce, [])

  // Close the dropdown on outside-click or Escape (same pattern as CartPopover).
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  function openDropdown() {
    setRecent(getRecentSearches())
    setActiveIndex(NO_ACTIVE_ROW)
    setOpen(true)
  }

  // A new list under the keyboard — a new answer, or recent searches instead of results — starts unpositioned.
  const onRows = useCallback((next: SuggestionRow[]) => {
    setRows(next)
    setActiveIndex(NO_ACTIVE_ROW)
  }, [])

  // Full search → land on /items filtered by the query, remember it, close the panel. A new search or a
  // search from another page is pushed, so "back" returns to the previous one; repeating exactly the
  // current destination replaces it (see lib/searchHistory). Enter, "See all", a recent and a popular
  // search all come through here.
  function runSearch(value: string) {
    cancelDebounce()
    const trimmed = value.trim()
    setOpen(false)
    if (trimmed) recordSearch(trimmed)
    const target = trimmed ? `/items?q=${encodeURIComponent(trimmed)}` : '/items'
    navigate(target, { replace: searchHistoryMode({ pathname, search: locationSearch }, target) === 'replace' })
  }

  function onSelectItem(item: CatalogItem, choice: SuggestionChoice) {
    setOpen(false)
    if (q.trim()) recordSearch(q.trim())
    track('Shop Search Suggestion Clicked', suggestionClickedProps({ query: q, ...choice }, { item_id: item.id }))
    // A token row → /token, a catalog row → /item (see lib/routes detailRouteFor).
    const detailPath = detailRouteFor(item)
    if (detailPath) {
      navigate(detailPath, { state: { item, tradeId: item.tradeId } })
    } else {
      runSearch(q)
    }
  }

  function onSelectCollection(collection: CollectionHit, choice: SuggestionChoice) {
    setOpen(false)
    if (q.trim()) recordSearch(q.trim())
    track(
      'Shop Search Suggestion Clicked',
      suggestionClickedProps({ query: q, ...choice }, { contract_address: collection.contractAddress })
    )
    navigate(`/collection/${collection.contractAddress}`)
  }

  function onSelectCreator(creator: CreatorHit, choice: SuggestionChoice) {
    setOpen(false)
    if (q.trim()) recordSearch(q.trim())
    track(
      'Shop Search Suggestion Clicked',
      suggestionClickedProps({ query: q, ...choice }, { creator_address: creator.address })
    )
    navigate(`/items/creator/${creator.address}`)
  }

  function cancelDebounce() {
    if (searchTimer.current) clearTimeout(searchTimer.current)
    searchTimer.current = undefined
  }

  function onSearchChange(value: string) {
    setQ(value)
    setOpen(true)
    setActiveIndex(NO_ACTIVE_ROW)
    cancelDebounce()
    searchTimer.current = setTimeout(() => setDebounced(value.trim()), 300)
  }

  // Clearing is about the box: it empties it, closes the panel and hands focus back. Only on the results
  // page does it also drop the query from the URL (keeping the other filters), because the grid is
  // showing that query. It used to send everyone to /items, wherever they were. Only ever a reader's
  // action — the button or Escape — and reported as such when there was text to clear.
  function clearSearch() {
    cancelDebounce()
    if (q.trim()) track('Shop Cleared Search', clearedSearchProps(pathname))
    setQ('')
    setDebounced('')
    setOpen(false)
    setActiveIndex(NO_ACTIVE_ROW)
    searchInputRef.current?.focus()
    const target = clearedSearchUrl(pathname, locationSearch)
    if (target) navigate(target, { replace: true })
  }

  function removeRecent(term: string) {
    removeRecentSearch(term)
    setRecent(getRecentSearches())
  }
  function clearRecent() {
    clearRecentSearches()
    setRecent([])
  }

  // The keys, decided by lib/suggestionNavigation: arrows over the rows while the panel is open, Home
  // and End only once a row is active (until then they move the caret), Enter on the active row or as a
  // search, Escape to put the panel away and, pressed again, to clear the box the way the button does
  // (a search field would clear itself on Escape, but without dropping the query from the URL). Modifiers
  // and IME composition are the text's, never ours.
  function onSearchKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    const action = searchKeyAction(
      {
        key: e.key,
        altKey: e.altKey,
        ctrlKey: e.ctrlKey,
        metaKey: e.metaKey,
        shiftKey: e.shiftKey,
        isComposing: e.nativeEvent.isComposing
      },
      { open, activeIndex, count: rows.length }
    )
    if (!action) return
    switch (action.type) {
      case 'move':
        e.preventDefault()
        setActiveIndex(action.index)
        return
      case 'activate':
        e.preventDefault()
        rows[activeIndex]?.activate('keyboard')
        return
      case 'submit':
        runSearch(q)
        return
      case 'close':
        e.preventDefault()
        setOpen(false)
        setActiveIndex(NO_ACTIVE_ROW)
        return
      case 'clear':
        if (!q) return
        e.preventDefault()
        clearSearch()
        return
    }
  }

  const activeRowId = open ? (rows[activeIndex]?.id ?? null) : null

  return (
    <>
      <TopNav
        iap={iap}
        activePage="shop"
        isSignedIn={!!session}
        isSigningIn={connecting}
        isLoadingProfile={!!session && isLoadingProfile}
        address={address}
        avatar={avatar}
        onClickSignIn={() => signIn()}
        onClickSignOut={() => void disconnect()}
        shopCreditsBalance={shopCredits}
        // The balance chip in the global row is itself a doorway to the pack picker. Undefined inside the iOS
        // web view, so the number still shows (it is the buyer's own balance) without being a way to buy more.
        onClickShopCredits={iap ? undefined : () => navigate('/credits')}
        manaBalances={manaBalances}
        showManaBalancesInNavbar
        // The chain pill goes INSIDE the profile panel, which is where the marketplace has it and where
        // ui2's own UserCardPanel renders it once these three props are passed. Nothing is passed for a
        // managed (web2) wallet: `useWalletChain` is given null, so it never asks the wallet where it is,
        // `chains` stays empty and ui2 hides the pill. Those users have no network to choose — every rail
        // they touch is a relayed signature that works from any chain.
        selectedChain={chainId}
        chains={chains}
        onSelectChain={chain => void switchTo(chain)}
        notificationSlot={
          // The app delivers its own notifications, so the bell is a duplicate the web view must not add.
          session && !iap ? (
            <S.NavSlot>
              {/* A ui2 notification row can throw while rendering (e.g. one with an unparseable date →
                 formatDistanceToNow "Invalid time value"). Isolate it so a bad item renders nothing
                 instead of white-screening the whole navbar/app. */}
              <Sentry.ErrorBoundary fallback={<></>}>
                <CssVarsProvider theme={ui2Light} defaultMode="light">
                  <Suspense fallback={null}>
                    <NotificationsBell />
                  </Suspense>
                </CssVarsProvider>
              </Sentry.ErrorBoundary>
            </S.NavSlot>
          ) : undefined
        }
      />

      {/* Shop sub-nav (sections + search + cart) — the row under the global DCL navbar. */}
      {hidesSubnav ? null : (
        <S.Subnav data-testid="subnav" data-iap={iap || undefined} data-scrolled={scrolled || undefined}>
          <S.Tabs data-testid="subnav-tabs">
            <NavLink to="/overview">{t('nav.overview')}</NavLink>
            {/* The seasonal event, between Overview and Collectibles — the same place the marketplace puts
                it. Its LABEL is content, not UI copy: it is whatever the campaign is called, so it never
                goes through t(). Shown only once the event is known to have collections in it; an event tab
                that opens an empty grid is worse than no tab. */}
            {eventTab ? (
              <NavLink to="/event" data-testid="nav-event" data-event>
                {eventTab}
              </NavLink>
            ) : null}
            {/* Collectibles stays active across the item detail / collection / creator pages too (they're
               all part of browsing collectibles), not just the /items grid. */}
            <NavLink to="/items" className={() => (collectiblesActive ? 'active' : '')}>
              {t('nav.collectibles')}
            </NavLink>
            {/* The app has the buyer's items in its own backpack, so the shop's copy is a second front door
               to somewhere they are already standing. */}
            {iap ? null : <NavLink to="/my-items">{t('nav.myAssets')}</NavLink>}
            {session ? <NavLink to="/activity">{t('nav.activity')}</NavLink> : null}
            {/* The creator's own dashboard. Behind its flag AND behind having published something: to a
               buyer the page is an empty room, and a nav entry that leads to one is worse than none. */}
            {session && myStoreEnabled && isCreator ? (
              <NavLink to="/my-store" data-testid="nav-my-store">
                {t('myStore.title')}
              </NavLink>
            ) : null}
            {/* Studio entry for the outfit team only — cosmetic gate, the server allowlist is the real one. */}
            {isOutfitCreator ? (
              <NavLink to="/outfits/manage" data-testid="nav-outfits">
                {t('nav.outfits')}
              </NavLink>
            ) : null}
          </S.Tabs>

          <S.MobileDivider />

          {/* Rendered as nothing rather than hidden with CSS: a visually-hidden input is still focusable and
             still in the tab order, so on My Items the keyboard would land in a search box nobody can see. */}
          {hidesGlobalSearch ? null : (
            <S.Search ref={wrapRef} data-iap={iap || undefined}>
              <Icon name="search" color={theme.colors.softWhite} />
              <input
                ref={searchInputRef}
                type="search"
                enterKeyHint="search"
                role="combobox"
                aria-expanded={open}
                // Only while the listbox exists: a reference to a node that is not there is worse than none.
                aria-controls={open ? SUGGESTIONS_LISTBOX_ID : undefined}
                aria-autocomplete="list"
                aria-activedescendant={activeRowId ?? undefined}
                value={q}
                aria-label={t('nav.searchAria')}
                placeholder={
                  // The web view's field is a third narrower (it shares its row), so the design gives it
                  // wording to match rather than the web's list of everything that is searchable.
                  iap ? t('nav.searchPlaceholderIap') : t('nav.searchPlaceholder')
                }
                onChange={e => onSearchChange(e.target.value)}
                onFocus={openDropdown}
                onKeyDown={onSearchKeyDown}
              />
              {q ? (
                <S.SearchClear
                  type="button"
                  data-testid="subnav-search-clear"
                  aria-label={t('search.clear')}
                  onClick={clearSearch}
                >
                  <Icon name="close" size={14} data-testid="subnav-search-clear-icon" />
                </S.SearchClear>
              ) : null}
              {open ? (
                <SearchDropdown
                  query={debounced}
                  recent={recent}
                  activeId={activeRowId}
                  onRows={onRows}
                  onSelectItem={onSelectItem}
                  onSelectCollection={onSelectCollection}
                  onSelectCreator={onSelectCreator}
                  onRunSearch={runSearch}
                  onRemoveRecent={removeRecent}
                  onClearRecent={clearRecent}
                />
              ) : null}
            </S.Search>
          )}
          {/* Inside the iOS app's web view the app sells credits through In-App Purchase, so the Shop must
             not offer to sell them. This is the main entrance; the others are gated the same way (the
             checkout modals, and the /credits route itself for a direct hit). */}
          {/* Sits beside GET CREDITS on purpose: the balance it explains is the one in the row above, and
             this is the nearest surface the Shop owns (the chip itself is rendered by decentraland-ui2).
             Renders nothing unless the buyer actually has credits held. */}
          <HeldCredits held={balance?.held} />
          {iap ? null : (
            <S.Credits to="/credits">
              <S.CreditsIco />
              {t('nav.getCredits', { currency: CURRENCY.name })}
            </S.Credits>
          )}
          <S.Fav to="/my-favorites" aria-label={t('nav.myFavorites')}>
            <S.FavIcons>
              <S.FavOutline name="heart" size={28} aria-hidden />
              <S.FavFill name="heart-solid" size={28} aria-hidden />
            </S.FavIcons>
          </S.Fav>
          <S.CartWrap>
            {/* Cart icon opens the cart drawer (open-on-icon) — including on an empty cart, which shows the
               drawer's own empty state rather than navigating the shopper off the page they're browsing. */}
            <S.Cart type="button" data-testid="subnav-cart" aria-label={t('nav.cart')} onClick={() => openCart(true)}>
              <S.CartIcons data-filled={cartCount > 0 || undefined}>
                <S.CartOutline name="cart" size={28} aria-hidden />
                <S.CartFill name="cart-solid" size={28} aria-hidden />
              </S.CartIcons>
              {cartCount > 0 ? <S.CartBadge data-testid="subnav-cart-badge">{cartCount}</S.CartBadge> : null}
            </S.Cart>
            <CartPopover />
          </S.CartWrap>
        </S.Subnav>
      )}
    </>
  )
}
