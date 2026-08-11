import { useEffect, useRef, useState, type CSSProperties } from 'react'
import styled from '@emotion/styled'
import { useLocation } from 'react-router-dom'
import { PreviewEmote, PreviewType } from '@dcl/schemas'
import { PreviewMessageType, sendMessage } from '@dcl/schemas/dist/dapps/preview'
import { WearablePreview } from '~/components/LazyWearablePreview'
import { useCart } from '~/store/cart'
import { useHoverPreview } from '~/store/hoverPreview'
import { useWallet } from '~/store/wallet'
import { useProfile } from '~/hooks/useProfile'
import { avatarShape, isCompatible } from '~/lib/bodyShape'
import { RING_INSET } from '~/styles/card.styles'
import { theme } from '~/styles/theme'

// The corner left once the hover stroke has taken its bite out of the card's own radius.
const INNER_RADIUS = Number.parseFloat(theme.radius.card) - RING_INSET
if (process.env.NODE_ENV !== 'production' && Number.isNaN(INNER_RADIUS)) {
  throw new Error(`INNER_RADIUS is NaN — theme.radius.card ("${theme.radius.card}") is not a numeric string`)
}

const Wrap = styled.div`
  & iframe {
    width: 100%;
    height: 100%;
    border: 0;
    display: block;
    background: transparent;
  }
`

// ONE persistent WearablePreview for the whole app. It boots a single 3D engine once (while the
// browser is idle) and then, on card hover, is repositioned over the hovered card and told to load
// that card's wearable via a postMessage UPDATE — the SAME channel WearablePreview uses internally.
// Its own `src` never changes (stable base props: default avatar, no item), so the iframe never
// reloads: a hover swaps the loaded GLB on a warm engine instead of standing up a fresh iframe +
// WebGL context + engine from scratch (what per-card previews did, and why hover felt slow).
//
// The layer is pointer-events:none and sits above the card media, so hovering/clicking passes
// straight through to the card (hover stays active; the whole-card link still navigates) and the
// cross-origin iframe never surfaces its internal content-URL tooltip.
const IFRAME_ID = 'hover-preview'

// Path prefixes of the surfaces that mount a heavy WearablePreview of their own: the item PDP
// (/item/*, /token/*), the outfit detail page and the outfit studio. Prefixes rather than exact
// routes, so anything nested under them counts too. None of these show card hover previews.
const OWN_PREVIEW_PREFIXES = ['/item/', '/token/', '/items/outfits/', '/outfits/']

export function HoverPreviewLayer() {
  // Never keep a SECOND engine warm off-screen while another surface owns the live preview — that
  // stacked two (sometimes three) live WebGL contexts and pegged the GPU. That means both the pages
  // that mount their own preview AND the Fitting Room, which owns the single live avatar while it is
  // open. The layer re-boots on idle once the shopper is back on a grid, where hover previews are used.
  const { pathname } = useLocation()
  const fittingOpen = useCart(s => s.fittingOpen)
  const suspended = fittingOpen || OWN_PREVIEW_PREFIXES.some(prefix => pathname.startsWith(prefix))

  const item = useHoverPreview(s => s.item)
  const anchor = useHoverPreview(s => s.anchor)
  const token = useHoverPreview(s => s.token)
  const ready = useHoverPreview(s => s.ready)
  const setReady = useHoverPreview(s => s.setReady)

  // Dress the hovered item on the shopper's own avatar when they have a compatible one.
  // Only pass the address once useProfile confirms a published avatar
  // (a real address with none renders empty), so signed-out or empty accounts stay on a mannequin.
  const address = useWallet(s => s.session?.address)
  const { data: avatar } = useProfile(address)

  // Defer mounting the iframe to browser idle so warming never competes with the initial page render.
  const [mounted, setMounted] = useState(false)
  const [booted, setBooted] = useState(false) // engine up (first default-avatar LOAD seen)
  const bootedRef = useRef(false)
  // The token we last asked the engine to load — a LOAD only means "ready" if it still matches.
  const loadingTokenRef = useRef(-1)
  const [rect, setRect] = useState<DOMRect | null>(null)

  useEffect(() => {
    if (typeof window.requestIdleCallback === 'function') {
      const id = window.requestIdleCallback(() => setMounted(true), { timeout: 3000 })
      return () => window.cancelIdleCallback(id)
    }
    const id = window.setTimeout(() => setMounted(true), 1500)
    return () => window.clearTimeout(id)
  }, [])

  // Being suspended tears the iframe down, so the next one boots a fresh engine. Forget the boot, or
  // that engine's first LOAD — the default avatar — is read as the answer to a hover and reveals a bare
  // mannequin under the card the mouse happens to be on.
  useEffect(() => {
    if (!suspended) return
    bootedRef.current = false
    loadingTokenRef.current = -1
    setBooted(false)
  }, [suspended])

  // Track the anchored card's on-screen rect; follow it on scroll/resize while a preview is active.
  useEffect(() => {
    if (!anchor) {
      setRect(null)
      return
    }
    let raf = 0
    const update = () => setRect(anchor.getBoundingClientRect())
    update()
    const onMove = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(update)
    }
    window.addEventListener('scroll', onMove, true)
    window.addEventListener('resize', onMove)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('scroll', onMove, true)
      window.removeEventListener('resize', onMove)
    }
  }, [anchor])

  // Point the warm engine at the hovered item. Re-runs when the item/token changes, and once more when
  // the engine boots (so an item hovered before boot still loads). UPDATE is dropped by the app before
  // it's READY, hence the boot gate + resend.
  useEffect(() => {
    if (!item) return
    const iframe = document.getElementById(IFRAME_ID) as HTMLIFrameElement | null
    if (!iframe?.contentWindow) return
    // Only advance the token AFTER the boot gate — i.e. only when we actually dispatch an UPDATE. If we
    // stamped it on every effect run (incl. a pre-boot hover that sends nothing), it would always equal
    // the store token and handleLoad's staleness check would be a no-op.
    if (!bootedRef.current) return
    loadingTokenRef.current = token
    const isEmote = item.category === 'emote'
    // On the connected avatar when it can wear the item (emotes are shape-agnostic, so any avatar works);
    // otherwise a default mannequin of a shape the item DOES support, so gendered items never render invisible.
    const onAvatar = !!address && !!avatar && isCompatible(item, avatarShape(avatar))
    // Identify the asset by its URN when the row carries one, and only fall back to contractAddress +
    // itemId when it doesn't. The fallback is not equivalent: from a bare contract + item the preview app
    // builds `urn:decentraland:matic:collections-v2:<contract>:<itemId>` and looks THAT up, so it only ever
    // works for Polygon collections-v2. An Ethereum collections-v1 wearable answers
    // "Could not find wearable or emote for urn=…matic:collections-v2…", the scene never loads, no LOAD
    // event arrives and `ready` stays false — the layer sits at opacity 0 and the hover preview looks
    // simply absent. That is most of the Not-for-Sale grid (measured: 28 of 48 rows are ETHEREUM), which is
    // why hover previews worked on the on-sale grid (100% Polygon) and not there. The two are mutually
    // exclusive so the preview cannot resolve one and render the other.
    const urnOptions = item.urn
      ? { urns: [item.urn] }
      : { contractAddress: item.contractAddress, itemId: item.itemId ?? undefined }
    sendMessage(iframe.contentWindow, PreviewMessageType.UPDATE, {
      options: {
        ...urnOptions,
        profile: onAvatar ? address : 'default',
        // Load straight into the fashion pose (like the per-card previews) so the avatar doesn't flash
        // a T-pose; emotes auto-detect + play their own animation.
        type: isEmote ? undefined : PreviewType.AVATAR,
        emote: isEmote ? undefined : PreviewEmote.FASHION,
        disableBackground: true,
        disableFadeEffect: true
      }
    })
  }, [item, token, booted, address, avatar])

  function handleLoad() {
    // The FIRST LOAD is the default avatar rendering = engine booted; it's not an item load.
    if (!bootedRef.current) {
      bootedRef.current = true
      setBooted(true)
      return
    }
    // A later LOAD is the response to our latest UPDATE — mark ready only if a card is still hovered
    // (guard against a LOAD landing after hide(), which would set ready:true with item:null) AND it's
    // still the current token (not a stale load from a card the mouse already left).
    const s = useHoverPreview.getState()
    if (s.item && s.token === loadingTokenRef.current) setReady()
  }

  if (!mounted || suspended) return null

  const active = !!item && !!rect
  const wrapStyle: CSSProperties = active
    ? {
        position: 'fixed',
        /**
         * Held INSIDE the card's hover stroke, and clipped to the shape that leaves.
         *
         * The anchor is the card's media band, which runs to the card's edge — exactly the strip the stroke
         * covers on hover. This layer is position:fixed in the root stacking context, so the card's
         * `overflow: hidden` never reaches it and it paints above everything: at the card's edge it laid its
         * own antialiased boundary straight over the stroke. That is the pale sliver, and it is why the
         * sliver appeared over the media and never over the footer — this is the only thing sitting over the
         * media.
         *
         * Rounding it to the card's radius was not enough: that arc is concentric with the stroke's OUTER
         * edge, so around the corner the layer still crossed the band. It has to stop at the stroke's inner
         * edge — inset by the stroke's width on the three sides the stroke covers (the bottom meets the
         * footer), with the matching inner radius.
         *
         * The offsets are whole pixels because `getBoundingClientRect` reports fractions (the grid divides
         * the row by three), and a fixed box holding an iframe at a fractional offset gets its own
         * composited layer whose edges Chrome antialiases — the same bright half-pixel, by another route.
         */
        left: Math.round(rect.left) + RING_INSET,
        top: Math.round(rect.top) + RING_INSET,
        width: Math.round(rect.width) - RING_INSET * 2,
        height: Math.round(rect.height) - RING_INSET,
        borderRadius: `${INNER_RADIUS}px ${INNER_RADIUS}px 0 0`,
        overflow: 'hidden',
        zIndex: 5,
        pointerEvents: 'none',
        opacity: ready ? 1 : 0,
        transition: 'opacity .25s ease'
      }
    : // Parked offscreen but kept mounted so the engine stays warm between hovers.
      {
        position: 'fixed',
        left: -9999,
        top: -9999,
        width: 2,
        height: 2,
        opacity: 0,
        pointerEvents: 'none',
        overflow: 'hidden'
      }

  return (
    <Wrap aria-hidden style={wrapStyle}>
      <WearablePreview id={IFRAME_ID} profile="default" disableBackground disableFadeEffect onLoad={handleLoad} />
    </Wrap>
  )
}
