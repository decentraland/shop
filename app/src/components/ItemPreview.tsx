import { useState } from 'react'
import { WearablePreview } from '~/components/LazyWearablePreview'
import { PreviewEmote, PreviewType } from '@dcl/schemas'
import { config } from '~/config'
import { useWallet } from '~/store/wallet'
import { useProfile } from '~/hooks/useProfile'
import { avatarShape, isCompatible, itemShapes, shapeLabel } from '~/lib/bodyShape'
import type { CatalogItem } from '~/lib/api'

// The hero preview: the item MOUNTED on the connected user's avatar (like the marketplace item page).
// - profile = the connected address when they have a published avatar, else 'default' (default DCL body).
// - wearables → type=AVATAR + a FASHION pose so the avatar isn't in a T-pose.
// - emotes    → no type (the preview app auto-detects + plays the emote on the avatar) + wheel zoom.
// One iframe only; keyed on the item id so switching items re-mounts a single preview (no per-card iframes).
//
// Wearables also get an "On avatar / Item" toggle (like the marketplace): switching flips the preview
// `type` between AVATAR (worn) and WEARABLE (the item alone), which the WearablePreview reloads in place
// — no remount (key stays item.id). Emotes have no "alone" view (they're animations on an avatar).

export function ItemPreview({ item }: { item: CatalogItem }) {
  const address = useWallet(s => s.session?.address)
  // Feeding a real address that has NO published avatar renders an empty default look — so only
  // pass the address when useProfile confirms an avatar exists; otherwise fall back to 'default'.
  const { data: avatar } = useProfile(address)
  const profile = address && avatar ? address : 'default'

  const isEmote = item.category === 'emote'
  const [view, setView] = useState<'avatar' | 'item'>('avatar')
  const itemAlone = !isEmote && view === 'item'

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
      <WearablePreview
        key={item.id}
        id="shop-item-preview"
        contractAddress={item.contractAddress}
        // secondary listings carry tokenId; catalog/mint items carry itemId — never both.
        tokenId={item.tokenId ?? undefined}
        itemId={item.tokenId ? undefined : item.itemId ?? undefined}
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
        disableFadeEffect
      />
      {incompatible && !itemAlone ? (
        <p className="item-preview__note">
          Shown on a {shapeLabel(mannequinShape)} body — this item isn’t made for your avatar’s shape.
        </p>
      ) : null}
      {!isEmote ? (
        <div className="item-preview__toggle" role="group" aria-label="Preview mode">
          <button
            type="button"
            className={view === 'avatar' ? 'is-active' : ''}
            aria-pressed={view === 'avatar'}
            onClick={() => setView('avatar')}
          >
            On avatar
          </button>
          <button
            type="button"
            className={view === 'item' ? 'is-active' : ''}
            aria-pressed={view === 'item'}
            onClick={() => setView('item')}
          >
            Item
          </button>
        </div>
      ) : null}
    </>
  )
}

export default ItemPreview
