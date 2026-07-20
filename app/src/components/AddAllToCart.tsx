import { useCart, type AddToCartSource } from '~/store/cart'
import { useWallet } from '~/store/wallet'
import { isOwnListing } from '~/lib/ownership'
import { Button } from '~/components/Button'
import { CurrencyIcon } from '~/components/CurrencyIcon'
import { toast } from '~/store/toast'
import { t } from '~/intl/i18n'
import type { CatalogItem } from '~/lib/api'

// "Buy the set" bar for collection/creator pages: the total of the listed items + one-tap
// "add all to cart" (basket-building → lifts AOV). Only counts buyable (listed) items, skips any
// already in the cart, and — like the single cards — excludes YOUR OWN listings (you can't buy them;
// they'd otherwise poison the whole-cart checkout). Checkout resolves each item's trade the same as a
// single add.
export function AddAllToCart({ items, source }: { items: CatalogItem[]; source: AddToCartSource }) {
  const add = useCart(s => s.add)
  const cartIds = useCart(s => s.items.map(i => i.id))
  const address = useWallet(s => s.session?.address)
  const buyable = items.filter(i => i.priceCredits > 0 && !isOwnListing(i, address))
  if (buyable.length === 0) return null

  const inCart = new Set(cartIds)
  const toAdd = buyable.filter(i => !inCart.has(i.id))
  const total = buyable.reduce((n, i) => n + i.priceCredits, 0)

  function addAll() {
    toAdd.forEach(i => add(i, source))
    toast.success(t('addAll.added', { count: toAdd.length }))
  }

  return (
    <div className="addall">
      <span className="addall__summary">
        {t('addAll.forSale', { count: buyable.length })} · <CurrencyIcon className="addall__diamond" />{' '}
        {total.toLocaleString()}
      </span>
      <Button variant="purple" size="sm" onClick={addAll} disabled={toAdd.length === 0}>
        {toAdd.length === 0 ? t('addAll.allInCart') : t('addAll.addAll', { count: toAdd.length })}
      </Button>
    </div>
  )
}

export default AddAllToCart
