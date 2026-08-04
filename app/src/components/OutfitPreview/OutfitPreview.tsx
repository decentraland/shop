import { useEffect, useRef, useState } from 'react'
import { PreviewEmote, PreviewType, type PreviewRenderer } from '@dcl/schemas'
import { WearablePreview } from '~/components/LazyWearablePreview'
import { usePreviewActive } from '~/hooks/usePreviewActive'
import { disposePreview } from '~/lib/disposePreview'
import { config } from '~/config'
import { t } from '~/intl/i18n'
import { useCart } from '~/store/cart'
import type { BodyShapeUrn } from '~/lib/bodyShape'
import * as S from './OutfitPreview.styles'

// A whole outfit worn live on one avatar. Pauses off-screen, yields to the Fitting Room (at most
// one heavy preview alive at a time), and frees its WebGL context on unmount. The caller provides
// the positioned container and decides what to show when there are no urns to wear (this renders
// nothing then).
export function OutfitPreview({
  id,
  profile,
  bodyShape,
  urns,
  enabled = true,
  onRenderer,
  skin,
  hair,
  eyes
}: {
  /** DOM id for the preview iframe — unique per surface so dispose targets the right one. */
  id: string
  /** An address with a published avatar, or 'default' for a mannequin. */
  profile: string
  /** Mannequin shape override; only meaningful with the 'default' profile. */
  bodyShape?: BodyShapeUrn
  urns: string[]
  /** Caller gate — false while its inputs (profile lookup, catalog resolution) are settling. */
  enabled?: boolean
  /** Reports the effective renderer, so a caller can show overlay controls Unity ships in-scene. */
  onRenderer?: (renderer: PreviewRenderer) => void
  /** Avatar colors (hex, no '#') — the studio's session-only import extras. */
  skin?: string
  hair?: string
  eyes?: string
}) {
  const fittingOpen = useCart(s => s.fittingOpen)
  const { ref: viewportRef, active } = usePreviewActive<HTMLDivElement>()
  const mounted = enabled && urns.length > 0 && active && !fittingOpen

  // The preview must resolve the URNs on the chain THEY name — in a dev build reading the mainnet
  // catalog (the seeds setup), the app chain says amoy while the outfit's items are matic.
  const dev = urns.length > 0 ? urns[0].includes(':amoy:') : config.chainId === 80002

  // Mask every (re)load — changed urns reload the same iframe in place, so cover it until onLoad.
  const [ready, setReady] = useState(false)
  const urnsSig = urns.join(',')
  useEffect(() => {
    setReady(false)
  }, [urnsSig, profile, skin, hair, eyes])
  useEffect(() => {
    if (mounted) setReady(false)
  }, [mounted])

  const previewWindowRef = useRef<Window | null>(null)
  useEffect(() => {
    if (!mounted) return
    return () => {
      disposePreview(previewWindowRef.current)
      previewWindowRef.current = null
    }
  }, [mounted])

  return (
    <>
      <div ref={viewportRef} data-preview-viewport aria-hidden />
      {mounted ? (
        // Stable key: toggling items reloads the SAME iframe (one masked reload), never a remount.
        <WearablePreview
          id={id}
          key={profile}
          profile={profile}
          bodyShape={bodyShape}
          urns={urns}
          skin={skin}
          hair={hair}
          eyes={eyes}
          type={PreviewType.AVATAR}
          emote={PreviewEmote.FASHION}
          disableBackground
          disableFadeEffect
          dev={dev}
          unity
          onRenderer={onRenderer}
          onLoad={() => {
            setReady(true)
            previewWindowRef.current = (document.getElementById(id) as HTMLIFrameElement | null)?.contentWindow ?? null
          }}
        />
      ) : null}
      {enabled && urns.length === 0 ? null : !mounted || !ready ? (
        <S.Loading aria-busy="true" aria-label={t('spinner.loading')}>
          <span className="spinner" aria-hidden />
        </S.Loading>
      ) : null}
    </>
  )
}

export default OutfitPreview
