import { useEffect, useRef, useState, type CSSProperties } from 'react'
import styled from '@emotion/styled'
import { useLocation } from 'react-router-dom'
import { PreviewEmote, PreviewType } from '@dcl/schemas'
import { PreviewMessageType, sendMessage } from '@dcl/schemas/dist/dapps/preview'
import { WearablePreview } from '~/components/LazyWearablePreview'
import { canHover } from '~/lib/hover'
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

// Slack around the heart's box when cutting it out of the preview (see `notch`), so no antialiased edge
// of the layer survives along the button's own edge.
const NOTCH_PAD = 1

// Poses a hovered WEARABLE can strike. It used to be FASHION and only FASHION, so every card in the
// grid played the identical animation and the rail read as one avatar copy-pasted. Restricted to poses
// that keep the avatar planted and framed inside a card-sized viewport — walk/run/jump translate it out
// of frame, and idle is what the shopper is hovering to get away from.
const HOVER_POSES = [
  PreviewEmote.FASHION,
  PreviewEmote.FASHION_2,
  PreviewEmote.FASHION_3,
  PreviewEmote.FASHION_4,
  PreviewEmote.DANCE,
  PreviewEmote.LOVE,
  PreviewEmote.MONEY,
  PreviewEmote.WAVE,
  PreviewEmote.CLAP,
  PreviewEmote.FIST_PUMP
]

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

  // Defer mounting the iframe so warming never competes with the initial page render (see the effect).
  const [mounted, setMounted] = useState(false)
  const [booted, setBooted] = useState(false) // engine up (first default-avatar LOAD seen)
  const bootedRef = useRef(false)
  // The token we last asked the engine to load — a LOAD only means "ready" if it still matches.
  const loadingTokenRef = useRef(-1)
  const [rect, setRect] = useState<DOMRect | null>(null)
  // Where the hovered card's heart sits inside this layer's box, so the layer can cut that corner away.
  // The layer is fixed in the ROOT stacking context and the card isolates its own, so nothing the card
  // draws can come out above it: without the cut the preview covers the heart exactly while the shopper
  // is hovering to reach it.
  const [notch, setNotch] = useState<{ left: number; bottom: number } | null>(null)
  // The pose is drawn ONCE per hover and held for it: the UPDATE effect re-runs on boot/avatar changes
  // too, and re-rolling there would snap the avatar into a different animation mid-hover. Keyed on the
  // store's hover token, which bumps on show() and ignores re-entering the same card.
  const poseRef = useRef({ token: -1, emote: HOVER_POSES[0] })

  // Warm the engine only where the feature can be reached, and only once the page it is speculating on
  // has finished loading.
  //
  // The pointer check is not a device check for its own sake: a card's hover handler bails out unless
  // `(hover: hover)` matches (AssetCard `onEnter`, same `canHover`), so on a touch device this engine can
  // never be asked for anything — and it was still pulling ~1.2MB of Babylon on every phone load.
  //
  // Waiting for `load` is not a delay picked to move a metric either. The idle callback used to run on its
  // own with `timeout: 3000`, and on a page whose main thread is busy — which is precisely when this
  // fires — the timeout is what wins, so the warm-up landed in the middle of the initial load and took
  // bandwidth from the content the visitor actually asked for. Idle after `load` is the same speculation,
  // in the window it belongs to.
  //
  // This is SPECULATION ONLY. Real demand does not come through here — see the effect below, which is
  // what keeps the wait off the visitor.
  useEffect(() => {
    if (!canHover()) return
    let idle: number | undefined
    const warm = () => {
      idle =
        typeof window.requestIdleCallback === 'function'
          ? window.requestIdleCallback(() => setMounted(true), { timeout: 2000 })
          : window.setTimeout(() => setMounted(true), 200)
    }
    const cancel = () => {
      if (idle === undefined) return
      if (typeof window.cancelIdleCallback === 'function') window.cancelIdleCallback(idle)
      else window.clearTimeout(idle)
    }
    // `load` has no replay: a component mounted after it would wait for an event that already fired.
    if (document.readyState === 'complete') {
      warm()
      return cancel
    }
    window.addEventListener('load', warm, { once: true })
    return () => {
      window.removeEventListener('load', warm)
      cancel()
    }
  }, [])

  // A hover jumps the queue above, and must: the warm-up is speculation and waits for `load`, but a page
  // can sit in `interactive` for seconds behind one slow non-critical resource with the first row of cards
  // already on screen and hoverable. Making someone wait on an unrelated download AFTER they asked for the
  // feature is the one cost the deferral must not have.
  //
  // It is also what covers a pointer that gains hover after mount. `canHover()` above is read once, in an
  // effect with no dependencies, while a card re-checks it on every enter — so a mouse attached to a
  // touch device would leave the card asking a layer that had decided, permanently, not to exist.
  // Demand is the source of truth; the warm-up only tries to be early.
  useEffect(() => {
    if (item) setMounted(true)
  }, [item])

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
      setNotch(null)
      return
    }
    let raf = 0
    // Measured rather than derived: the button's width follows its save count and the hovered card is
    // scaled, so the box it actually occupies is the only reliable one.
    const favEl = anchor.parentElement?.querySelector('[data-testid="card-fav"]') ?? null
    const update = () => {
      const anchorRect = anchor.getBoundingClientRect()
      setRect(anchorRect)
      const fav = favEl?.getBoundingClientRect()
      setNotch(
        fav
          ? {
              left: fav.left - (Math.round(anchorRect.left) + RING_INSET) - NOTCH_PAD,
              bottom: fav.bottom - (Math.round(anchorRect.top) + RING_INSET) + NOTCH_PAD
            }
          : null
      )
    }
    update()
    const onMove = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(update)
    }
    // The heart WIDENS when its save count lands, which can happen after the hover started and after the
    // preview is already showing. Nothing else re-measures for that — scroll and resize do not fire for a
    // button growing in place — and a cut that is narrower than the button is the same bug as no cut at
    // all, one digit further right.
    const favResize = favEl && typeof ResizeObserver === 'function' ? new ResizeObserver(onMove) : null
    if (favEl && favResize) favResize.observe(favEl)
    window.addEventListener('scroll', onMove, true)
    window.addEventListener('resize', onMove)
    return () => {
      cancelAnimationFrame(raf)
      favResize?.disconnect()
      window.removeEventListener('scroll', onMove, true)
      window.removeEventListener('resize', onMove)
    }
  }, [anchor])

  // A fresh pose per hover, never the same one twice running — a repeat reads as the feature not working.
  function poseFor(hoverToken: number) {
    if (poseRef.current.token !== hoverToken) {
      const options = HOVER_POSES.filter(e => e !== poseRef.current.emote)
      poseRef.current = { token: hoverToken, emote: options[Math.floor(Math.random() * options.length)] }
    }
    return poseRef.current.emote
  }

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
        // Load straight into a pose so the avatar doesn't flash a T-pose; emotes auto-detect + play
        // their own animation.
        type: isEmote ? undefined : PreviewType.AVATAR,
        emote: isEmote ? undefined : poseFor(token),
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
        clipPath: notch
          ? `polygon(0 0, ${notch.left}px 0, ${notch.left}px ${notch.bottom}px, 100% ${notch.bottom}px, 100% 100%, 0 100%)`
          : undefined,
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
      <WearablePreview
        id={IFRAME_ID}
        profile="default"
        unity={false}
        disableBackground
        disableFadeEffect
        onLoad={handleLoad}
      />
    </Wrap>
  )
}
