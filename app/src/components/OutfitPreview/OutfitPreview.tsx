import { useEffect, useRef, useState, type ReactNode } from 'react'
import { PreviewEmote, PreviewType } from '@dcl/schemas'
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
// nothing then). An outfit is only ever shown WORN, so no surface offers an item-alone view.
//
// Babylon only, deliberately: no Unity mode renders a multi-item avatar today — `marketplace` reads
// only the first urn and `profile` reads none — so requesting Unity would drop most of the outfit
// the moment the `unity-wearable-preview` flag turns on. Restore `unity` once the renderer supports it.
export function OutfitPreview({
  id,
  profile,
  bodyShape,
  urns,
  enabled = true,
  skin,
  hair,
  eyes,
  controls
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
  /** Avatar colors (hex, no '#') — the studio's session-only import extras. */
  skin?: string
  hair?: string
  eyes?: string
  /**
   * Overlay that drives the preview (the emote playback bar). A SLOT rather than the caller's own
   * sibling because anything binding to the iframe by id must not exist before the iframe does — ui2's
   * EmoteControls throws "Could not find an iframe with id=…" and takes the page down with it, and only
   * this component knows whether the preview is currently mounted (it waits on its viewport, the
   * Fitting Room and the caller's own gate).
   */
  controls?: ReactNode
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

  // Whether the preview IFRAME is in the DOM. `mounted` is not enough: WearablePreview is itself lazy,
  // so on a cold load it suspends and renders nothing for a while — and anything in `controls` binds to
  // the iframe BY ID, throwing (and taking the page down) if it mounts first. Polled by frame because
  // the element appears from inside a Suspense boundary we get no callback from.
  const [hasIframe, setHasIframe] = useState(false)
  useEffect(() => {
    if (!mounted) {
      setHasIframe(false)
      return
    }
    let frame = 0
    let attempts = 0
    const check = () => {
      if (document.getElementById(id)) setHasIframe(true)
      else if (attempts++ < 300) frame = requestAnimationFrame(check)
    }
    check()
    return () => cancelAnimationFrame(frame)
  }, [mounted, id])

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
          onLoad={() => {
            setReady(true)
            previewWindowRef.current = (document.getElementById(id) as HTMLIFrameElement | null)?.contentWindow ?? null
          }}
        />
      ) : null}
      {hasIframe ? controls : null}
      {enabled && urns.length === 0 ? null : !mounted || !ready ? (
        <S.Loading aria-busy="true" aria-label={t('spinner.loading')}>
          <span className="spinner" aria-hidden />
        </S.Loading>
      ) : null}
    </>
  )
}

export default OutfitPreview
