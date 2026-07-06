import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { PreviewEmote, PreviewType } from '@dcl/schemas'
import { WearablePreview } from '~/components/LazyWearablePreview'
import { useCart } from '~/store/cart'
import { useWallet } from '~/store/wallet'
import { useProfile } from '~/hooks/useProfile'
import { config } from '~/config'
import { CurrencyIcon } from '~/components/CurrencyIcon'
import { CURRENCY } from '~/lib/currency'
import { track } from '~/lib/analytics'
import { isWearable, slotOf, defaultWorn, toggleWorn, conflictingIds, wornUrns } from '~/lib/outfit'

// Turn a wearable sub-category into a human label ("upper_body" → "Upper body").
function slotLabel(slot: string | null): string {
  if (!slot || slot.startsWith('unknown:')) return 'Wearable'
  return slot.charAt(0).toUpperCase() + slot.slice(1).replace(/_/g, ' ')
}

// The fitting room: mounts the cart's wearables on one avatar and lets the shopper toggle each in/out
// to compare combinations. Two items in the same avatar slot can't be worn together, so equipping one
// auto-swaps the other (see lib/outfit.ts). Emotes can't be worn — they're listed but not equippable.
export function FittingRoom() {
  const open = useCart(s => s.fittingOpen)
  const setOpen = useCart(s => s.setFittingOpen)
  const items = useCart(s => s.items)
  const remove = useCart(s => s.remove)
  const navigate = useNavigate()

  const address = useWallet(s => s.session?.address)
  // Only mount on the real avatar when it actually has published wearables — otherwise 'default' body
  // (mirrors ItemPreview; a real address with no avatar renders empty).
  const { data: avatar } = useProfile(address)
  const profile = address && avatar ? address : 'default'

  const [worn, setWorn] = useState<Set<string>>(() => defaultWorn(items))
  const [previewReady, setPreviewReady] = useState(false)

  // (Re)seed the equipped set to a conflict-free default each time the room opens.
  useEffect(() => {
    if (open) setWorn(defaultWorn(items))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // Prune worn ids that leave the cart (removed while the room is open).
  useEffect(() => {
    const ids = new Set(items.map(i => i.id))
    setWorn(prev => {
      const next = new Set([...prev].filter(id => ids.has(id)))
      return next.size === prev.size ? prev : next
    })
  }, [items])

  const conflicts = useMemo(() => conflictingIds(items), [items])
  const urns = useMemo(() => wornUrns(items, worn), [items, worn])
  const total = items.reduce((sum, i) => sum + i.priceCredits, 0)

  // Fire the funnel event once per open (deduped across re-renders).
  const trackedRef = useRef(false)
  useEffect(() => {
    if (!open) {
      trackedRef.current = false
      return
    }
    if (trackedRef.current) return
    trackedRef.current = true
    track('Shop Tried On Outfit', {
      cart_size: items.length,
      wearables: items.filter(isWearable).length,
      emotes: items.filter(i => !isWearable(i)).length,
      cart_value_credits: total
    })
  }, [open, items, total])

  // Esc to close.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, setOpen])

  if (!open || items.length === 0) return null

  return (
    <div className="fitting" role="dialog" aria-modal="true" aria-label="Fitting room">
      <div className="fitting__scrim" onClick={() => setOpen(false)} />
      <div className="fitting__panel">
        <button className="fitting__close" onClick={() => setOpen(false)} aria-label="Close">×</button>

        <div className="fitting__stage">
          {urns.length > 0 ? (
            <>
              {/* Key on the outfit signature so the preview always reflects the equipped set. */}
              <WearablePreview
                key={`${profile}|${urns.join(',')}`}
                profile={profile}
                urns={urns}
                type={PreviewType.AVATAR}
                emote={PreviewEmote.FASHION}
                background="ecebed"
                disableFadeEffect
                dev={config.chainId === 80002}
                onLoad={() => setPreviewReady(true)}
              />
              {!previewReady ? <div className="fitting__loading" aria-hidden><span className="fitting__spinner" /></div> : null}
            </>
          ) : (
            <div className="fitting__empty-stage">
              <p>Nothing on right now.</p>
              <p className="muted">Turn on an item from the list to try it.</p>
            </div>
          )}
        </div>

        <div className="fitting__side">
          <div className="fitting__head">
            <h2 className="fitting__title">Fitting room</h2>
            <p className="fitting__sub muted">Mix and match your cart. Turn items on and off to see the look.</p>
          </div>

          <div className="fitting__items">
            {items.map(item => {
              const wearable = isWearable(item)
              const on = worn.has(item.id)
              const conflicted = conflicts.has(item.id)
              return (
                <div className={`fitting-row${on ? ' is-on' : ''}`} key={item.id}>
                  <label className="fitting-row__toggle">
                    <input
                      type="checkbox"
                      checked={on}
                      disabled={!wearable}
                      onChange={() => setWorn(prev => toggleWorn(prev, item, items))}
                    />
                    <span className="fitting-row__box" aria-hidden />
                  </label>
                  <div className="fitting-row__thumb">{item.thumbnail ? <img src={item.thumbnail} alt={item.name} /> : null}</div>
                  <div className="fitting-row__info">
                    <div className="fitting-row__name" title={item.name}>{item.name}</div>
                    <div className="fitting-row__meta">
                      <span className="fitting-row__slot">{wearable ? slotLabel(slotOf(item)) : 'Emote'}</span>
                      {conflicted ? <span className="fitting-row__conflict" title="Only one item per slot can be worn">shares a slot</span> : null}
                    </div>
                  </div>
                  <div className="fitting-row__price"><CurrencyIcon className="fitting-row__diamond" />{item.priceCredits}</div>
                  <button className="fitting-row__remove" onClick={() => remove(item.id)} aria-label={`Remove ${item.name} from cart`}>Remove</button>
                </div>
              )
            })}
          </div>

          <div className="fitting__foot">
            <div className="fitting__total">
              {items.length} item{items.length > 1 ? 's' : ''} · <strong>{CURRENCY.symbol} {total}</strong>
            </div>
            <button
              className="btn btn--purple fitting__checkout"
              onClick={() => {
                setOpen(false)
                navigate('/cart')
              }}
            >
              Checkout
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
