import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { NavLink, useNavigate, useSearchParams, useLocation } from 'react-router-dom'
import * as Sentry from '@sentry/react'
import { Experimental_CssVarsProvider as CssVarsProvider } from '@mui/material/styles'
import { light as ui2Light } from 'decentraland-ui2/dist/theme'
import { Icon } from '~/components/Icon'
import { TopNav } from '~/components/TopNav'
import { useWallet } from '~/store/wallet'
import { useProfile } from '~/hooks/useProfile'
import { useBalance, balanceLabel } from '~/hooks/useBalance'
import { useManaBalance } from '~/hooks/useManaBalance'
import { formatMana } from '~/lib/mana-format'
import manaSymbol from '~/assets/mana-matic.svg'
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

// The ui2 Notifications feature is MUI-based (it reads `theme.breakpoints`/palette from a MUI theme
// context), while the shop styles with emotion + its own tokens and mounts no MUI provider. So the
// bell is lazy-loaded (the heavy ui2 feature only when signed in) and wrapped in a scoped MUI
// CssVarsProvider carrying ui2's own theme — NOT ui2's ThemeProvider, which also injects a global
// CssBaseline reset that would clobber the shop's styles. The provider only defines namespaced
// `--mui-*` vars, so it doesn't leak into the rest of the app.
// Imported by concrete path, not through the folder's barrel: Rollup names a lazy chunk after its entry
// module, so going via index.ts would emit an anonymous `index-*.js` instead of `NotificationsBell-*.js`
// (same split either way — just far harder to spot in a bundle report).
const NotificationsBell = lazy(() => import('~/components/NotificationsBell/NotificationsBell'))

// ui2 renders the desktop notifications panel as `styled(Menu)`, and a MUI Menu is a Popover, which is a
// Modal — so by default it LOCKS PAGE SCROLL while open. MUI's lock does two things: `overflow: hidden` on
// body, and a compensating `padding-right` on body and on `.mui-fixed` elements. That padding is what
// visibly shifted the page: the fixed navbar was compensated and stayed put while everything inside body
// slid left, increasing toward the right (left-aligned tabs barely moved, right-aligned balances moved a
// full scrollbar width). `body.clientWidth` never changes, because clientWidth includes padding — which is
// why measuring it showed nothing.
//
// Freezing the page behind a DROPDOWN is wrong anyway, so turn the lock off for Menu only. The mobile panel
// is a full-screen `styled(Modal)` (name MuiModal, untouched here) and correctly keeps its lock.
const notificationsTheme = {
  ...ui2Light,
  components: {
    ...ui2Light.components,
    MuiMenu: {
      ...ui2Light.components?.MuiMenu,
      defaultProps: { ...ui2Light.components?.MuiMenu?.defaultProps, disableScrollLock: true }
    }
  }
}

export function NavBar() {
  const { session, connecting, signIn, disconnect, restore } = useWallet()
  const address = session?.address
  const { data: avatar, isLoading: isLoadingProfile } = useProfile(address)
  const { data: balance, isError: balanceError, isLoading: balanceLoading } = useBalance(session)
  // Polygon MANA the wallet already holds. Drives the navbar chip (rendered only when > 0) and, in the
  // buy flow, which payment rails are offered. No skeleton: an absent/zero balance renders nothing.
  const { data: manaBalanceWei } = useManaBalance(session)
  const cartCount = useCart(s => s.items.reduce((n, i) => n + i.quantity, 0))
  const openCart = useCart(s => s.setOpen)
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { pathname } = useLocation()
  // The Collectibles tab covers the whole browse surface: the grid (/assets), an item's detail page
  // (/item/* and /token/* — both render ItemDetail), a collection page (/collection/*) and a creator
  // page (/assets/creator/*, already under /assets). A NavLink to /assets alone wouldn't light up on
  // any of the detail/collection routes, so match them explicitly here.
  const collectiblesActive = /^\/(assets|item|token|collection)(\/|$)/.test(pathname)
  const urlQuery = searchParams.get('q') ?? ''

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
  // active query in the box (the previous local-only state left it blank on /assets?q=…).
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

  // Full search → land on /assets filtered by the query (replace so we don't spam history), remember
  // it, close the panel.
  function runSearch(value: string) {
    const trimmed = value.trim()
    setOpen(false)
    if (trimmed) recordSearch(trimmed)
    navigate(trimmed ? `/assets?q=${encodeURIComponent(trimmed)}` : '/assets', {
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
    navigate(`/assets/creator/${creator.address}`)
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
    navigate('/assets', { replace: true })
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
        notificationSlot={
          session ? (
            // The ui2 Notifications feature can throw while rendering (e.g. a notification with an
            // unparseable date → formatDistanceToNow "Invalid time value"). Isolate it so a bad item
            // renders nothing instead of white-screening the whole navbar/app.
            <Sentry.ErrorBoundary fallback={<></>}>
              <CssVarsProvider theme={notificationsTheme} defaultMode="light">
                <Suspense fallback={null}>
                  <NotificationsBell />
                </Suspense>
              </CssVarsProvider>
            </Sentry.ErrorBoundary>
          ) : undefined
        }
      />

      {/* Shop sub-nav (sections + search + cart) — the row under the global DCL navbar. */}
      <S.Subnav data-testid="subnav">
        <S.Tabs data-testid="subnav-tabs">
          <NavLink to="/overview">{t('nav.overview')}</NavLink>
          {/* Collectibles stays active across the item detail / collection / creator pages too (they're
              all part of browsing collectibles), not just the /assets grid. */}
          <NavLink to="/assets" className={() => (collectiblesActive ? 'active' : '')}>
            {t('nav.collectibles')}
          </NavLink>
          <NavLink to="/my-assets">{t('nav.myAssets')}</NavLink>
          {session ? <NavLink to="/activity">{t('nav.activity')}</NavLink> : null}
          {/* Approvals are only meaningful for self-custody wallets; managed (web2) users never see wallet
              jargon (CONVENTIONS.md), so the entry point is hidden for them. */}
          {session && showsWalletConfirmations(session.providerType) ? (
            <NavLink to="/authorizations">{t('nav.authorizations')}</NavLink>
          ) : null}
        </S.Tabs>
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
        {/* Polygon MANA balance — shown ONLY when the wallet actually holds MANA (any wallet type,
            managed ones included: a Magic/thirdweb account can hold MANA someone sent it). Sits to the
            LEFT of the credits balance: credits stay the headline currency, MANA is the extra the buyer
            happens to have. Hidden entirely at zero so the web2-first navbar shows no crypto by default. */}
        {session && manaBalanceWei != null && manaBalanceWei > 0n ? (
          <S.Mana data-testid="subnav-mana-balance" title={t('nav.polygonMana')}>
            <S.ManaIco src={manaSymbol} alt="" aria-hidden />
            {formatMana(manaBalanceWei)}
          </S.Mana>
        ) : null}
        {session ? (
          <S.Balance data-testid="subnav-balance" title={t('nav.yourBalance', { currency: CURRENCY.name })}>
            <S.BalanceIco />
            {balanceLoading ? <S.BalanceSkel className="skeleton" aria-hidden /> : balanceLabel(balance, balanceError)}
          </S.Balance>
        ) : null}
        <S.Credits to="/credits">
          <S.CreditsIco />
          {t('nav.getCredits', { currency: CURRENCY.name })}
        </S.Credits>
        <S.Fav to="/my-favorites" aria-label={t('nav.myFavorites')}>
          <Icon name="heart" size={28} />
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
            <Icon name="cart" size={28} />
            {cartCount > 0 ? <S.CartBadge data-testid="subnav-cart-badge">{cartCount}</S.CartBadge> : null}
          </S.Cart>
          <CartPopover />
        </S.CartWrap>
      </S.Subnav>
    </>
  )
}
