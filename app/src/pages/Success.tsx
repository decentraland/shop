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
import { fetchOwnsItem } from '~/lib/api'
import { t } from '~/intl/i18n'
import type { CatalogItem } from '~/lib/api'

// Settlement of the purchase, watched on this page so we NEVER claim "It's yours!" before the item is
// actually the buyer's AND queryable. Two gates:
//   1. the tx receipt (mined, status 1) — not reverted;
//   2. the indexer reflecting ownership — because My Assets reads the SAME index, and a confirmed tx
//      leads the index by however long the squid takes; declaring success on the receipt alone lands
//      the user on an empty My Assets.
// States: 'pending' = tx not yet mined; 'indexing' = mined, waiting for the index to show ownership;
// 'confirmed' = owned + indexed; 'failed' = reverted; 'timed-out' = mined but we stopped waiting (the
// item is bought and will appear shortly — never a false success, never a false failure).
type Settlement = 'pending' | 'indexing' | 'confirmed' | 'failed' | 'timed-out'

type OwnershipCheck = { owner: string; contractAddress: string; itemId: string }

const delay = (ms: number) => new Promise<void>(r => setTimeout(r, ms))

function useSettlement(txHash: string | undefined, ownership: OwnershipCheck | null): Settlement {
  // No hash to verify (shouldn't happen for a credit buy) → don't block the page.
  const [state, setState] = useState<Settlement>(txHash ? 'pending' : 'confirmed')
  const ownerKey = ownership ? `${ownership.owner}-${ownership.contractAddress}-${ownership.itemId}` : ''
  useEffect(() => {
    if (!txHash) return
    let cancelled = false
    const checkSettlement = async () => {
      // Gate 1: wait for the tx receipt. ~5 min of polling (20 × 15s); a reverted tx fails fast.
      let mined = false
      for (let attempt = 0; attempt < 20 && !cancelled; attempt++) {
        try {
          await waitForSettlement(txHash, { timeoutMs: 15_000 })
          mined = true
          break
        } catch (e) {
          if (e instanceof SettlementPendingError) continue // still in flight → keep waiting
          if (!cancelled) setState('failed') // reverted on-chain: no asset was delivered
          return
        }
      }
      if (cancelled) return
      if (!mined) {
        setState('timed-out') // read RPC lagged the whole window — tx may still land
        return
      }
      // Gate 2: the tx is mined. If we can't check ownership (managed wallet / missing itemId), confirm
      // on the receipt alone. Otherwise poll the indexer so "It's yours!" implies it's in My Assets.
      if (!ownership) {
        setState('confirmed')
        return
      }
      setState('indexing')
      for (let attempt = 0; attempt < 40 && !cancelled; attempt++) {
        if (await fetchOwnsItem(ownership.owner, ownership.contractAddress, ownership.itemId)) {
          if (!cancelled) setState('confirmed')
          return
        }
        await delay(3000) // 40 × 3s = ~2 min
      }
      // Bought + mined, but the indexer hasn't caught up within the window. Not a failure — surface a
      // "will appear shortly" state instead of a false "It's yours!" over an empty wardrobe.
      if (!cancelled) setState('timed-out')
    }

    void checkSettlement()

    return () => {
      cancelled = true
    }
    // `ownerKey` is the stringified `ownership` — depend on it (not the object) so the poll doesn't
    // restart on a new object reference carrying identical values.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [txHash, ownerKey])
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
  const purchasedItems = state?.items ?? []
  // Gate "It's yours!" on the indexer showing ownership of the first purchased item (all items in a
  // basket settle in the same tx, so one being indexed means the batch is). Only when we have an
  // address + a mint itemId to query by; otherwise fall back to receipt-only confirmation.
  const first = purchasedItems[0]
  const ownership: OwnershipCheck | null =
    session?.address && first?.contractAddress && first?.itemId
      ? { owner: session.address, contractAddress: first.contractAddress, itemId: first.itemId }
      : null
  // Watch settlement + indexing (called before any early return to keep hook order stable).
  const settlement = useSettlement(txHash, ownership)

  const items = purchasedItems
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
  const previewProfile = useAvatar ? session.address : 'default'
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
            itemId={single.tokenId ? undefined : (single.itemId ?? undefined)}
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
        {settlement === 'pending' || settlement === 'indexing' ? (
          <>
            <span className="spinner success__spinner" aria-hidden />
            <h1 className="success__title">
              {settlement === 'indexing' ? t('success.finalizing') : t('success.processing')}
            </h1>
            <p className="success__sub">
              {settlement === 'indexing' ? (
                <>
                  {t('success.indexingBefore')}{' '}
                  {items.length === 1 ? (
                    <strong>{hero.name}</strong>
                  ) : (
                    t('success.itemCount', { count: items.length })
                  )}{' '}
                  {t('success.indexingAfter')}
                </>
              ) : (
                <>
                  {t('success.confirmingBefore')}{' '}
                  {items.length === 1 ? (
                    <strong>{hero.name}</strong>
                  ) : (
                    t('success.itemCount', { count: items.length })
                  )}{' '}
                  {t('success.confirmingAfter')}
                </>
              )}
            </p>
            {showExplorer ? (
              <div className="success__links">
                <a className="success__receipt" href={`${EXPLORER_TX}${txHash}`} target="_blank" rel="noreferrer">
                  {t('success.viewTransaction')}
                </a>
              </div>
            ) : null}
          </>
        ) : settlement === 'timed-out' ? (
          <>
            <h1 className="success__title">{t('success.stillProcessingTitle')}</h1>
            <p className="success__sub">
              {t('success.timedOutBefore')}{' '}
              <button className="link" onClick={() => navigate('/my-purchases')}>
                {t('nav.myPurchases')}
              </button>{' '}
              {t('success.timedOutAfter')}
            </p>
            <div className="success__links">
              {showExplorer ? (
                <a className="success__receipt" href={`${EXPLORER_TX}${txHash}`} target="_blank" rel="noreferrer">
                  {t('success.viewTransaction')}
                </a>
              ) : null}
            </div>
            <div className="success__actions">
              <button className="btn btn--purple" onClick={() => navigate('/my-purchases')}>
                {t('success.viewMyPurchases')}
              </button>
              <button className="btn btn--ghost" onClick={() => navigate('/assets')}>
                {t('success.keepShopping')}
              </button>
            </div>
          </>
        ) : settlement === 'failed' ? (
          <>
            <h1 className="success__title">{t('success.failedTitle')}</h1>
            <p className="success__sub">{t('success.failedBody')}</p>
            <div className="success__links">
              {showExplorer ? (
                <a className="success__receipt" href={`${EXPLORER_TX}${txHash}`} target="_blank" rel="noreferrer">
                  {t('success.viewTransaction')}
                </a>
              ) : null}
            </div>
            <div className="success__actions">
              <button className="btn btn--purple" onClick={() => navigate('/assets')}>
                {t('success.backToShop')}
              </button>
            </div>
          </>
        ) : (
          <>
            <SuccessAnimation />
            <h1 className="success__title">{t('success.title')}</h1>
            {items.length === 1 ? (
              <p className="success__sub">
                <strong>{hero.name}</strong> {t('success.heroInWardrobe')}
              </p>
            ) : (
              <>
                <p className="success__sub">{t('success.itemsInWardrobe', { count: items.length })}</p>
                <ul className="success__list">
                  {items.map(i => (
                    <li key={i.id}>{i.name}</li>
                  ))}
                </ul>
              </>
            )}

            <div className="success__links">
              <button className="success__receipt" onClick={() => navigate('/my-purchases')}>
                {t('success.viewOrder')}
              </button>
              {showExplorer ? (
                <a className="success__receipt" href={`${EXPLORER_TX}${txHash}`} target="_blank" rel="noreferrer">
                  {t('success.viewTransaction')}
                </a>
              ) : null}
            </div>

            <div className="success__actions">
              <a className="btn btn--purple" href={JUMP_URL} target="_blank" rel="noreferrer">
                {t('success.useItInWorld')}
              </a>
              <button className="btn btn--ghost" onClick={() => navigate('/assets')}>
                {t('success.keepShopping')}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

export default Success
