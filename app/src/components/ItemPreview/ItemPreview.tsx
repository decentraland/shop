import { useEffect, useRef, useState } from 'react'
import { WearablePreview } from '~/components/LazyWearablePreview'
import { EmoteControls } from '~/components/LazyEmoteControls'
import { PreviewEmote, PreviewRenderer, PreviewType } from '@dcl/schemas'
import { useCart } from '~/store/cart'
import { useWallet } from '~/store/wallet'
import { useProfile } from '~/hooks/useProfile'
import { usePreviewActive } from '~/hooks/usePreviewActive'
import { disposePreview } from '~/lib/disposePreview'
import { avatarShape, isCompatible, itemShapes, shapeLabel } from '~/lib/bodyShape'
import { t } from '~/intl/i18n'
import type { CatalogItem } from '~/lib/api'
import * as S from './ItemPreview.styles'

const PREVIEW_ID = 'shop-item-preview'

// The hero preview. Wearables open WORN (avatar + a FASHION pose); the "On avatar / Item" toggle flips to
// the item shown alone (PreviewType.WEARABLE — no avatar, no emote).
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
  // Opens on the worn view — what a shopper is deciding is how the piece looks on them — and the switch
  // below flips to the item alone, which is the only way to actually inspect the piece.
  const [view, setView] = useState<'avatar' | 'item'>('avatar')
  const itemAlone = !isEmote && view === 'item'
  // The item-alone view needs no avatar, so it can render immediately; only the avatar/emote views wait for
  // the profile fetch to settle (so they mount once with the final avatar rather than default→avatar reload).
  const profileReady = itemAlone || !profileLoading

  // At most ONE heavy preview alive at a time: while the Fitting Room modal is open it owns the single
  // live avatar preview, so suspend (unmount) the PDP's preview underneath it. It remounts when the room
  // closes. (The Fitting Room is app-level and reads the same cart store — this is the shared signal.)
  const fittingOpen = useCart(s => s.fittingOpen)

  // Pause the preview off-screen / when the tab is hidden: unmount the iframe (the ui2 wrapper has no
  // pause message) so its WebGL context + render loop stop pegging the GPU, and remount when it returns.
  const { ref: viewportRef, active } = usePreviewActive<HTMLDivElement>()

  // Mount the heavy preview only when it's worth paying for: identity resolved, on-screen + tab visible,
  // and not superseded by the Fitting Room. Everything else falls back to the loading skeleton below.
  const previewMounted = profileReady && active && !fittingOpen

  // Cover every (re)load with a loader so the iframe never flickers raw (like the marketplace's
  // Loader overlay + onLoad). Reset to loading whenever the preview will actually (re)mount/reload: a
  // new item (key change → remount), the on-avatar/item toggle (in-place scene reload), or a remount
  // after being paused (off-screen / tab-hidden / Fitting Room).
  const [previewLoading, setPreviewLoading] = useState(true)
  useEffect(() => {
    setPreviewLoading(true)
  }, [item.id, itemAlone])
  useEffect(() => {
    if (previewMounted) setPreviewLoading(true)
  }, [previewMounted])

  // Best-effort dispose when the preview unmounts (paused, superseded, or navigating item→item): ask the
  // aang runtime to free its WebGL context before the iframe is torn down. We capture the iframe window
  // on load because by the time React runs this cleanup the element is already detached.
  const previewWindowRef = useRef<Window | null>(null)
  useEffect(() => {
    if (!previewMounted) return
    return () => {
      disposePreview(previewWindowRef.current)
      previewWindowRef.current = null
    }
  }, [previewMounted])

  // Unity ships its own on-avatar/item + emote controls inside the scene, so our overlay controls would
  // double up on them. Show them only when Babylon is the effective renderer — including when we asked
  // for Unity but fell back to Babylon (slow link, low memory, or a load error). Undefined until the
  // preview reports, so the Unity path never briefly flashes the overlay.
  const [renderer, setRenderer] = useState<PreviewRenderer>(PreviewRenderer.UNITY)
  const showControls = renderer === PreviewRenderer.BABYLON

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
      {/* Zero-footprint sentinel that spans the preview box; the IntersectionObserver watches it so the
          preview can pause when it scrolls out of view. Stays mounted even while the preview is paused,
          so re-entry is detected. */}
      <div ref={viewportRef} data-preview-viewport aria-hidden />
      {/* Gate on the profile fetch (mount ONCE with the final avatar — no default→avatar reload), and on
          being active + not superseded by the Fitting Room, so at most one heavy preview is ever alive. */}
      {previewMounted ? (
        <WearablePreview
          id={PREVIEW_ID}
          contractAddress={item.contractAddress}
          // secondary listings carry tokenId; catalog/mint items carry itemId — never both.
          tokenId={item.tokenId ?? undefined}
          itemId={item.tokenId ? undefined : (item.itemId ?? undefined)}
          profile={itemAlone ? undefined : compatibleAvatar ? profile : 'default'}
          bodyShape={itemAlone || compatibleAvatar ? undefined : mannequinShape}
          type={isEmote ? undefined : itemAlone ? PreviewType.WEARABLE : PreviewType.AVATAR}
          emote={isEmote || itemAlone ? undefined : PreviewEmote.FASHION}
          // Transparent so the container's light stage shows through (see ItemDetail's Preview
          // panel) — a full-saturation rarity scene background is too loud either way.
          disableBackground
          wheelZoom={isEmote ? 1.5 : undefined}
          wheelStart={isEmote ? 100 : undefined}
          unity
          onRenderer={setRenderer}
          onLoad={() => {
            setPreviewLoading(false)
            // Capture the iframe window now (it's attached) for the best-effort cleanup on unmount.
            previewWindowRef.current =
              (document.getElementById(PREVIEW_ID) as HTMLIFrameElement | null)?.contentWindow ?? null
          }}
        />
      ) : null}
      {!previewMounted || previewLoading ? (
        <S.Loading data-preview-loading aria-busy="true" aria-label={t('itemPreview.loading')}>
          <S.Spinner aria-hidden />
        </S.Loading>
      ) : null}
      {incompatible && !itemAlone ? (
        <S.Note data-preview-note>{t('itemPreview.shownOnBody', { shape: shapeLabel(mannequinShape) })}</S.Note>
      ) : null}
      {!showControls || !isEmote ? null : (
        <S.EmoteControls data-preview-controls data-testid="emote-controls">
          <EmoteControls wearablePreviewId="shop-item-preview" hideFrameInput />
        </S.EmoteControls>
      )}
      {/* Hidden for an emote (there is no item-alone view of a dance) and for Unity, whose scene ships its
          own controls. Desktop: a text pill top-left; mobile: an icon-only pair at the bottom-right. */}
      {!showControls || isEmote ? null : (
        <S.Toggle data-preview-toggle role="group" aria-label={t('itemPreview.previewMode')}>
          <S.ToggleButton
            type="button"
            data-active={view === 'avatar' || undefined}
            aria-pressed={view === 'avatar'}
            aria-label={t('itemPreview.onAvatar')}
            onClick={() => setView('avatar')}
          >
            <S.ToggleIcon name="view-avatar" size={18} />
            <S.ToggleLabel>{t('itemPreview.onAvatar')}</S.ToggleLabel>
          </S.ToggleButton>
          <S.ToggleButton
            type="button"
            data-active={view === 'item' || undefined}
            aria-pressed={view === 'item'}
            aria-label={t('itemPreview.item')}
            onClick={() => setView('item')}
          >
            <S.ToggleIcon name="view-item" size={18} />
            <S.ToggleLabel>{t('itemPreview.item')}</S.ToggleLabel>
          </S.ToggleButton>
        </S.Toggle>
      )}
    </>
  )
}

export default ItemPreview
