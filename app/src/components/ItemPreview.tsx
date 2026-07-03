import { WearablePreview } from 'decentraland-ui2/dist/components/WearablePreview'
import { PreviewEmote, PreviewType } from '@dcl/schemas'
import { config } from '~/config'
import { useWallet } from '~/store/wallet'
import { useProfile } from '~/hooks/useProfile'
import type { CatalogItem } from '~/lib/api'

// The hero preview: the item MOUNTED on the connected user's avatar (like the marketplace item page).
// - profile = the connected address when they have a published avatar, else 'default' (default DCL body).
// - wearables → type=AVATAR + a FASHION pose so the avatar isn't in a T-pose.
// - emotes    → no type (the preview app auto-detects + plays the emote on the avatar) + wheel zoom.
// One iframe only; keyed on the item id so switching items re-mounts a single preview (no per-card iframes).

export function ItemPreview({ item }: { item: CatalogItem }) {
  const address = useWallet(s => s.session?.address)
  // Feeding a real address that has NO published avatar renders an empty default look — so only
  // pass the address when useProfile confirms an avatar exists; otherwise fall back to 'default'.
  const { data: avatar } = useProfile(address)
  const profile = address && avatar ? address : 'default'

  const isEmote = item.category === 'emote'

  return (
    <WearablePreview
      key={item.id}
      id="shop-item-preview"
      contractAddress={item.contractAddress}
      // secondary listings carry tokenId; catalog/mint items carry itemId — never both.
      tokenId={item.tokenId ?? undefined}
      itemId={item.tokenId ? undefined : item.itemId ?? undefined}
      profile={profile}
      type={isEmote ? undefined : PreviewType.AVATAR}
      emote={isEmote ? undefined : PreviewEmote.FASHION}
      // Transparent so the container's subtle rarity glow (on the light surface) shows through —
      // matches the Figma. A full-saturation rarity scene background is too loud for the light theme.
      disableBackground
      wheelZoom={isEmote ? 1.5 : undefined}
      wheelStart={isEmote ? 100 : undefined}
      dev={config.chainId === 80002}
      disableFadeEffect
    />
  )
}

export default ItemPreview
