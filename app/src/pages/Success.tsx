import { useLocation, useNavigate, Navigate } from 'react-router-dom'
import { WearablePreview } from '~/components/LazyWearablePreview'
import { PreviewEmote, PreviewType } from '@dcl/schemas'
import { useWallet } from '~/store/wallet'
import { config } from '~/config'
import { SuccessAnimation } from '~/components/SuccessAnimation'
import { showsWalletConfirmations } from '~/lib/wallet-kind'
import { itemUrn } from '~/lib/urn'
import type { CatalogItem } from '~/lib/api'

// Modern in-world entry: the launcher deep-link handled by decentraland.org/jump (zone on testnet).
// The old play.decentraland.* web client is deprecated. The item is already in the wardrobe.
const JUMP_URL = config.chainId === 80002 ? 'https://decentraland.zone/jump' : 'https://decentraland.org/jump'
// Block explorer for the settlement tx — shown ONLY to self-custody wallets (they understand
// explorers); managed/thirdweb users just get the in-app "View order". See lib/wallet-kind.ts.
const EXPLORER_TX = config.chainId === 80002 ? 'https://amoy.polygonscan.com/tx/' : 'https://polygonscan.com/tx/'

export function Success() {
  const { state } = useLocation() as { state?: { items?: CatalogItem[]; txHash?: string } }
  const navigate = useNavigate()
  const { session } = useWallet()

  const items = state?.items ?? []
  // Direct hit / refresh with no purchase context → send home.
  if (items.length === 0) return <Navigate to="/assets" replace />

  const hero = items[0]
  // Mount on the CONNECTED user's avatar (falls back to the default body when there's no profile).
  const profile = session?.address ?? 'default'
  const isEmote = hero.category === 'emote'
  // Equip the purchased wearable(s) on the avatar. Emotes aren't "worn" → fall back to the item render.
  const urns = isEmote ? [] : items.map(itemUrn).filter((u): u is string => !!u)
  const txHash = state?.txHash
  // Self-custody users additionally get a link to the on-chain tx; managed users never see it.
  const showExplorer = !!txHash && showsWalletConfirmations(session?.providerType)

  return (
    <div className="success">
      <div className="success__preview">
        {urns.length > 0 ? (
          <WearablePreview
            key={hero.id}
            profile={profile}
            urns={urns}
            type={PreviewType.AVATAR}
            emote={PreviewEmote.FASHION}
            background="ecebed"
            dev={config.chainId === 80002}
          />
        ) : (
          <WearablePreview
            key={hero.id}
            contractAddress={hero.contractAddress}
            tokenId={hero.tokenId ?? undefined}
            itemId={hero.tokenId ? undefined : hero.itemId ?? undefined}
            profile={profile}
            type={isEmote ? undefined : PreviewType.AVATAR}
            emote={isEmote ? undefined : PreviewEmote.FASHION}
            background="ecebed"
            dev={config.chainId === 80002}
          />
        )}
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

        <div className="success__links">
          <button className="success__receipt" onClick={() => navigate('/my-purchases')}>
            View order
          </button>
          {showExplorer ? (
            <a className="success__receipt" href={`${EXPLORER_TX}${txHash}`} target="_blank" rel="noreferrer">
              View transaction ↗
            </a>
          ) : null}
        </div>

        <div className="success__actions">
          <a className="btn btn--purple" href={JUMP_URL} target="_blank" rel="noreferrer">
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
