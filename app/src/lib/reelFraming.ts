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

/** A rectangle from the service, or null when it is missing, empty or not a rectangle of the photo. */
export function toScreenRect(raw: unknown): ScreenRect | null {
  if (!raw || typeof raw !== 'object') return null
  const { x, y, width, height } = raw as Record<string, unknown>
  const values = [x, y, width, height]
  if (!values.every(v => typeof v === 'number' && Number.isFinite(v))) return null
  const rect = { x: x as number, y: y as number, width: width as number, height: height as number }
  if (rect.width <= 0 || rect.height <= 0) return null
  if (rect.x < 0 || rect.y < 0 || rect.x + rect.width > 1 + EDGE || rect.y + rect.height > 1 + EDGE) return null
  return rect
}

function overlap(a: ScreenRect, b: ScreenRect): number {
  const width = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)
  const height = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y)
  return width > 0 && height > 0 ? width * height : 0
}

/**
 * A score for how clearly the photo shows the item on its wearer, or null when it does not show it.
 *
 * Null when the wearer is too small, when they are cut off on the side of the body the item is on, or when
 * other people cover most of them. Otherwise bigger and more central scores higher, less whatever others
 * cover. The rectangle has no depth, so anyone overlapping counts as in front.
 */
export function framingScore(wearer: ScreenRect, others: ScreenRect[], category: string): number | null {
  if (wearer.height < MIN_WEARER_HEIGHT) return null

  const cutAtTop = wearer.y <= EDGE
  const cutAtBottom = wearer.y + wearer.height >= 1 - EDGE
  const wholeBody = category === 'skin'
  if (cutAtBottom && (wholeBody || LOW_CATEGORIES.has(category))) return null
  if (cutAtTop && (wholeBody || HEAD_CATEGORIES.has(category))) return null

  const covered = Math.min(
    1,
    others.reduce((sum, other) => sum + overlap(wearer, other), 0) / (wearer.width * wearer.height)
  )
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
