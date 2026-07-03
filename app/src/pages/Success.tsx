import { useLocation, useNavigate, Navigate } from 'react-router-dom'
import { WearablePreview } from '~/components/LazyWearablePreview'
import { PreviewEmote, PreviewType } from '@dcl/schemas'
import { useWallet } from '~/store/wallet'
import { config } from '~/config'
import { SuccessAnimation } from '~/components/SuccessAnimation'
import type { CatalogItem } from '~/lib/api'

// Where "Use it in-world" jumps to. Testnet → .zone; the wearable is already in the wallet's
// wardrobe, so the user equips it from the backpack once in-world.
const PLAY_URL = 'https://play.decentraland.zone'

export function Success() {
  const { state } = useLocation() as { state?: { items?: CatalogItem[] } }
  const navigate = useNavigate()
  const { session } = useWallet()

  const items = state?.items ?? []
  // Direct hit / refresh with no purchase context → send home.
  if (items.length === 0) return <Navigate to="/assets" replace />

  const hero = items[0]
  // Mount the item on the CONNECTED user's avatar (like the marketplace): profile = their address.
  const profile = session?.address ?? 'default'

  return (
    <div className="success">
      <div className="success__preview">
        <WearablePreview
          key={hero.id}
          contractAddress={hero.contractAddress}
          tokenId={hero.tokenId ?? undefined}
          itemId={hero.tokenId ? undefined : hero.itemId ?? undefined}
          profile={profile}
          type={PreviewType.AVATAR}
          emote={PreviewEmote.FASHION}
          background="ecebed"
          dev={config.chainId === 80002}
        />
      </div>

      <div className="success__panel">
        <SuccessAnimation />
        <h1 className="success__title">It&rsquo;s yours!</h1>
        {items.length === 1 ? (
          <p className="success__sub">
            <strong>{hero.name}</strong> is now in your wardrobe.
          </p>
        ) : (
          <>
            <p className="success__sub">{items.length} items are now in your wardrobe.</p>
            <ul className="success__list">
              {items.map(i => (
                <li key={i.id}>{i.name}</li>
              ))}
            </ul>
          </>
        )}

        <div className="success__actions">
          <a className="btn btn--purple" href={PLAY_URL} target="_blank" rel="noreferrer">
            Use it in-world
          </a>
          <button className="btn btn--ghost" onClick={() => navigate('/assets')}>
            Keep shopping
          </button>
        </div>
      </div>
    </div>
  )
}

export default Success
