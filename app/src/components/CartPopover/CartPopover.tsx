import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { Icon } from '~/components/Icon'
import { CheckCircleIcon } from '~/components/Icons/CheckCircleIcon'
import { useCart, type CartItem } from '~/store/cart'
import { detailRouteFor } from '~/lib/routes'
import { t } from '~/intl/i18n'
import { formatCredits, formatCreditsFull } from '~/lib/currency'
import { useCartAvailability } from '~/hooks/useCartAvailability'
import { isLineBuyable, type CartLineAvailability } from '~/lib/cart-availability'
import * as S from './CartPopover.styles'

// A single cart line: thumbnail (+ in-cart check), name, creator, quantity stepper, price, delete.
// PRIMARY (mint) lines support multiple copies — minus decrements (floored at 1), plus increments up to
// remaining stock, and the price shows the line subtotal. SECONDARY lines are a single unique token, so
// the stepper is hidden (qty is always 1). The trash button removes the whole line.
function CartRow({
  item,
  status,
  onRemove,
  onIncrement,
  onDecrement,
  onNavigate
}: {
  item: CartItem
  status: CartLineAvailability
  onRemove: (id: string) => void
  onIncrement: (id: string) => void
  onDecrement: (id: string) => void
  onNavigate: () => void
}) {
  const isPrimary = !item.tokenId
  const qty = item.quantity
  const atStockCap = typeof item.available === 'number' && qty >= item.available
  const subtotal = item.priceCredits * qty
  const unavailable = !isLineBuyable(status)
  const unavailableLabel = status === 'sold-out' ? t('cart.availability.soldOut') : t('cart.availability.unavailable')
  const detailPath = detailRouteFor(item)
  return (
    <S.Card data-unavailable={unavailable || undefined}>
      <S.Thumb data-thumb>
        {item.thumbnail ? <img src={item.thumbnail} alt={item.name} /> : null}
        <S.ThumbCheck data-check>
          <CheckCircleIcon />
        </S.ThumbCheck>
      </S.Thumb>
      <S.Info>
        <div data-desc>
          <S.Name title={item.name}>{item.name}</S.Name>
          {item.creator ? <S.By address={item.creator} /> : null}
        </div>
        <S.RowBottom>
          {unavailable ? (
            /* Warning + reason, plus a link to the item's resales. The trash button remains the
               one-tap remove. */
            <>
              <S.Unavailable>
                <S.Warn name="warning-fill" size={24} />
                {unavailableLabel}
              </S.Unavailable>
              {detailPath ? (
                <S.Resales to={detailPath} state={{ item, tradeId: item.tradeId }} onClick={onNavigate}>
                  {t('cart.availability.viewResales')}
                </S.Resales>
              ) : null}
            </>
          ) : (
            <>
              {isPrimary ? (
                <S.Stepper>
                  <S.Step
                    onClick={() => onDecrement(item.id)}
                    disabled={qty <= 1}
                    aria-label={t('cartPopover.decreaseQuantity', { name: item.name })}
                  >
                    <Icon name="minus" size={16} />
                  </S.Step>
                  <S.Qty>{qty}</S.Qty>
                  <S.Step
                    onClick={() => onIncrement(item.id)}
                    disabled={atStockCap}
                    aria-label={t('cartPopover.increaseQuantity')}
                  >
                    <Icon name="plus-thin" size={16} />
                  </S.Step>
                </S.Stepper>
              ) : null}
              <S.Price title={formatCreditsFull(subtotal)}>
                <S.Diamond />
                {formatCredits(subtotal)}
              </S.Price>
            </>
          )}
        </S.RowBottom>
      </S.Info>
      <S.Del
        onClick={() => onRemove(item.id)}
        aria-label={t('cartPopover.removeItem', { name: item.name })}
        title={t('cartPopover.remove')}
      >
        <Icon name="trash" />
      </S.Del>
    </S.Card>
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

  // Validate each line's live trade while the drawer is open (optimistic until resolved). Unavailable
  // lines stay visible with their reason but are excluded from the total and the unit count.
  const availability = useCartAvailability(items, open)

  const buyable = items.filter(i => isLineBuyable(availability[i.id]))
  const total = buyable.reduce((sum, i) => sum + i.priceCredits * i.quantity, 0)
  // Count reflects total buyable units (Σ quantity), not the number of distinct lines.
  const count = buyable.reduce((n, i) => n + i.quantity, 0)

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

  // Guard on the raw cart contents (not the buyable count) so an all-unavailable cart still shows the
  // drawer with each line's reason, rather than silently vanishing.
  if (!open || items.length === 0) return null

  // Portal to <body> so the drawer escapes the nav's stacking context and overlays the whole viewport
  // (including the fixed global top nav), instead of being trapped under it.
  return createPortal(
    <S.Root role="dialog" aria-modal="true" aria-label={t('cartPopover.dialogLabel')}>
      <S.Scrim onClick={() => setOpen(false)} />
      <S.Panel ref={panelRef}>
        <S.Head>
          <S.Title>{t('cartPopover.title', { count })}</S.Title>
          <S.Close onClick={() => setOpen(false)} aria-label={t('cartPopover.close')}>
            <Icon name="close" size={18} />
          </S.Close>
        </S.Head>

        <S.Body>
          {justAddedCount > 0 ? (
            <S.Banner>
              <S.BannerCheck>
                <CheckCircleIcon />
              </S.BannerCheck>
              <p>
                <strong>{t('cartPopover.bannerCount', { count: justAddedCount })}</strong>{' '}
                {t('cartPopover.bannerAdded')}
              </p>
            </S.Banner>
          ) : null}

          <S.List>
            {items.map(i => (
              <CartRow
                key={i.id}
                item={i}
                status={availability[i.id]}
                onRemove={remove}
                onIncrement={increment}
                onDecrement={decrement}
                onNavigate={() => setOpen(false)}
              />
            ))}
          </S.List>
        </S.Body>

        <S.Foot>
          <S.TotalRow>
            <S.TotalLabel>{t('cartPopover.total', { count })}</S.TotalLabel>
            <S.TotalVal title={formatCreditsFull(total)}>
              <S.TotalDiamond />
              {formatCredits(total)}
            </S.TotalVal>
          </S.TotalRow>
          <S.Ctas>
            <S.Cta data-variant="primary" to="/cart" onClick={() => setOpen(false)}>
              {t('cartPopover.goToCart')}
            </S.Cta>
            <S.CtaButton data-variant="secondary" onClick={() => setOpen(false)}>
              {t('cartPopover.continueShopping')}
            </S.CtaButton>
          </S.Ctas>
        </S.Foot>
      </S.Panel>
    </S.Root>,
    document.body
  )
}
