import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import { Icon } from '~/components/Icon'
import { useCart, type CartItem } from '~/store/cart'
import { CurrencyIcon } from '~/components/CurrencyIcon'
import { CreatorBadge } from '~/components/CreatorBadge'
import { t } from '~/intl/i18n'
import { formatCredits, formatCreditsFull } from '~/lib/currency'
import './CartPopover.css'

// Green check-in-circle used by the success banner and each cart line's thumbnail (Figma Icn/Check).
function CheckCircle() {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden focusable="false">
      <circle cx="10" cy="10" r="10" fill="#1ea672" />
      <path d="M5.8 10.3l2.7 2.7 5.7-6" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

// A single cart line: thumbnail (+ in-cart check), name, creator, quantity stepper, price, delete.
// PRIMARY (mint) lines support multiple copies — minus decrements (floored at 1), plus increments up
// to remaining stock, and the price shows the line subtotal. SECONDARY lines are a single unique
// token, so the stepper is hidden (qty is always 1). The trash button removes the whole line.
function CartRow({
  item,
  onRemove,
  onIncrement,
  onDecrement
}: {
  item: CartItem
  onRemove: (id: string) => void
  onIncrement: (id: string) => void
  onDecrement: (id: string) => void
}) {
  const isPrimary = !item.tokenId
  const qty = item.quantity
  const atStockCap = typeof item.available === 'number' && qty >= item.available
  const subtotal = item.priceCredits * qty
  return (
    <li className="cartd__card">
      <div className="cartd__thumb">
        {item.thumbnail ? <img src={item.thumbnail} alt={item.name} /> : null}
        <span className="cartd__thumb-check">
          <CheckCircle />
        </span>
      </div>
      <div className="cartd__info">
        <div>
          <div className="cartd__name" title={item.name}>
            {item.name}
          </div>
          {item.creator ? <CreatorBadge address={item.creator} className="cartd__by" /> : null}
        </div>
        <div className="cartd__rowbottom">
          {isPrimary ? (
            <div className="cartd__stepper">
              <button
                className="cartd__step"
                onClick={() => onDecrement(item.id)}
                disabled={qty <= 1}
                aria-label={t('cartPopover.decreaseQuantity', { name: item.name })}
              >
                <svg viewBox="0 0 16 16" fill="none" aria-hidden focusable="false">
                  <path d="M3.5 8h9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </button>
              <span className="cartd__qty">{qty}</span>
              <button
                className="cartd__step"
                onClick={() => onIncrement(item.id)}
                disabled={atStockCap}
                aria-label={t('cartPopover.increaseQuantity')}
              >
                <svg viewBox="0 0 16 16" fill="none" aria-hidden focusable="false">
                  <path d="M8 3.5v9M3.5 8h9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </button>
            </div>
          ) : null}
          <div className="cartd__price" title={formatCreditsFull(subtotal)}>
            <CurrencyIcon className="cartd__diamond" />
            {formatCredits(subtotal)}
          </div>
        </div>
      </div>
      <button
        className="cartd__del"
        onClick={() => onRemove(item.id)}
        aria-label={t('cartPopover.removeItem', { name: item.name })}
        title={t('cartPopover.remove')}
      >
        <Icon name="trash" />
      </button>
    </li>
  )
}

// The cart drawer (Figma "Add to cart drawer", node 1182-199895). A right-side slide-in panel that
// opens (a) when an item is added to the cart — with a success banner — and (b) when the cart icon in
// the nav is clicked (no banner). Its primary CTA goes to /cart (the checkout page).
export function CartPopover() {
  const items = useCart(s => s.items)
  const open = useCart(s => s.open)
  const justAddedCount = useCart(s => s.justAddedCount)
  const setOpen = useCart(s => s.setOpen)
  const remove = useCart(s => s.remove)
  const increment = useCart(s => s.increment)
  const decrement = useCart(s => s.decrement)
  const panelRef = useRef<HTMLDivElement>(null)

  const total = items.reduce((sum, i) => sum + i.priceCredits * i.quantity, 0)
  // Count reflects total units across all lines (Σ quantity), not the number of distinct lines.
  const count = items.reduce((n, i) => n + i.quantity, 0)

  // Escape closes the drawer (outside-click is handled by the scrim). No auto-dismiss: a full drawer
  // stays until the user dismisses it.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, setOpen])

  if (!open || count === 0) return null

  // Portal to <body> so the drawer escapes the nav's stacking context and overlays the whole viewport
  // (including the fixed global top nav), instead of being trapped under it.
  return createPortal(
    <div className="cartd" role="dialog" aria-modal="true" aria-label={t('cartPopover.dialogLabel')}>
      <div className="cartd__scrim" onClick={() => setOpen(false)} />
      <aside className="cartd__panel" ref={panelRef}>
        <header className="cartd__head">
          <h2 className="cartd__title">{t('cartPopover.title', { count })}</h2>
          <button className="cartd__close" onClick={() => setOpen(false)} aria-label={t('cartPopover.close')}>
            <svg viewBox="0 0 24 24" fill="none" aria-hidden focusable="false">
              <path d="M5 5l14 14M19 5L5 19" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </header>

        <div className="cartd__body">
          {justAddedCount > 0 ? (
            <div className="cartd__banner">
              <span className="cartd__banner-check">
                <CheckCircle />
              </span>
              <p>
                <strong>{t('cartPopover.bannerCount', { count: justAddedCount })}</strong>{' '}
                {t('cartPopover.bannerAdded')}
              </p>
            </div>
          ) : null}

          <ul className="cartd__list">
            {items.map(i => (
              <CartRow key={i.id} item={i} onRemove={remove} onIncrement={increment} onDecrement={decrement} />
            ))}
          </ul>
        </div>

        <footer className="cartd__foot">
          <div className="cartd__totalrow">
            <span className="cartd__total-label">{t('cartPopover.total', { count })}</span>
            <span className="cartd__total-val" title={formatCreditsFull(total)}>
              <CurrencyIcon className="cartd__total-diamond" />
              {formatCredits(total)}
            </span>
          </div>
          <div className="cartd__ctas">
            <Link className="cartd__cta cartd__cta--primary" to="/cart" onClick={() => setOpen(false)}>
              {t('cartPopover.goToCart')}
            </Link>
            <button className="cartd__cta cartd__cta--secondary" onClick={() => setOpen(false)}>
              {t('cartPopover.continueShopping')}
            </button>
          </div>
        </footer>
      </aside>
    </div>,
    document.body
  )
}
