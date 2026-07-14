import { useEffect, useState } from 'react'
import { useLocation, useNavigate, Navigate } from 'react-router-dom'
import { WearablePreview } from '~/components/LazyWearablePreview'
import { PreviewEmote, PreviewType } from '@dcl/schemas'
import { useWallet } from '~/store/wallet'
import { useProfile } from '~/hooks/useProfile'
import { config } from '~/config'
import { SuccessAnimation } from '~/components/SuccessAnimation'
import { showsWalletConfirmations } from '~/lib/wallet-kind'
import { avatarShape, dominantShape, isCompatible, BASE_MALE } from '~/lib/bodyShape'
import { itemUrn } from '~/lib/urn'
import { waitForSettlement, SettlementPendingError } from '~/lib/buy-gasless'
import type { CatalogItem } from '~/lib/api'

// Settlement of the purchase tx, watched on this page so we NEVER claim "It's yours!" before the item
// actually exists on-chain (the buy flow may navigate here optimistically — broadcast but not yet
// confirmed — so the truth lives here). 'confirmed' when the receipt is status 1, 'failed' on a
// revert, 'pending' while we're still waiting.
type Settlement = 'pending' | 'confirmed' | 'failed'

// Poll the settlement of `txHash`, resolving to the terminal state. waitForSettlement resolves on a
// confirmed receipt, throws Error on a revert, and throws SettlementPendingError on each timeout — so
// we loop through the pending timeouts and only stop on a definitive outcome (or after the cap).
function useSettlement(txHash: string | undefined): Settlement {
  // No hash to verify (shouldn't happen for a credit buy) → don't block the page.
  const [state, setState] = useState<Settlement>(txHash ? 'pending' : 'confirmed')
  useEffect(() => {
    if (!txHash) return
    let cancelled = false
    ;(async () => {
      // ~5 min of polling (20 × 15s). Amoy confirms in seconds; the cap only matters if the read RPC
      // is badly lagged, in which case we keep showing "processing" rather than a false success.
      for (let attempt = 0; attempt < 20 && !cancelled; attempt++) {
        try {
          await waitForSettlement(txHash, { timeoutMs: 15_000 })
          if (!cancelled) setState('confirmed')
          return
        } catch (e) {
          if (e instanceof SettlementPendingError) continue // still in flight → keep waiting
          if (!cancelled) setState('failed') // reverted on-chain: no asset was delivered
          return
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [txHash])
  return state
}

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
  // Read the connected avatar's profile up here (before any early return) so its body shape can decide
  // whether the purchased wearables render on the real avatar or on a compatible mannequin.
  const { data: avatar } = useProfile(session?.address)

  const txHash = state?.txHash
  // Watch the on-chain settlement (called before any early return to keep hook order stable).
  const settlement = useSettlement(txHash)

  const items = state?.items ?? []
  // Direct hit / refresh with no purchase context → send home.
  if (items.length === 0) return <Navigate to="/assets" replace />

  const hero = items[0]
  // Partition the purchase: wearables go on the avatar; an emote can't be "worn" (rendered on its own).
  // Deriving from the WHOLE set (not just items[0]) fixes a mixed cart that used to drop the wearables
  // or feed an emote URN into the wearable slots.
  const wearables = items.filter(i => i.category !== 'emote')
  const emote = items.find(i => i.category === 'emote') ?? null
  const urns = wearables.map(itemUrn).filter((u): u is string => !!u)

  // Body-shape compatibility (mirrors the fitting room / builder): a gendered wearable renders INVISIBLE
  // on an avatar whose shape it doesn't support. Mount on the connected avatar only when it can wear
  // everything purchased; otherwise dress a default mannequin of a shape the items DO support.
  const shape = avatarShape(avatar)
  const avatarFits = !!shape && wearables.every(w => isCompatible(w, shape))
  const target = dominantShape(wearables) ?? shape ?? BASE_MALE
  const useAvatar = !!session?.address && avatarFits
  const previewProfile = useAvatar ? (session!.address as string) : 'default'
  const previewBodyShape = useAvatar ? undefined : target

  // No wearables (emote-only purchase, or a wearable missing a URN) → render that single item directly.
  const single = emote ?? hero
  const singleIsEmote = single.category === 'emote'

  // Self-custody users additionally get a link to the on-chain tx; managed users never see it.
  const showExplorer = !!txHash && showsWalletConfirmations(session?.providerType)

  return (
    <div className="success">
      <div className="success__preview">
        {urns.length > 0 ? (
          <WearablePreview
            key={hero.id}
            profile={previewProfile}
            bodyShape={previewBodyShape}
            urns={urns}
            type={PreviewType.AVATAR}
            emote={PreviewEmote.FASHION}
            background="ecebed"
            dev={config.chainId === 80002}
          />
        ) : (
          <WearablePreview
            key={single.id}
            contractAddress={single.contractAddress}
            tokenId={single.tokenId ?? undefined}
            itemId={single.tokenId ? undefined : single.itemId ?? undefined}
            profile={previewProfile}
            bodyShape={singleIsEmote ? undefined : previewBodyShape}
            type={singleIsEmote ? undefined : PreviewType.AVATAR}
            emote={singleIsEmote ? undefined : PreviewEmote.FASHION}
            background="ecebed"
            dev={config.chainId === 80002}
          />
        )}
      </div>

      <div className="success__panel">
        {settlement === 'pending' ? (
          <>
            <span className="spinner success__spinner" aria-hidden />
            <h1 className="success__title">Processing your purchase…</h1>
            <p className="success__sub">
              Confirming {items.length === 1 ? <strong>{hero.name}</strong> : `${items.length} items`} on-chain.
              This usually takes a few seconds — keep this tab open.
            </p>
            {showExplorer ? (
              <div className="success__links">
                <a className="success__receipt" href={`${EXPLORER_TX}${txHash}`} target="_blank" rel="noreferrer">
                  View transaction ↗
                </a>
              </div>
            ) : null}
          </>
        ) : settlement === 'failed' ? (
          <>
            <h1 className="success__title">Your purchase didn&rsquo;t go through</h1>
            <p className="success__sub">
              The transaction failed on-chain, so nothing was delivered. Your credits weren&rsquo;t spent
              (any hold is released shortly) — you can try again.
            </p>
            <div className="success__links">
              {showExplorer ? (
                <a className="success__receipt" href={`${EXPLORER_TX}${txHash}`} target="_blank" rel="noreferrer">
                  View transaction ↗
                </a>
              ) : null}
            </div>
            <div className="success__actions">
              <button className="btn btn--purple" onClick={() => navigate('/assets')}>
                Back to shop
              </button>
            </div>
          </>
        ) : (
          <>
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
          </>
        )}
      </div>
    </div>
  )
}

export default Success
