import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { NavLink, useNavigate, useSearchParams, useLocation } from 'react-router-dom'
import * as Sentry from '@sentry/react'
import { Experimental_CssVarsProvider as CssVarsProvider } from '@mui/material/styles'
import { light as ui2Light } from 'decentraland-ui2/dist/theme'
import { Icon } from '~/components/Icon'
import { TopNav } from '~/components/TopNav'
import { useWallet } from '~/store/wallet'
import { useProfile } from '~/hooks/useProfile'
import { useIsOutfitCreator } from '~/hooks/useOutfits'
import { useBalance } from '~/hooks/useBalance'
import { useWalletChain } from '~/hooks/useWalletChain'
import { useManaBalance } from '~/hooks/useManaBalance'
import { manaWeiToNumber } from '~/lib/mana-format'
import { useCart } from '~/store/cart'
import { CartPopover } from '~/components/CartPopover'
import { SearchDropdown } from '~/components/SearchDropdown'
import { CURRENCY } from '~/lib/currency'
import { detailRouteFor } from '~/lib/routes'
import { showsWalletConfirmations } from '~/lib/wallet-kind'
import { getRecentSearches, recordSearch, removeRecentSearch, clearRecentSearches } from '~/lib/recent-searches'
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
  const address = session?.address
  const { data: avatar, isLoading: isLoadingProfile } = useProfile(address)
  const { data: balance, isError: balanceError, isLoading: balanceLoading } = useBalance(session)
  // Null for a managed (web2) wallet, so the hook never asks it where it is and ui2 hides its chain pill:
  // those users have no network to choose, every rail they touch being a relayed signature that works from
  // any chain — and network wording is what they must never be shown (CONVENTIONS.md).
  const { chainId, chains, switchTo } = useWalletChain(
    session && showsWalletConfirmations(session.providerType) ? session : null
  )
  // Polygon MANA the wallet already holds. Drives the navbar chip (rendered only when > 0) and, in the
  // buy flow, which payment rails are offered. No skeleton: an absent/zero balance renders nothing.
  const { data: manaBalanceWei } = useManaBalance(session)
  const cartCount = useCart(s => s.items.reduce((n, i) => n + i.quantity, 0))
  const openCart = useCart(s => s.setOpen)
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { pathname } = useLocation()
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
  const urlQuery = searchParams.get('q') ?? ''

  // Balances for the global ui2 navbar. Credits: undefined while loading/on error (hides the chip —
  // a dash would need a string prop), the loaded count (incl. 0) otherwise. MANA: only when the wallet
  // actually holds some, so the web2-first navbar shows no crypto by default.
  const shopCredits = session && !balanceLoading && !balanceError ? (balance?.credits ?? 0) : undefined
  const manaBalances =
    session && manaBalanceWei != null && manaBalanceWei > 0n ? { MATIC: manaWeiToNumber(manaBalanceWei) } : undefined

  // What the input shows (drives the box) and what the dropdown queries (debounced) are separate:
  // the box updates instantly on keystroke; the dropdown lags 300ms so we don't fetch every letter.
  const [q, setQ] = useState(urlQuery)
  const [debounced, setDebounced] = useState(urlQuery)
  const [open, setOpen] = useState(false)
  const [recent, setRecent] = useState<string[]>([])
  const searchTimer = useRef<ReturnType<typeof setTimeout>>()
  const wrapRef = useRef<HTMLDivElement>(null)

  // Re-establish the previous session on load (silent, no popup) — handles the return from /auth.
  useEffect(() => {
    void restore()
  }, [restore])

  // Keep the input in sync with the URL so deep-links, refresh, and back/forward all reflect the
  // active query in the box (the previous local-only state left it blank on /items?q=…).
  useEffect(() => {
    setQ(urlQuery)
    setDebounced(urlQuery)
  }, [urlQuery])

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
    setOpen(true)
  }

  // Full search → land on /items filtered by the query (replace so we don't spam history), remember
  // it, close the panel.
  function runSearch(value: string) {
    const trimmed = value.trim()
    setOpen(false)
    if (trimmed) recordSearch(trimmed)
    navigate(trimmed ? `/items?q=${encodeURIComponent(trimmed)}` : '/items', {
      replace: true
    })
  }

  function onSelectItem(item: CatalogItem) {
    setOpen(false)
    if (q.trim()) recordSearch(q.trim())
    track('Shop Search Suggestion Clicked', {
      query: q.trim(),
      type: 'item',
      item_id: item.id
    })
    // A token row → /token, a catalog row → /item (see lib/routes detailRouteFor).
    const detailPath = detailRouteFor(item)
    if (detailPath) {
      navigate(detailPath, { state: { item, tradeId: item.tradeId } })
    } else {
      runSearch(q)
    }
  }

  function onSelectCollection(collection: CollectionHit) {
    setOpen(false)
    if (q.trim()) recordSearch(q.trim())
    track('Shop Search Suggestion Clicked', {
      query: q.trim(),
      type: 'collection',
      contract_address: collection.contractAddress
    })
    navigate(`/collection/${collection.contractAddress}`)
  }

  function onSelectCreator(creator: CreatorHit) {
    setOpen(false)
    if (q.trim()) recordSearch(q.trim())
    track('Shop Search Suggestion Clicked', {
      query: q.trim(),
      type: 'creator',
      creator_address: creator.address
    })
    navigate(`/items/creator/${creator.address}`)
  }

  function onSearchChange(value: string) {
    setQ(value)
    setOpen(true)
    if (searchTimer.current) clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => setDebounced(value.trim()), 300)
  }

  function clearSearch() {
    setQ('')
    setDebounced('')
    setOpen(false)
    navigate('/items', { replace: true })
  }

  function removeRecent(term: string) {
    removeRecentSearch(term)
    setRecent(getRecentSearches())
  }
  function clearRecent() {
    clearRecentSearches()
    setRecent([])
  }

  function onSearchKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape') {
      setOpen(false)
      return
    }
    if (e.key === 'Enter') {
      if (searchTimer.current) clearTimeout(searchTimer.current)
      runSearch(q)
    }
  }

  return (
    <>
      <TopNav
        activePage="shop"
        isSignedIn={!!session}
        isSigningIn={connecting}
        isLoadingProfile={!!session && isLoadingProfile}
        address={address}
        avatar={avatar}
        onClickSignIn={() => signIn()}
        onClickSignOut={() => void disconnect()}
        shopCreditsBalance={shopCredits}
        onClickShopCredits={() => navigate('/credits')}
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
          session ? (
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
      <S.Subnav data-testid="subnav">
        <S.Tabs data-testid="subnav-tabs">
          <NavLink to="/overview">{t('nav.overview')}</NavLink>
          {/* Collectibles stays active across the item detail / collection / creator pages too (they're
              all part of browsing collectibles), not just the /items grid. */}
          <NavLink to="/items" className={() => (collectiblesActive ? 'active' : '')}>
            {t('nav.collectibles')}
          </NavLink>
          <NavLink to="/my-items">{t('nav.myAssets')}</NavLink>
          {session ? <NavLink to="/activity">{t('nav.activity')}</NavLink> : null}
          {/* Approvals are only meaningful for self-custody wallets; managed (web2) users never see wallet
              jargon (CONVENTIONS.md), so the entry point is hidden for them. */}
          {session && showsWalletConfirmations(session.providerType) ? (
            <NavLink to="/authorizations">{t('nav.authorizations')}</NavLink>
          ) : null}
          {/* Studio entry for the outfit team only — cosmetic gate, the server allowlist is the real one. */}
          {isOutfitCreator ? (
            <NavLink to="/outfits/manage" data-testid="nav-outfits">
              {t('nav.outfits')}
            </NavLink>
          ) : null}
        </S.Tabs>
        {/* Rendered as nothing rather than hidden with CSS: a visually-hidden input is still focusable and
            still in the tab order, so on My Items the keyboard would land in a search box nobody can see. */}
        {hidesGlobalSearch ? null : (
          <S.Search ref={wrapRef}>
            <Icon name="search" color={theme.colors.muted} />
            <input
              value={q}
              aria-label={t('nav.searchAria')}
              placeholder={t('nav.searchPlaceholder')}
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
        <S.Credits to="/credits">
          <S.CreditsIco />
          {t('nav.getCredits', { currency: CURRENCY.name })}
        </S.Credits>
        <S.Fav to="/my-favorites" aria-label={t('nav.myFavorites')}>
          <S.FavIcons>
            <S.FavOutline name="heart" size={28} aria-hidden />
            <S.FavFill name="heart-solid" size={28} aria-hidden />
          </S.FavIcons>
        </S.Fav>
        <S.CartWrap>
          {/* Cart icon opens the cart drawer (open-on-icon). With an empty cart there's nothing to show,
              so it falls back to navigating to the cart page. */}
          <S.Cart
            type="button"
            data-testid="subnav-cart"
            aria-label={t('nav.cart')}
            onClick={() => (cartCount > 0 ? openCart(true) : navigate('/cart'))}
          >
            <S.CartIcons data-filled={cartCount > 0 || undefined}>
              <S.CartOutline name="cart" size={28} aria-hidden />
              <S.CartFill name="cart-solid" size={28} aria-hidden />
            </S.CartIcons>
            {cartCount > 0 ? <S.CartBadge data-testid="subnav-cart-badge">{cartCount}</S.CartBadge> : null}
          </S.Cart>
          <CartPopover />
        </S.CartWrap>
      </S.Subnav>
    </>
  )
}
