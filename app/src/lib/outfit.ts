import type { CatalogItem } from '~/lib/api'
import { itemUrn } from '~/lib/urn'
import { isCompatible, type BodyShapeUrn } from '~/lib/bodyShape'

// Whether an item can be worn on the given target body shape. A null target means "no constraint"
// (used by callers that don't yet know the shape) — matches the pre-body-shape behaviour.
export function compatibleWith(item: Pick<CatalogItem, 'gender' | 'category'>, target: BodyShapeUrn | null): boolean {
  return isCompatible(item, target)
}

// Fitting-room logic — pure, so combinations + conflicts are testable without a 3D preview.
//
// An avatar wears at most ONE wearable per slot (its category: hat, upper_body, eyewear, …). Two cart
// items in the same slot can't be worn together — putting one on takes the other off. Emotes aren't
// worn at all, so they never participate in the outfit.

export function isWearable(item: Pick<CatalogItem, 'category'>): boolean {
  return item.category !== 'emote'
}

// The avatar slot an item occupies. Wearables key off their sub-category; a wearable with no known
// sub-category falls back to a per-item slot (its id) so it never silently conflicts with another.
// Emotes have no slot.
export function slotOf(item: Pick<CatalogItem, 'category' | 'wearableCategory' | 'id'>): string | null {
  if (!isWearable(item)) return null
  return item.wearableCategory ?? `unknown:${item.id}`
}

// A body region for the compact slot icon (see the slot-*.svg set). Groups the many wearable
// sub-categories into head / upper / lower / feet / hands, with a generic fallback.
export type SlotRegion = 'head' | 'upper' | 'lower' | 'feet' | 'hands' | 'item'
const HEAD_CATEGORIES = new Set([
  'hat', 'helmet', 'mask', 'tiara', 'top_head', 'hair', 'facial_hair', 'eyewear', 'earring', 'eyes', 'eyebrows', 'mouth'
])
export function slotRegion(item: Pick<CatalogItem, 'category' | 'wearableCategory'>): SlotRegion {
  if (!isWearable(item)) return 'item'
  const c = item.wearableCategory
  if (!c) return 'item'
  if (HEAD_CATEGORIES.has(c)) return 'head'
  if (c === 'upper_body') return 'upper'
  if (c === 'lower_body') return 'lower'
  if (c === 'feet') return 'feet'
  if (c === 'hands' || c === 'hands_wear') return 'hands'
  return 'item'
}

// The default equipped set for a fresh fitting-room open: one wearable per slot (first wins), emotes
// excluded. Returns the ids to equip. Keeps the outfit conflict-free from the start.
export function defaultWorn(items: CatalogItem[], target: BodyShapeUrn | null = null): Set<string> {
  const worn = new Set<string>()
  const takenSlots = new Set<string>()
  for (const item of items) {
    const slot = slotOf(item)
    if (slot == null || takenSlots.has(slot)) continue
    // Don't auto-equip an item the target body can't wear (it'd render invisible). It stays selectable
    // only if it becomes compatible; the UI marks it as "not for this body shape".
    if (!compatibleWith(item, target)) continue
    takenSlots.add(slot)
    worn.add(item.id)
  }
  return worn
}

// Toggle an item's equipped state. Equipping auto-unequips anything already in the same slot (a swap),
// so the returned set is always conflict-free. Emotes can't be equipped (returns the set unchanged).
export function toggleWorn(worn: Set<string>, item: CatalogItem, all: CatalogItem[]): Set<string> {
  if (!isWearable(item)) return worn
  const next = new Set(worn)
  if (next.has(item.id)) {
    next.delete(item.id)
    return next
  }
  const slot = slotOf(item)
  if (slot != null) {
    for (const other of all) {
      if (other.id !== item.id && next.has(other.id) && slotOf(other) === slot) next.delete(other.id)
    }
  }
  next.add(item.id)
  return next
}

// The item ids that share a slot with another cart item — i.e. the ones a swap would toggle off. The
// UI highlights these so the shopper understands why enabling one turns another off.
export function conflictingIds(items: CatalogItem[]): Set<string> {
  const bySlot = new Map<string, string[]>()
  for (const item of items) {
    const slot = slotOf(item)
    if (slot == null) continue
    const list = bySlot.get(slot) ?? []
    list.push(item.id)
    bySlot.set(slot, list)
  }
  const conflicts = new Set<string>()
  for (const ids of bySlot.values()) {
    if (ids.length > 1) ids.forEach(id => conflicts.add(id))
  }
  return conflicts
}

// The wearable URNs for the currently-equipped items, in cart order, for WearablePreview's `urns`.
export function wornUrns(items: CatalogItem[], worn: Set<string>, target: BodyShapeUrn | null = null): string[] {
  const urns: string[] = []
  for (const item of items) {
    if (!worn.has(item.id) || !isWearable(item)) continue
    // Safety net: never send an incompatible urn to the preview (it wouldn't render on the target body).
    if (!compatibleWith(item, target)) continue
    const urn = itemUrn(item)
    if (urn) urns.push(urn)
  }
  return urns
}
