import { useEffect, useRef, useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { TopNav } from '~/components/TopNav'
import { useWallet } from '~/store/wallet'
import { useProfile } from '~/hooks/useProfile'
import { useBalance } from '~/hooks/useBalance'
import { useCart } from '~/store/cart'
import { CartPopover } from '~/components/CartPopover'
import { CurrencyIcon } from '~/components/CurrencyIcon'
import { CURRENCY } from '~/lib/currency'
import { t } from '~/intl/i18n'

export function NavBar() {
  const { session, connecting, signIn, disconnect, restore } = useWallet()
  const address = session?.address
  const { data: avatar, isLoading: isLoadingProfile } = useProfile(address)
  const { data: balance } = useBalance(session)
  const cartCount = useCart(s => s.items.length)
  const navigate = useNavigate()
  const [q, setQ] = useState('')
  const searchTimer = useRef<ReturnType<typeof setTimeout>>()

  // Re-establish the previous session on load (silent, no popup) — handles the return from /auth.
  useEffect(() => {
    void restore()
  }, [restore])

  // Search → land on /assets filtered by the query (debounced so typing feels live, replace so we
  // don't spam history).
  function runSearch(value: string) {
    navigate(value.trim() ? `/assets?q=${encodeURIComponent(value.trim())}` : '/assets', { replace: true })
  }
  function onSearchChange(value: string) {
    setQ(value)
    if (searchTimer.current) clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => runSearch(value), 300)
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
        <div className="subnav__search">
          <span className="ico ico-search subnav__search-ico" aria-hidden />
          <input
            value={q}
            aria-label={t('nav.searchAria')}
            placeholder={t('nav.searchPlaceholder')}
            onChange={e => onSearchChange(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                if (searchTimer.current) clearTimeout(searchTimer.current)
                runSearch(q)
              }
            }}
          />
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
