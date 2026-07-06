import { useCart, type AddToCartSource } from '~/store/cart'
import { CurrencyIcon } from '~/components/CurrencyIcon'
import { toast } from '~/store/toast'
import type { CatalogItem } from '~/lib/api'

// "Buy the set" bar for collection/creator pages: the total of the listed items + one-tap
// "add all to cart" (basket-building → lifts AOV). Only counts buyable (listed) items and skips
// any already in the cart. Checkout resolves each item's trade the same as a single add.
export function AddAllToCart({ items, source }: { items: CatalogItem[]; source: AddToCartSource }) {
  const add = useCart(s => s.add)
  const cartIds = useCart(s => s.items.map(i => i.id))
  const buyable = items.filter(i => i.priceCredits > 0)
  if (buyable.length === 0) return null

  const inCart = new Set(cartIds)
  const toAdd = buyable.filter(i => !inCart.has(i.id))
  const total = buyable.reduce((n, i) => n + i.priceCredits, 0)

  function addAll() {
    toAdd.forEach(i => add(i, source))
    toast.success(`Added ${toAdd.length} item${toAdd.length === 1 ? '' : 's'} to your cart.`)
  }

  return (
    <div className="addall">
      <span className="addall__summary">
        {buyable.length} for sale · <CurrencyIcon className="addall__diamond" /> {total.toLocaleString()}
      </span>
      <button className="btn btn--purple btn--sm addall__cta" onClick={addAll} disabled={toAdd.length === 0}>
        {toAdd.length === 0 ? 'All in cart' : `Add all (${toAdd.length}) to cart`}
      </button>
    </div>
  )
}

export default AddAllToCart
