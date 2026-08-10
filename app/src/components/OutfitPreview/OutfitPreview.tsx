import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ChainName, PreviewEmote, PreviewRenderer, PreviewType, PreviewUnityMode } from '@dcl/schemas'
import { WearablePreview } from '~/components/LazyWearablePreview'
import { usePreviewActive } from '~/hooks/usePreviewActive'
import { useEmoteBase64 } from '~/hooks/useEmoteBase64'
import { isEmoteUrn } from '~/lib/emoteBase64'
import { urnNetwork } from '~/lib/urn'
import { disposePreview } from '~/lib/disposePreview'
import { t } from '~/intl/i18n'
import { useCart } from '~/store/cart'
import type { BodyShapeUrn } from '~/lib/bodyShape'
import * as S from './OutfitPreview.styles'

// A whole outfit worn live on one avatar. Pauses off-screen, yields to the Fitting Room (at most
// one heavy preview alive at a time), and frees its WebGL context on unmount. The caller provides
// the positioned container and decides what to show when there are no urns to wear (this renders
// nothing then). An outfit is only ever shown WORN, so no surface offers an item-alone view.
//
// Unity runs in BUILDER mode: `marketplace` reads only the first urn and takes none of the avatar's
// own look from `profile`, so it renders an outfit as a stranger wearing one item.
export function OutfitPreview({
  id,
  profile,
  bodyShape,
  urns,
  emote = PreviewEmote.FASHION,
  enabled = true,
  skin,
  hair,
  eyes,
  unityMode = PreviewUnityMode.BUILDER,
  controls,
  onRenderer
}: {
  /** DOM id for the preview iframe — unique per surface so dispose targets the right one. */
  id: string
  /** An address with a published avatar, or 'default' for a mannequin. */
  profile: string
  /** Mannequin shape override; only meaningful with the 'default' profile. */
  bodyShape?: BodyShapeUrn
  urns: string[]
  /**
   * The animation the avatar plays: a base emote, or the URN of the outfit's own emote. It travels
   * here rather than in `urns` because Unity ignores an emote it finds in the worn list.
   */
  emote?: PreviewEmote | string
  /** Caller gate — false while its inputs (profile lookup, catalog resolution) are settling. */
  enabled?: boolean
  /**
   * Which Unity mode renders it. BUILDER by default (see above) — and note that only MARKETPLACE gives
   * the scene playback controls of its own, so a caller that changes this owns the question of whether
   * to keep passing `controls` too.
   */
  unityMode?: PreviewUnityMode
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
  /** The renderer the preview actually used, so the caller can drop controls Unity provides itself. */
  onRenderer?: (renderer: PreviewRenderer) => void
}) {
  const fittingOpen = useCart(s => s.fittingOpen)
  const { ref: viewportRef, active } = usePreviewActive<HTMLDivElement>()

  // A published emote can't be named to the preview — it travels as its own definition (lib/emoteBase64).
  // Resolve it BEFORE mounting, so the iframe is built once with the emote in hand instead of loading the
  // avatar and reloading it a moment later. A lookup that fails just leaves the avatar still.
  const emoteUrn = emote && isEmoteUrn(emote) ? emote : null
  const { base64: emoteBase64, loop: emoteLoops, isLoading: emoteLoading } = useEmoteBase64(emoteUrn)

  const mounted = enabled && urns.length > 0 && active && !fittingOpen && !emoteLoading

  // The preview must resolve the URNs on the chain THEY name — in a dev build reading the mainnet
  // catalog (the seeds setup), the app chain says amoy while the outfit's items are matic. It has to be
  // the first urn that NAMES a network, not simply the first one: when the shopper's own avatar is
  // composed in, the list opens with their base wearables, whose off-chain urns name none.
  const dev = urnNetwork(urns) === ChainName.MATIC_AMOY

  // Mask every (re)load — changed urns reload the same iframe in place, so cover it until onLoad.
  const [ready, setReady] = useState(false)
  const urnsSig = urns.join(',')
  useEffect(() => {
    setReady(false)
  }, [urnsSig, profile, emote, skin, hair, eyes])
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
          // A built-in animation is named; a published emote is sent whole. The urn stays in `urns` too,
          // where Babylon can still find it if this lookup came back empty.
          emote={emoteUrn ? undefined : (emote as PreviewEmote)}
          base64s={emoteBase64 ? [emoteBase64] : undefined}
          // The playback bar tracks time in JS and decides on its own whether to restart at the end, and
          // the definition it would read that from is one the preview only builds for its single-item form
          // (contract + item) — never from `base64s`. With no definition it falls back to the DEFAULT emote,
          // which is idle, which loops: the bar looped a play-once emote forever while the avatar stood
          // still. Turning the default off removes that fallback, leaving the bar to stop with the emote.
          // A looping emote keeps the fallback, whose verdict happens to be the right one.
          disableDefaultEmotes={!!emoteBase64 && !emoteLoops}
          unityMode={unityMode}
          disableBackground
          disableFadeEffect
          dev={dev}
          onRenderer={onRenderer}
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
