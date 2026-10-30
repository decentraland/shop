/**
 * How well a photo shows the item, from where its wearer stands in the frame.
 *
 * The client records each visible person's rectangle in the saved photo: normalized to the image, with the
 * origin at its top-left corner. Photos taken before it did have no rectangle, and are ranked by head count
 * instead (see `rankReelPhotos`).
 */
export type ScreenRect = { x: number; y: number; width: number; height: number }

/** Below this share of the photo's height the wearer is too small for the item to be made out. */
const MIN_WEARER_HEIGHT = 0.25

/** A rectangle this close to an edge of the photo runs past it: the person is cut off there. */
const EDGE = 0.02

/** Above this share of the wearer covered by other people, the item is likely behind someone. */
const MAX_COVERED = 0.5

/**
 * Someone this much shorter than the wearer in the photo is taken to stand behind them, and does not cover
 * them. The rectangle has no depth, and in a perspective shot smaller usually means further away.
 */
const IN_FRONT_HEIGHT = 0.8

/** A box touching a side edge and this thin for its height is a person mostly out of frame at that side. */
const MIN_SIDE_WIDTH = 0.08

/** How finely the wearer's box is sampled to measure what others cover, counting each spot once. */
const COVER_SAMPLES = 20

/** How much being near the centre counts, against size: the photographer framed the subject there. */
const CENTRE_WEIGHT = 0.2

// Categories that sit at the bottom of the body, so a wearer cut off at the bottom edge loses the item.
const LOW_CATEGORIES = new Set(['lower_body', 'feet'])

// Categories that sit on the head, so a wearer cut off at the top edge loses the item.
const HEAD_CATEGORIES = new Set([
  'hat',
  'helmet',
  'hair',
  'top_head',
  'tiara',
  'mask',
  'eyewear',
  'earring',
  'facial_hair',
  'eyebrows',
  'eyes',
  'mouth'
])

/**
 * A rectangle from the service, or null when it is missing, empty or not a rectangle of the photo.
 *
 * Rounding can leave a rectangle a hair past any edge, so up to `EDGE` of overflow is accepted on every side
 * alike and clamped back into the photo; anything further out is not a rectangle of it.
 */
export function toScreenRect(raw: unknown): ScreenRect | null {
  if (!raw || typeof raw !== 'object') return null
  const { x, y, width, height } = raw as Record<string, unknown>
  const values = [x, y, width, height]
  if (!values.every(v => typeof v === 'number' && Number.isFinite(v))) return null
  const [left, top, w, h] = values as number[]
  if (w <= 0 || h <= 0) return null
  if (left < -EDGE || top < -EDGE || left + w > 1 + EDGE || top + h > 1 + EDGE) return null
  if (left >= 0 && top >= 0 && left + w <= 1 && top + h <= 1) return { x: left, y: top, width: w, height: h }
  const x0 = Math.max(0, left)
  const y0 = Math.max(0, top)
  const x1 = Math.min(1, left + w)
  const y1 = Math.min(1, top + h)
  if (x1 <= x0 || y1 <= y0) return null
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 }
}

function contains(rect: ScreenRect, x: number, y: number): boolean {
  return x >= rect.x && x <= rect.x + rect.width && y >= rect.y && y <= rect.y + rect.height
}

/** The share of the wearer's box that people in front of them cover, each covered spot counted once. */
function coveredShare(wearer: ScreenRect, others: ScreenRect[]): number {
  const inFront = others.filter(other => other.height >= wearer.height * IN_FRONT_HEIGHT)
  if (inFront.length === 0) return 0
  let covered = 0
  for (let i = 0; i < COVER_SAMPLES; i++) {
    for (let j = 0; j < COVER_SAMPLES; j++) {
      const x = wearer.x + ((i + 0.5) / COVER_SAMPLES) * wearer.width
      const y = wearer.y + ((j + 0.5) / COVER_SAMPLES) * wearer.height
      if (inFront.some(other => contains(other, x, y))) covered++
    }
  }
  return covered / (COVER_SAMPLES * COVER_SAMPLES)
}

/**
 * A score for how clearly the photo shows the item on its wearer, or null when it does not show it.
 *
 * Null when the wearer is too small, mostly out of frame at a side, cut off on the side of the body the
 * item is on, or covered for the most part by people in front of them. Otherwise bigger and more central
 * scores higher, less whatever is covered.
 */
export function framingScore(wearer: ScreenRect, others: ScreenRect[], category: string): number | null {
  if (wearer.height < MIN_WEARER_HEIGHT) return null

  const atSide = wearer.x <= EDGE || wearer.x + wearer.width >= 1 - EDGE
  if (atSide && wearer.width < wearer.height * MIN_SIDE_WIDTH) return null

  const cutAtTop = wearer.y <= EDGE
  const cutAtBottom = wearer.y + wearer.height >= 1 - EDGE
  // An unknown category (the rules lookup failed, or the entity has none) is checked at both edges, like a
  // skin: without knowing where the item sits, a wearer cut off at either end may have lost it.
  const wholeBody = category === 'skin' || !category
  if (cutAtBottom && (wholeBody || LOW_CATEGORIES.has(category))) return null
  if (cutAtTop && (wholeBody || HEAD_CATEGORIES.has(category))) return null

  const covered = coveredShare(wearer, others)
  if (covered > MAX_COVERED) return null

  const centre = wearer.x + wearer.width / 2
  const centrality = 1 - Math.min(1, Math.abs(centre - 0.5) * 2)
  return wearer.height * (1 - covered) + CENTRE_WEIGHT * centrality
}

// The photos are saved at 16:9 and the strip shows them in a 4:5 frame (PhotoReel.styles Tile), so a tile
// sees this share of the photo's width and all of its height.
const PHOTO_ASPECT = 16 / 9
const TILE_ASPECT = 4 / 5
const VISIBLE_WIDTH = TILE_ASPECT / PHOTO_ASPECT

/**
 * The CSS `object-position` that centres a tile on the wearer, or the middle of the photo when they were not
 * placed. Only the horizontal axis moves: a 4:5 tile already shows the photo's full height.
 */
export function tileFocus(wearer: ScreenRect | null): string {
  if (!wearer) return '50% 50%'
  const centre = wearer.x + wearer.width / 2
  // object-position aligns that share of the image with the same share of the box, so the left edge of
  // the visible window maps to left / (1 - visible) of the way across.
  const left = Math.min(Math.max(centre - VISIBLE_WIDTH / 2, 0), 1 - VISIBLE_WIDTH)
  return `${((left / (1 - VISIBLE_WIDTH)) * 100).toFixed(1)}% 50%`
}
