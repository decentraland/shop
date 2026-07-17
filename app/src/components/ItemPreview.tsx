import { useEffect, useState } from 'react'
import { WearablePreview } from '~/components/LazyWearablePreview'
import { EmoteControls } from '~/components/LazyEmoteControls'
import { PreviewEmote, PreviewType } from '@dcl/schemas'
import { config } from '~/config'
import { useWallet } from '~/store/wallet'
import { useProfile } from '~/hooks/useProfile'
import { avatarShape, isCompatible, itemShapes, shapeLabel } from '~/lib/bodyShape'
import { t } from '~/intl/i18n'
import type { CatalogItem } from '~/lib/api'

// The hero preview. Wearables DEFAULT to the item shown ALONE (PreviewType.WEARABLE — no avatar, no
// emote), exactly how the marketplace item page loads (its try-on state starts OFF), so there's no odd
// default avatar pose. The "On avatar / Item" toggle flips to AVATAR (worn) + a FASHION pose.
// - emotes → no type (the preview app auto-detects + plays the emote on the avatar) + wheel zoom.
// One shared iframe with a STABLE id and NO React key — so navigating item→item (or toggling avatar/item)
// reloads the scene IN PLACE (the marketplace approach) instead of destroying + recreating the iframe,
// which flashed a visible double-load. The loader below covers every (re)load until onLoad fires.

export function ItemPreview({ item }: { item: CatalogItem }) {
  const address = useWallet(s => s.session?.address)
  // Feeding a real address that has NO published avatar renders an empty default look — so only
  // pass the address when useProfile confirms an avatar exists; otherwise fall back to 'default'.
  // WAIT for the profile fetch to settle before mounting the preview: otherwise it would mount with
  // 'default', then reload in place when the avatar resolves — a visible double-load. While it's
  // loading we show the loader below (mirrors the marketplace, which never mounts on a stub avatar).
  const { data: avatar, isLoading: profileLoading } = useProfile(address)
  const profile = address && avatar ? address : 'default'

  const isEmote = item.category === 'emote'
  // Default to the item shown alone (matches the marketplace) — the "On avatar" toggle opts into the worn view.
  const [view, setView] = useState<'avatar' | 'item'>('item')
  const itemAlone = !isEmote && view === 'item'
  // The item-alone view needs no avatar, so it can render immediately; only the avatar/emote views wait for
  // the profile fetch to settle (so they mount once with the final avatar rather than default→avatar reload).
  const profileReady = itemAlone || !profileLoading

  // Cover every (re)load with a loader so the iframe never flickers raw (like the marketplace's
  // Loader overlay + onLoad). Reset to loading whenever the preview will actually reload: a new item
  // (key change → remount) or the on-avatar/item toggle (in-place scene reload).
  const [previewLoading, setPreviewLoading] = useState(true)
  useEffect(() => {
    setPreviewLoading(true)
  }, [item.id, itemAlone])

  // Body-shape compatibility: mount on the CONNECTED avatar only when it supports the item's shape.
  // Otherwise (no avatar, or an incompatible one) preview on a default mannequin of a shape the item
  // DOES support — so a female-only item never renders invisible on a male avatar (and vice-versa).
  const hasAvatar = !!address && !!avatar
  const compatibleAvatar = hasAvatar && isCompatible(item, avatarShape(avatar))
  const mannequinShape = itemShapes(item)[0]
  // Only flag it when the user HAS an avatar the item doesn't fit — a logged-out default mannequin needs
  // no explanation. Emotes are shape-agnostic, so never flagged.
  const incompatible = hasAvatar && !compatibleAvatar && !isEmote

  return (
    <>
      {/* Gate on the profile fetch so we mount ONCE with the final avatar (no default→avatar reload). */}
      {profileReady ? (
        <WearablePreview
          id="shop-item-preview"
          contractAddress={item.contractAddress}
          // secondary listings carry tokenId; catalog/mint items carry itemId — never both.
          tokenId={item.tokenId ?? undefined}
          itemId={item.tokenId ? undefined : (item.itemId ?? undefined)}
          profile={itemAlone ? undefined : compatibleAvatar ? profile : 'default'}
          bodyShape={itemAlone || compatibleAvatar ? undefined : mannequinShape}
          type={isEmote ? undefined : itemAlone ? PreviewType.WEARABLE : PreviewType.AVATAR}
          emote={isEmote || itemAlone ? undefined : PreviewEmote.FASHION}
          // Transparent so the container's subtle rarity glow (on the light surface) shows through —
          // matches the Figma. A full-saturation rarity scene background is too loud for the light theme.
          disableBackground
          wheelZoom={isEmote ? 1.5 : undefined}
          wheelStart={isEmote ? 100 : undefined}
          dev={config.chainId === 80002}
          onLoad={() => setPreviewLoading(false)}
        />
      ) : null}
      {!profileReady || previewLoading ? (
        <div className="item-preview__loading" aria-busy="true" aria-label={t('itemPreview.loading')}>
          <span className="item-preview__spinner" aria-hidden />
        </div>
      ) : null}
      {incompatible && !itemAlone ? (
        <p className="item-preview__note">
          {t('itemPreview.shownOnBody', { shape: shapeLabel(mannequinShape) })}
        </p>
      ) : null}
      {!isEmote ? (
        // On desktop this is a text pill ("On avatar / Item") pinned top-left; on mobile it collapses
        // to an icon-only pill button-group at the bottom-right (Figma 1182-195374) — the SVG glyphs
        // show and the text labels hide (see item-detail.css). aria-label keeps each button named when
        // its visible text is hidden.
        <div className="item-preview__toggle" role="group" aria-label={t('itemPreview.previewMode')}>
          <button
            type="button"
            className={view === 'avatar' ? 'is-active' : ''}
            aria-pressed={view === 'avatar'}
            aria-label={t('itemPreview.onAvatar')}
            onClick={() => setView('avatar')}
          >
            <svg className="item-preview__toggle-ico" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
              <circle cx="12" cy="7.5" r="4" />
              <path d="M4 20c0-4.2 3.6-6.5 8-6.5s8 2.3 8 6.5v.5H4z" />
            </svg>
            <span className="item-preview__toggle-label">{t('itemPreview.onAvatar')}</span>
          </button>
          <button
            type="button"
            className={view === 'item' ? 'is-active' : ''}
            aria-pressed={view === 'item'}
            aria-label={t('itemPreview.item')}
            onClick={() => setView('item')}
          >
            <svg className="item-preview__toggle-ico" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
              <path d="M8.5 3 3 6l1.8 3.8 2.2-1V21h10V8.8l2.2 1L22 6l-5.5-3a2.6 2.6 0 0 1-4.5 1.4A2.6 2.6 0 0 1 8.5 3z" />
            </svg>
            <span className="item-preview__toggle-label">{t('itemPreview.item')}</span>
          </button>
        </div>
      ) : (
        <div className="item-preview__emote-controls">
          <EmoteControls wearablePreviewId="shop-item-preview" hideFrameInput />
        </div>
      )}
    </>
  )
}

export default ItemPreview
