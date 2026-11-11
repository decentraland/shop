/**
 * Whether this pointer can hover — the one question the card hover preview depends on.
 *
 * Shared because two places have to give the SAME answer. A card only asks for the 3D preview when this
 * is true (touch devices synthesize `mouseenter` on tap, which would flash the preview under a finger),
 * and the layer that owns the engine only warms it up when this is true. While the second one spelled the
 * check differently — it didn't have one — every phone downloaded ~1.2MB of Babylon for a preview no tap
 * could ever reach.
 *
 * Absent `matchMedia` answers TRUE: that is a browser old enough to predate the media feature, not a
 * touch device, and the cost of being wrong is a warm engine rather than a broken one.
 */
export function canHover(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return true
  return window.matchMedia('(hover: hover)').matches
}
