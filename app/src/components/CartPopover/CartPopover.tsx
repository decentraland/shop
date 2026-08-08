import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { Icon } from '~/components/Icon'
import { CheckCircleIcon } from '~/components/Icons/CheckCircleIcon'
import { useCart, type CartItem } from '~/store/cart'
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
  onDecrement
}: {
  item: CartItem
  status: CartLineAvailability
  onRemove: (id: string) => void
  onIncrement: (id: string) => void
  onDecrement: (id: string) => void
}) {
  const isPrimary = !item.tokenId
  const qty = item.quantity
  const atStockCap = typeof item.available === 'number' && qty >= item.available
  const subtotal = item.priceCredits * qty
  const unavailable = !isLineBuyable(status)
  const unavailableLabel = status === 'sold-out' ? t('cart.availability.soldOut') : t('cart.availability.unavailable')
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
            /* Warning + reason. The trash button remains the one-tap remove. */
            <S.Unavailable>
              <S.Warn name="warning-fill" size={24} />
              {unavailableLabel}
            </S.Unavailable>
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

  if (!open) return null

  // An all-unavailable cart still lists its lines (with each reason) rather than reading as empty — the
  // guard is on the raw contents, not the buyable count.
  const isEmpty = items.length === 0

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
          {isEmpty ? (
            <S.Empty data-testid="cart-drawer-empty">
              <Icon name="cart-plus" size={92} />
              <S.EmptyText>
                <S.EmptyTitle>{t('cart.empty.title')}</S.EmptyTitle>
                <S.EmptyBody>{t('cart.empty.body')}</S.EmptyBody>
              </S.EmptyText>
              <S.EmptyCta to="/items" onClick={() => setOpen(false)}>
                {t('cart.empty.cta')}
              </S.EmptyCta>
            </S.Empty>
          ) : null}

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
              />
            ))}
          </S.List>
        </S.Body>

        {/* No total and nothing to check out on an empty cart — the empty state carries its own CTA. */}
        {isEmpty ? null : (
          <S.Foot>
            <S.TotalRow>
              <S.TotalLabel>{t('cartPopover.total', { count })}</S.TotalLabel>
              <S.TotalVal title={formatCreditsFull(total)}>
                <S.TotalDiamond />
                {formatCredits(total)}
              </S.TotalVal>
            </S.TotalRow>
            {/*
              Dismiss on the left, advance on the right — and advancing STOPS AT THE CART. Neither button
              carries `startCheckout`, so nothing here can begin a charge: a popover that appears from a
              hover is not a place to commit someone's money, and the cart has its own CHECKOUT for that,
              where the buyer can see what they are buying first.

              This was removed once (#300) and came back with a styling PR (#304) that overwrote the block.
              The spec beside this file pins it now, so the next sweep cannot delete it in silence.
            */}
            <S.Ctas>
              <S.CtaButton data-variant="secondary" type="button" onClick={() => setOpen(false)}>
                {t('cartPopover.continueShopping')}
              </S.CtaButton>
              <S.Cta data-variant="primary" to="/cart" onClick={() => setOpen(false)}>
                {t('cartPopover.goToCart')}
              </S.Cta>
            </S.Ctas>
          </S.Foot>
        )}
      </S.Panel>
    </S.Root>,
    document.body
  )
}
