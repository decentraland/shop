import { lazy, Suspense, useEffect, useState } from 'react'
import { PreviewEmote, PreviewEmoteEventType, PreviewType } from '@dcl/schemas'
// Deep import: the controller hook is tiny (schemas + postMessage plumbing) — the heavy preview
// component itself stays behind LazyWearablePreview.
import { useWearablePreviewController } from 'decentraland-ui2/dist/components/WearablePreview/useWearablePreviewController'
import { WearablePreview } from '~/components/LazyWearablePreview'
import { usePreviewActive } from '~/hooks/usePreviewActive'
import * as S from './LivePromo.styles'

// Reuses the fitting room's WebGL backdrop; lazy so its shader/pattern chunk never touches the home's
// initial bundle (it loads only once a tile is on screen).
const AnimatedBackground = lazy(() => import('~/components/AnimatedBackground/AnimatedBackground'))

// The close-up framing (dialed in with ?tweak). Passed as the preview's native zoom config rather
// than sent through the runtime zoom API: the engine re-frames the camera while assets stream in,
// and a zoom applied from outside gets eaten by that — the config survives every re-frame.
const BAKED_ZOOM = 100

// The 3D engine is worth paying for only on hover-capable desktops — touch devices keep the static art.
const canAnimate = () =>
  typeof window !== 'undefined' &&
  window.matchMedia &&
  window.matchMedia('(hover: hover) and (min-width: 769px)').matches

type Props = {
  /** Stable wearable-preview iframe id (one per tile). */
  id: string
  /** Router destination for the whole tile. */
  to: string
  /** Look worn by the avatar. Mainnet urns — the iframe fetches its own data, whatever the app env.
   *  An emote urn drives the motion and MUST come first (see lib/outfit's outfitPreviewUrns: Babylon
   *  picks the last emote among the urns, Unity reads urns[0] — first is the one both agree on). */
  urns: string[]
  title: string
  cta: string
  ariaLabel: string
  /** Static art: boot placeholder, mobile art and error fallback. */
  fallback: string
  fallbackAlt: string
}

// DEV tweak mode (?tweak): per-tile sliders wired to the live preview controller, to dial in each
// look's scale/rotation/placement. "Copy" puts the values on the clipboard to be baked into props.
const tweakMode = () =>
  import.meta.env.DEV && typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('tweak')

type TweakValues = {
  zoom: number
  alpha: number
  beta: number
  panX: number
  panY: number
  width: number
  crest: number
  pattern: number
}

export type TweakLayout = { width: number; crest: number; pattern: number }

const TWEAK_DEFAULTS: TweakValues = {
  zoom: 0,
  alpha: 1.57,
  beta: 1.45,
  panX: 0,
  panY: 0,
  width: 55,
  crest: 9,
  pattern: 1
}

const TWEAK_FIELDS: Array<{ key: keyof TweakValues; label: string; min: number; max: number; step: number }> = [
  { key: 'zoom', label: 'avatar scale (zoom delta)', min: -6, max: 6, step: 0.05 },
  { key: 'alpha', label: 'rot Y (alpha)', min: -3.14, max: 3.14, step: 0.01 },
  { key: 'beta', label: 'rot X (beta)', min: 0.1, max: 3, step: 0.01 },
  { key: 'panX', label: 'pos X (pan)', min: -2, max: 2, step: 0.01 },
  { key: 'panY', label: 'pos Y (pan)', min: -2, max: 2, step: 0.01 },
  { key: 'width', label: 'avatar box width %', min: 30, max: 100, step: 1 },
  { key: 'crest', label: 'crest above card %', min: 0, max: 25, step: 0.5 },
  { key: 'pattern', label: 'bg pattern tiling', min: 0.4, max: 4, step: 0.02 }
]

function TweakPanel({ id, onLayout }: { id: string; onLayout: (layout: TweakLayout) => void }) {
  const { controllerRef, isReady } = useWearablePreviewController(id)
  const [vals, setVals] = useState<TweakValues>(TWEAK_DEFAULTS)

  // Each slider drives ONLY its own control. Sending the whole set on every move snapped the untouched
  // axes to the panel's arbitrary defaults (and panCamera is an OFFSET, so re-sending it accumulated) —
  // which is what used to flip the camera. Pan therefore moves by the delta since the last value.
  const apply = (key: keyof TweakValues, value: number) => {
    const prev = vals
    const next = { ...prev, [key]: value }
    setVals(next)
    if (key === 'width' || key === 'crest' || key === 'pattern') {
      onLayout({ width: next.width, crest: next.crest, pattern: next.pattern })
      return
    }
    const controller = controllerRef.current
    if (!controller || !isReady) return
    if (key === 'panX' || key === 'panY') {
      void controller.scene.panCamera({ x: next.panX - prev.panX, y: next.panY - prev.panY, z: 0 }).catch(() => {})
      return
    }
    if (key === 'zoom') {
      // The zoom API is delta-based (same call the preview's +/- controls make); the slider tracks the
      // cumulative amount so recenter can unwind it.
      void controller.scene.changeZoom(next.zoom - prev.zoom).catch(() => {})
      return
    }
    void controller.scene.changeCameraPosition({ [key]: value }).catch(() => {})
  }

  // Undo everything the panel has sent: the camera trio back to known-good absolutes, the accumulated
  // pan reversed (it has no absolute setter).
  const recenter = () => {
    const controller = controllerRef.current
    if (controller && isReady) {
      void controller.scene
        .changeCameraPosition({ alpha: TWEAK_DEFAULTS.alpha, beta: TWEAK_DEFAULTS.beta })
        .catch(() => {})
      void controller.scene.panCamera({ x: -vals.panX, y: -vals.panY, z: 0 }).catch(() => {})
      void controller.scene.changeZoom(-vals.zoom).catch(() => {})
    }
    setVals(TWEAK_DEFAULTS)
    onLayout({ width: TWEAK_DEFAULTS.width, crest: TWEAK_DEFAULTS.crest, pattern: TWEAK_DEFAULTS.pattern })
  }

  return (
    <div
      style={{
        position: 'absolute',
        left: 8,
        bottom: 8,
        zIndex: 10,
        width: 240,
        padding: 10,
        borderRadius: 10,
        background: 'rgba(10, 4, 18, 0.88)',
        color: '#fff',
        font: '11px/1.5 monospace'
      }}
      onClick={e => {
        e.preventDefault()
        e.stopPropagation()
      }}
    >
      <strong>{id}</strong>
      {TWEAK_FIELDS.map(f => (
        <label key={f.key} style={{ display: 'block', marginTop: 4 }}>
          {f.label}: {vals[f.key]}
          <input
            type="range"
            min={f.min}
            max={f.max}
            step={f.step}
            value={vals[f.key]}
            style={{ width: '100%' }}
            onChange={e => apply(f.key, Number(e.target.value))}
          />
        </label>
      ))}
      <button
        type="button"
        style={{ marginTop: 6, width: '100%', padding: 4 }}
        onClick={() => {
          const json = JSON.stringify(vals)
          void navigator.clipboard?.writeText(`${id}: ${json}`).catch(() => {})
          console.log('[LivePromo tweak]', id, json)
        }}
      >
        copy values
      </button>
      <button type="button" style={{ marginTop: 4, width: '100%', padding: 4 }} onClick={recenter}>
        recenter
      </button>
    </div>
  )
}

// Post-load tuning: mutes the emote's audio and replays it whenever it ends so the animation runs
// in a loop (the preview plays an emote item once by itself). Mounted only after onLoad so the
// iframe the controller binds to exists.
function PreviewTuning({ id }: { id: string }) {
  const { controllerRef, isReady } = useWearablePreviewController(id)

  useEffect(() => {
    if (!isReady) return
    const controller = controllerRef.current
    if (!controller) return
    // Some emotes ship a loud audio track — the promo is ambient, so it stays muted.
    void controller.emote.disableSound().catch(() => {})
    const replay = () => {
      void controller.emote.play().catch(() => {})
    }
    controller.emote.events.on(PreviewEmoteEventType.ANIMATION_END, replay)
    return () => {
      controller.emote.events.off(PreviewEmoteEventType.ANIMATION_END, replay)
    }
  }, [isReady, controllerRef])

  return null
}

// A live promo tile: a real avatar performing a look/emote over the fitting room's animated backdrop.
export function LivePromo({ id, to, urns, title, cta, ariaLabel, fallback, fallbackAlt }: Props) {
  const [animate] = useState(canAnimate)
  const [ready, setReady] = useState(false)
  const [failed, setFailed] = useState(false)
  const [tweak] = useState(tweakMode)
  const [layout, setLayout] = useState<TweakLayout | null>(null)
  // Mount the iframe + WebGL backdrop only while the tile is on screen and the tab visible.
  const { ref, active } = usePreviewActive<HTMLAnchorElement>()

  const live = animate && !failed
  const show = live && ready

  return (
    <S.Tile
      ref={ref}
      to={to}
      aria-label={ariaLabel}
      data-crest={show || undefined}
      style={layout ? ({ '--lp-crest': `${layout.crest}%` } as React.CSSProperties) : undefined}
    >
      <S.CardBg>
        {live && active ? (
          <Suspense fallback={null}>
            {/* Tiling 1 (vs the fitting room's 1.66): larger drifting tiles suit the smaller card. */}
            <AnimatedBackground patternTiling={layout?.pattern ?? 1} />
          </Suspense>
        ) : null}
        <S.Inner data-ready={show || undefined}>
          <S.Title>{title}</S.Title>
          <S.Cta>{cta}</S.Cta>
        </S.Inner>
        <S.Fallback src={fallback} alt={fallbackAlt} data-hidden={show || undefined} />
      </S.CardBg>
      {live && active ? (
        <>
          <S.Avatar data-ready={show || undefined} style={layout ? { width: `${layout.width}%` } : undefined}>
            <WearablePreview
              id={id}
              profile="default"
              urns={urns}
              type={PreviewType.AVATAR}
              emote={PreviewEmote.FASHION}
              zoom={BAKED_ZOOM}
              disableBackground
              /* Widens the camera's radius limits (the preview clamps zoom otherwise) so the tweak
                 panel's scale actually bites. Wheel input never reaches the iframe (pointer-events:
                 none on the wrapper), so this only defines the range. */
              wheelZoom={2.5}
              /* The featured looks are MAINNET items; pin the preview to mainnet endpoints so the tiles
                 render on every env (the wrapper otherwise injects the app env's .zone peers, where
                 these urns don't exist). */
              dev={false}
              peerUrl="https://peer.decentraland.org"
              marketplaceServerUrl="https://marketplace-api.decentraland.org"
              onLoad={() => setReady(true)}
              onError={() => setFailed(true)}
            />
          </S.Avatar>
          {ready ? <PreviewTuning id={id} /> : null}
          {tweak && ready ? <TweakPanel id={id} onLayout={setLayout} /> : null}
        </>
      ) : null}
    </S.Tile>
  )
}
