import { lazy, Suspense, useEffect, useState } from 'react'
import { PreviewEmoteEventType, type PreviewEmote } from '@dcl/schemas'
// Deep import: the controller hook is tiny (schemas + postMessage plumbing) — the heavy preview
// component itself stays behind LazyWearablePreview.
import { useWearablePreviewController } from 'decentraland-ui2/dist/components/WearablePreview/useWearablePreviewController'
import { WearablePreview } from '~/components/LazyWearablePreview'
import { usePreviewActive } from '~/hooks/usePreviewActive'
import * as S from './LivePromo.styles'

// Reuses the fitting room's WebGL backdrop; lazy so its shader/pattern chunk never touches the home's
// initial bundle (it loads only once a tile is on screen).
const AnimatedBackground = lazy(() => import('~/components/AnimatedBackground/AnimatedBackground'))

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
   *  Include an emote urn to have it auto-play; or pass `emote` for a built-in pose instead. */
  urns: string[]
  /** Built-in pose/animation (e.g. PreviewEmote.FASHION). Omit when an emote urn drives the motion. */
  emote?: PreviewEmote
  /** Camera zoom — higher is closer. Tune per look so the avatar fills the tile. */
  zoom?: number
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

type TweakValues = { radius: number; alpha: number; beta: number; panX: number; panY: number; width: number }

const TWEAK_DEFAULTS: TweakValues = { radius: 2.5, alpha: 1.57, beta: 1.45, panX: 0, panY: 0.9, width: 55 }

const TWEAK_FIELDS: Array<{ key: keyof TweakValues; label: string; min: number; max: number; step: number }> = [
  { key: 'radius', label: 'scale (radius)', min: 0.6, max: 7, step: 0.05 },
  { key: 'alpha', label: 'rot Y (alpha)', min: -3.14, max: 3.14, step: 0.01 },
  { key: 'beta', label: 'rot X (beta)', min: 0.1, max: 3, step: 0.01 },
  { key: 'panX', label: 'pos X (pan)', min: -2, max: 2, step: 0.01 },
  { key: 'panY', label: 'pos Y (pan)', min: -2, max: 2, step: 0.01 },
  { key: 'width', label: 'box width %', min: 30, max: 100, step: 1 }
]

function TweakPanel({ id, onWidth }: { id: string; onWidth: (width: number) => void }) {
  const { controllerRef, isReady } = useWearablePreviewController(id)
  const [vals, setVals] = useState<TweakValues>(TWEAK_DEFAULTS)

  const apply = (next: TweakValues) => {
    setVals(next)
    onWidth(next.width)
    const controller = controllerRef.current
    if (!controller || !isReady) return
    void controller.scene
      .changeCameraPosition({ alpha: next.alpha, beta: next.beta, radius: next.radius })
      .catch(() => {})
    void controller.scene.panCamera({ x: next.panX, y: next.panY, z: 0 }).catch(() => {})
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
            onChange={e => apply({ ...vals, [f.key]: Number(e.target.value) })}
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
    </div>
  )
}

// Replays the emote whenever it ends, so the tile's animation runs in a loop (the preview app plays an
// emote item once by itself). Mounted only after onLoad so the iframe the controller binds to exists.
function EmoteLoop({ id }: { id: string }) {
  const { controllerRef, isReady } = useWearablePreviewController(id)

  useEffect(() => {
    if (!isReady) return
    const controller = controllerRef.current
    if (!controller) return
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
export function LivePromo({ id, to, urns, emote, zoom, title, cta, ariaLabel, fallback, fallbackAlt }: Props) {
  const [animate] = useState(canAnimate)
  const [ready, setReady] = useState(false)
  const [failed, setFailed] = useState(false)
  const [tweak] = useState(tweakMode)
  const [tweakWidth, setTweakWidth] = useState<number | null>(null)
  // Mount the iframe + WebGL backdrop only while the tile is on screen and the tab visible.
  const { ref, active } = usePreviewActive<HTMLAnchorElement>()

  const live = animate && !failed
  const show = live && ready

  return (
    <S.Tile ref={ref} to={to} aria-label={ariaLabel}>
      {live && active ? (
        <>
          <Suspense fallback={null}>
            <AnimatedBackground />
          </Suspense>
          <S.Avatar data-ready={show || undefined} style={tweakWidth != null ? { width: `${tweakWidth}%` } : undefined}>
            <WearablePreview
              id={id}
              profile="default"
              urns={urns}
              emote={emote}
              zoom={zoom}
              disableBackground
              onLoad={() => setReady(true)}
              onError={() => setFailed(true)}
            />
          </S.Avatar>
          {ready ? <EmoteLoop id={id} /> : null}
          {tweak && ready ? <TweakPanel id={id} onWidth={setTweakWidth} /> : null}
          <S.Inner data-ready={show || undefined}>
            <S.Title>{title}</S.Title>
            <S.Cta>{cta}</S.Cta>
          </S.Inner>
        </>
      ) : null}
      <S.Fallback src={fallback} alt={fallbackAlt} data-hidden={show || undefined} />
    </S.Tile>
  )
}
