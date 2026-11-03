import { useEffect, useRef, useState } from 'react'
import { between } from '~/lib/random'
import * as S from './Snowfall.styles'

/**
 * Which plane the snow falls in.
 *
 * `back` is the dense, small, sharp layer BEHIND the page's content, seen through the gaps like the bats.
 * `front` is a handful of large, soft flakes OVER it, out of focus as if close to the lens. The two together
 * are what give the snow depth; either alone reads as a screensaver.
 */
export type SnowDepth = 'back' | 'front'

type Layer = {
  /** Flakes per million square pixels of viewport, so a phone is not buried and a wide monitor not bare. */
  density: number
  max: number
  radius: readonly [number, number]
  /** Fall speed in px/s. */
  speed: readonly [number, number]
  opacity: readonly [number, number]
  /** How far a flake sways side to side, in px/s at the peak of its swing. */
  sway: readonly [number, number]
  /** How soft the sprite's edge is: 0 is a hard dot, 1 is all haze. */
  softness: number
}

const LAYERS: Record<SnowDepth, Layer> = {
  back: {
    density: 90,
    max: 220,
    radius: [1, 3],
    speed: [22, 58],
    opacity: [0.45, 0.95],
    sway: [6, 22],
    softness: 0.35
  },
  front: { density: 9, max: 18, radius: [6, 13], speed: [45, 85], opacity: [0.18, 0.4], sway: [10, 30], softness: 1 }
}

/** The sprite every flake is stamped from, drawn once. Large enough that scaling it down never shows pixels. */
const SPRITE_PX = 64

/** The tab may hand back a long frame after sleeping; past this the snow just resumes instead of jumping. */
const MAX_STEP_S = 0.05

/** A gentle steady breeze, so the whole fall leans the same way instead of each flake wandering alone. */
const WIND_PX_S = 8

type Flake = { x: number; y: number; r: number; vy: number; sway: number; phase: number; freq: number; alpha: number }

function makeSprite(softness: number): HTMLCanvasElement {
  const sprite = document.createElement('canvas')
  sprite.width = sprite.height = SPRITE_PX
  const ctx = sprite.getContext('2d')
  if (!ctx) return sprite
  const c = SPRITE_PX / 2
  const glow = ctx.createRadialGradient(c, c, 0, c, c, c)
  glow.addColorStop(0, 'rgba(255, 255, 255, 1)')
  glow.addColorStop(1 - softness * 0.8, 'rgba(255, 255, 255, 0.9)')
  glow.addColorStop(1, 'rgba(255, 255, 255, 0)')
  ctx.fillStyle = glow
  ctx.fillRect(0, 0, SPRITE_PX, SPRITE_PX)
  return sprite
}

function makeFlake(layer: Layer, width: number, height: number, anywhere: boolean): Flake {
  const r = between(layer.radius)
  return {
    x: Math.random() * width,
    // The first fill is spread over the whole viewport so the page opens mid-snowfall; every flake after
    // that enters from just above the top edge.
    y: anywhere ? Math.random() * height : -r * 2,
    r,
    // Bigger flakes fall faster, which is most of what makes the layer read as having depth inside it.
    vy: between(layer.speed) * (0.7 + (0.6 * (r - layer.radius[0])) / (layer.radius[1] - layer.radius[0] || 1)),
    sway: between(layer.sway),
    phase: Math.random() * Math.PI * 2,
    freq: 0.4 + Math.random() * 0.8,
    alpha: between(layer.opacity)
  }
}

function prefersReducedMotion(): boolean {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
}

/**
 * Snow falling across the whole viewport. Mounted only while the holiday skin is on.
 *
 * A canvas rather than DOM flakes: two hundred elements each with its own animation is a style recalc
 * storm on every frame, while one canvas is a single composited layer. Every flake is a stamp of the same
 * pre-drawn sprite, so a frame is only `drawImage` calls.
 *
 * Stops drawing while the tab is hidden, and renders nothing at all for a reader who asked for less motion.
 */
export function Snowfall({ depth }: { depth: SnowDepth }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [still, setStill] = useState(prefersReducedMotion)

  useEffect(() => {
    const query = window.matchMedia?.('(prefers-reduced-motion: reduce)')
    if (!query) return
    const onChange = () => setStill(query.matches)
    query.addEventListener?.('change', onChange)
    return () => query.removeEventListener?.('change', onChange)
  }, [])

  useEffect(() => {
    if (still) return
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return

    const layer = LAYERS[depth]
    const sprite = makeSprite(layer.softness)
    let width = 0
    let height = 0
    let flakes: Flake[] = []
    let frame = 0
    let last = 0
    let elapsed = 0

    const resize = () => {
      // Capped at 2: past that the extra pixels cost fill rate on exactly the screens that have the least to spare.
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      // Reallocating the backing store is the expensive part, and mobile browsers fire resize for every
      // twitch of the URL bar; a no-op resize keeps the canvas it has.
      if (window.innerWidth === width && window.innerHeight === height && canvas.width === Math.round(width * dpr)) {
        return
      }
      width = window.innerWidth
      height = window.innerHeight
      canvas.width = Math.round(width * dpr)
      canvas.height = Math.round(height * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      const count = Math.min(layer.max, Math.round((width * height * layer.density) / 1_000_000))
      // Kept across resizes so rotating a phone does not restart the fall; only the count is corrected.
      flakes = flakes.slice(0, count)
      while (flakes.length < count) flakes.push(makeFlake(layer, width, height, true))
    }

    const draw = (now: number) => {
      const dt = last ? Math.min((now - last) / 1000, MAX_STEP_S) : 0
      last = now
      elapsed += dt
      ctx.clearRect(0, 0, width, height)
      for (let i = 0; i < flakes.length; i++) {
        const f = flakes[i]
        f.y += f.vy * dt
        f.x += (WIND_PX_S + Math.sin(f.phase + elapsed * f.freq) * f.sway) * dt
        if (f.y - f.r > height || f.x - f.r > width || f.x + f.r < 0) {
          flakes[i] = makeFlake(layer, width, height, false)
          continue
        }
        ctx.globalAlpha = f.alpha
        ctx.drawImage(sprite, f.x - f.r, f.y - f.r, f.r * 2, f.r * 2)
      }
      ctx.globalAlpha = 1
      frame = requestAnimationFrame(draw)
    }

    const start = () => {
      if (frame) return
      last = 0
      frame = requestAnimationFrame(draw)
    }
    const stop = () => {
      cancelAnimationFrame(frame)
      frame = 0
    }
    const onVisibility = () => (document.hidden ? stop() : start())

    resize()
    if (!document.hidden) start()
    window.addEventListener('resize', resize)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      stop()
      window.removeEventListener('resize', resize)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [depth, still])

  if (still) return null
  return <S.Canvas ref={canvasRef} aria-hidden data-depth={depth} data-testid={`snowfall-${depth}`} />
}

export default Snowfall
