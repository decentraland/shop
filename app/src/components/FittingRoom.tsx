import { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react'
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
import { isWearable, slotOf, slotRegion, defaultWorn, toggleWorn, conflictingIds, wornUrns } from '~/lib/outfit'
import { avatarShape, dominantShape, itemShapes, shapeLabel, isCompatible, BASE_MALE } from '~/lib/bodyShape'
import { t } from '~/intl/i18n'

// Lazy so the WebGL backdrop (+ its shader and pattern texture) only loads when the room opens —
// it never touches the main bundle.
const AnimatedBackground = lazy(() => import('~/components/AnimatedBackground/AnimatedBackground'))

// Turn a wearable sub-category into a human label ("upper_body" → "Upper body").
function slotLabel(slot: string | null): string {
  if (!slot || slot.startsWith('unknown:')) return t('fittingRoom.wearable')
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
  // (mirrors ItemPreview; a real address with no avatar renders empty). Wait for the profile lookup to
  // settle before mounting so the preview loads ONCE with the final profile (no default→address reload).
  const { data: avatar, isFetched: profileFetched } = useProfile(address)
  const profileResolved = !address || profileFetched
  const hasAvatar = !!address && !!avatar
  const profile = hasAvatar ? address : 'default'

  // The body shape we dress: the connected avatar's shape if any, else the cart's majority shape, else
  // male. Items the target body can't wear are skipped (they'd render invisible) and flagged in the list.
  const target = avatarShape(avatar) ?? dominantShape(items) ?? BASE_MALE

  const [worn, setWorn] = useState<Set<string>>(() => defaultWorn(items, target))
  const [previewReady, setPreviewReady] = useState(false)

  // (Re)seed the equipped set to a conflict-free, shape-compatible default when the room opens or the
  // target shape settles (e.g. the avatar profile resolves after opening).
  useEffect(() => {
    if (open) setWorn(defaultWorn(items, target))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, target])

  // Prune worn ids that leave the cart (removed while the room is open).
  useEffect(() => {
    const ids = new Set(items.map(i => i.id))
    setWorn(prev => {
      const next = new Set([...prev].filter(id => ids.has(id)))
      return next.size === prev.size ? prev : next
    })
  }, [items])

  const conflicts = useMemo(() => conflictingIds(items), [items])
  const urns = useMemo(() => wornUrns(items, worn, target), [items, worn, target])
  const total = items.reduce((sum, i) => sum + i.priceCredits * i.quantity, 0)

  // The WearablePreview iframe rebuilds its src (and reloads) whenever the equipped urns change, so
  // mask each reload with the loading overlay instead of letting the avatar flash to empty and back.
  const outfitSig = urns.join(',')
  useEffect(() => {
    setPreviewReady(false)
  }, [outfitSig, profile])

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
    <div className="fitting" role="dialog" aria-modal="true" aria-label={t('fittingRoom.title')}>
      <div className="fitting__scrim" onClick={() => setOpen(false)} />
      <div className="fitting__panel">
        <button className="fitting__close" onClick={() => setOpen(false)} aria-label={t('fittingRoom.close')}>
          ×
        </button>

        <div className="fitting__stage">
          {/* Animated purple vignette behind the avatar (transparent WearablePreview sits on top). */}
          <Suspense fallback={null}>
            <AnimatedBackground />
          </Suspense>
          {!profileResolved ? (
            <div className="fitting__loading" aria-hidden>
              <span className="fitting__spinner" />
            </div>
          ) : urns.length > 0 ? (
            <>
              {/* Stable key (profile) so toggling an item updates the SAME iframe (one reload, masked by
                  the overlay) instead of remounting it — which was the multi-flash on every change. */}
              <WearablePreview
                key={profile}
                profile={profile}
                // No connected avatar → dress a default mannequin of the target shape so gendered items
                // still render. With a real avatar, its own shape is the target, so no override needed.
                bodyShape={hasAvatar ? undefined : target}
                urns={urns}
                type={PreviewType.AVATAR}
                emote={PreviewEmote.FASHION}
                disableBackground
                disableFadeEffect
                dev={config.chainId === 80002}
                onLoad={() => setPreviewReady(true)}
              />
              {!previewReady ? (
                <div className="fitting__loading" aria-hidden>
                  <span className="fitting__spinner" />
                </div>
              ) : null}
            </>
          ) : (
            <div className="fitting__empty-stage">
              <p>{t('fittingRoom.emptyStageTitle')}</p>
              <p className="muted">{t('fittingRoom.emptyStageBody')}</p>
            </div>
          )}
        </div>

        <div className="fitting__side">
          <div className="fitting__head">
            <h2 className="fitting__title">{t('fittingRoom.title')}</h2>
            <p className="fitting__sub muted">{t('fittingRoom.sub')}</p>
          </div>

          <div className="fitting__items">
            {items.map(item => {
              const wearable = isWearable(item)
              // Wearable the target body can't wear → it can't be equipped (would render invisible); flag it.
              const incompatible = wearable && !isCompatible(item, target)
              const on = worn.has(item.id)
              const conflicted = conflicts.has(item.id)
              return (
                <div
                  className={`fitting-row${on ? ' is-on' : ''}${incompatible ? ' is-incompatible' : ''}`}
                  key={item.id}
                >
                  <label className="fitting-row__toggle">
                    <input
                      type="checkbox"
                      checked={on}
                      disabled={!wearable || incompatible}
                      onChange={() => setWorn(prev => toggleWorn(prev, item, items))}
                    />
                    <span className="fitting-row__box" aria-hidden />
                  </label>
                  <div className="fitting-row__thumb">
                    {item.thumbnail ? <img src={item.thumbnail} alt={item.name} /> : null}
                  </div>
                  <div className="fitting-row__info">
                    <div className="fitting-row__name" title={item.name}>
                      {item.name}
                    </div>
                    <div className="fitting-row__meta">
                      <span
                        className={`ico ico-slot-${wearable ? slotRegion(item) : 'item'} fitting-row__slot-ico`}
                        title={wearable ? slotLabel(slotOf(item)) : t('fittingRoom.emote')}
                        role="img"
                        aria-label={wearable ? slotLabel(slotOf(item)) : t('fittingRoom.emote')}
                      />
                      {conflicted && !incompatible ? (
                        <span className="fitting-row__conflict" title={t('fittingRoom.conflictTooltip')}>
                          {t('fittingRoom.onePerSlot')}
                        </span>
                      ) : null}
                      {incompatible ? (
                        <span
                          className="fitting-row__incompat"
                          title={t('fittingRoom.madeForShape', { shape: shapeLabel(itemShapes(item)[0]) })}
                        >
                          {t('fittingRoom.shapeOnly', { shape: shapeLabel(itemShapes(item)[0]) })}
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <div className="fitting-row__price">
                    <CurrencyIcon className="fitting-row__diamond" />
                    {item.priceCredits}
                  </div>
                  <button
                    className="fitting-row__remove"
                    onClick={() => remove(item.id)}
                    aria-label={t('fittingRoom.removeFromCart', { name: item.name })}
                    title={t('fittingRoom.remove')}
                  >
                    <span className="ico ico-trash" aria-hidden />
                  </button>
                </div>
              )
            })}
          </div>

          <div className="fitting__foot">
            <div className="fitting__total">
              {t('fittingRoom.itemCount', { count: items.length })} ·{' '}
              <strong>
                {CURRENCY.symbol} {total}
              </strong>
            </div>
            <button
              className="btn btn--purple fitting__checkout"
              onClick={() => {
                setOpen(false)
                navigate('/cart')
              }}
            >
              {t('fittingRoom.checkout')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
