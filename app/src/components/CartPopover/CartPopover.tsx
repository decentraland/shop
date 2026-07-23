import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { Icon } from '~/components/Icon'
import { CheckCircleIcon } from '~/components/Icons/CheckCircleIcon'
import { useCart } from '~/store/cart'
import { t } from '~/intl/i18n'
import { formatCredits, formatCreditsFull } from '~/lib/currency'
import type { CatalogItem } from '~/lib/api'
import * as S from './CartPopover.styles'

// A single cart line: thumbnail (+ in-cart check), name, creator, quantity stepper, price, delete.
// The store keeps exactly one unit per item, so the stepper is visual: minus removes the line, plus
// is inert (no multi-quantity support). The trash button is the primary removal affordance.
function CartRow({ item, onRemove }: { item: CatalogItem; onRemove: (id: string) => void }) {
  return (
    <S.Card>
      <S.Thumb>
        {item.thumbnail ? <img src={item.thumbnail} alt={item.name} /> : null}
        <S.ThumbCheck>
          <CheckCircleIcon />
        </S.ThumbCheck>
      </S.Thumb>
      <S.Info>
        <div>
          <S.Name title={item.name}>{item.name}</S.Name>
          {item.creator ? <S.By address={item.creator} /> : null}
        </div>
        <S.RowBottom>
          <S.Stepper>
            <S.Step onClick={() => onRemove(item.id)} aria-label={t('cartPopover.removeFromCart', { name: item.name })}>
              <Icon name="minus" size={16} />
            </S.Step>
            <S.Qty>1</S.Qty>
            <S.Step disabled aria-label={t('cartPopover.increaseQuantity')}>
              <Icon name="plus-thin" size={16} />
            </S.Step>
          </S.Stepper>
          <S.Price title={formatCreditsFull(item.priceCredits)}>
            <S.Diamond />
            {formatCredits(item.priceCredits)}
          </S.Price>
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
  const panelRef = useRef<HTMLDivElement>(null)

  const total = items.reduce((sum, i) => sum + i.priceCredits, 0)
  const count = items.length

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
              <CartRow key={i.id} item={i} onRemove={remove} />
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
