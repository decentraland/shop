import { useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { useCart } from '~/store/cart'
import { CurrencyIcon } from '~/components/CurrencyIcon'

// Dropdown that pops from the cart icon when an item is added — immediate feedback + quick checkout.
// Auto-dismisses after a few seconds or on outside-click.
export function CartPopover() {
  const items = useCart(s => s.items)
  const open = useCart(s => s.open)
  const setOpen = useCart(s => s.setOpen)
  const ref = useRef<HTMLDivElement>(null)

  const total = items.reduce((sum, i) => sum + i.priceCredits, 0)

  useEffect(() => {
    if (!open) return
    const timer = setTimeout(() => setOpen(false), 4500)
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('mousedown', onDown)
    }
    // Re-arm the timer whenever the cart changes while open.
  }, [open, items.length, setOpen])

  if (!open || items.length === 0) return null

  return (
    <div className="cart-pop" ref={ref} role="dialog" aria-label="Cart">
      <div className="cart-pop__head">
        <span className="ico ico-cart" aria-hidden /> Added to cart
      </div>
      <div className="cart-pop__list">
        {items.slice(-4).map(i => (
          <div className="cart-pop__row" key={i.id}>
            <div className="cart-pop__thumb">{i.thumbnail ? <img src={i.thumbnail} alt={i.name} /> : null}</div>
            <div className="cart-pop__name" title={i.name}>{i.name}</div>
            <div className="cart-pop__price"><CurrencyIcon className="ccy-mark" /> {i.priceCredits}</div>
          </div>
        ))}
      </div>
      <div className="cart-pop__foot">
        <span className="cart-pop__total">
          {items.length} item{items.length > 1 ? 's' : ''} · <strong><CurrencyIcon className="ccy-mark" /> {total}</strong>
        </span>
        <Link className="btn btn--purple btn--sm" to="/cart" onClick={() => setOpen(false)}>
          Checkout
        </Link>
      </div>
    </div>
  )
}
