import { useEffect, useRef, useState } from 'react'
import { NavLink, useNavigate, useSearchParams } from 'react-router-dom'
import { TopNav } from '~/components/TopNav'
import { useWallet } from '~/store/wallet'
import { useProfile } from '~/hooks/useProfile'
import { useBalance } from '~/hooks/useBalance'
import { useCart } from '~/store/cart'
import { CartPopover } from '~/components/CartPopover'
import { SearchDropdown } from '~/components/SearchDropdown'
import { CurrencyIcon } from '~/components/CurrencyIcon'
import { CURRENCY } from '~/lib/currency'
import { getRecentSearches, recordSearch, removeRecentSearch, clearRecentSearches } from '~/lib/recent-searches'
import { track } from '~/lib/analytics'
import type { CatalogItem } from '~/lib/api'
import type { CollectionHit, CreatorHit } from '~/lib/search'
import { t } from '~/intl/i18n'
import CloseIcon from '@mui/icons-material/CloseRounded'

export function NavBar() {
  const { session, connecting, signIn, disconnect, restore } = useWallet()
  const address = session?.address
  const { data: avatar, isLoading: isLoadingProfile } = useProfile(address)
  const { data: balance } = useBalance(session)
  const cartCount = useCart(s => s.items.length)
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
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
      replace: true,
    })
  }

  function onSelectItem(item: CatalogItem) {
    setOpen(false)
    if (q.trim()) recordSearch(q.trim())
    track('Shop Search Suggestion Clicked', {
      query: q.trim(),
      type: 'item',
      item_id: item.id,
    })
    // Secondary listings carry tokenId; catalog items carry itemId — mirror AssetCard's route segment.
    const routeSeg = item.tokenId ?? item.itemId
    if (item.contractAddress && routeSeg) {
      navigate(`/item/${item.contractAddress}/${routeSeg}`, {
        state: { item, tradeId: item.tradeId },
      })
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
      contract_address: collection.contractAddress,
    })
    navigate(`/collection/${collection.contractAddress}`)
  }

  function onSelectCreator(creator: CreatorHit) {
    setOpen(false)
    if (q.trim()) recordSearch(q.trim())
    track('Shop Search Suggestion Clicked', {
      query: q.trim(),
      type: 'creator',
      creator_address: creator.address,
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
      />

      {/* Shop sub-nav (sections + search + cart) — the row under the global DCL navbar. */}
      <div className="subnav">
        <nav className="subnav__tabs">
          <NavLink to="/overview">{t('nav.overview')}</NavLink>
          <NavLink to="/assets">{t('nav.collectibles')}</NavLink>
          <NavLink to="/market">{t('nav.market')}</NavLink>
          <NavLink to="/my-assets">{t('nav.myAssets')}</NavLink>
          <NavLink to="/my-favorites">{t('nav.myFavorites')}</NavLink>
          {session ? <NavLink to="/my-purchases">{t('nav.myPurchases')}</NavLink> : null}
        </nav>
        <div className="subnav__search" ref={wrapRef}>
          <span className="ico ico-search subnav__search-ico" aria-hidden />
          <input
            value={q}
            aria-label={t('nav.searchAria')}
            placeholder={t('nav.searchPlaceholder')}
            onChange={e => onSearchChange(e.target.value)}
            onFocus={openDropdown}
            onKeyDown={onSearchKeyDown}
          />
          {q ? (
            <button type="button" className="subnav__search-clear" aria-label={t('search.clear')} onClick={clearSearch}>
              <CloseIcon />
            </button>
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
        </div>
        {session ? (
          <span className="subnav__balance" title={t('nav.yourBalance', { currency: CURRENCY.name })}>
            <CurrencyIcon className="subnav__balance-ico" />
            {balance?.credits ?? 0}
          </span>
        ) : null}
        <NavLink to="/credits" className="subnav__credits">
          <CurrencyIcon className="subnav__credits-ico" />
          {t('nav.getCredits', { currency: CURRENCY.name })}
        </NavLink>
        <div className="subnav__cart-wrap">
          <NavLink to="/cart" className="subnav__cart" aria-label={t('nav.cart')}>
            <span className="ico ico-cart" aria-hidden />
            {cartCount > 0 ? <span className="subnav__cart-badge">{cartCount}</span> : null}
          </NavLink>
          <CartPopover />
        </div>
      </div>
    </>
  )
}
