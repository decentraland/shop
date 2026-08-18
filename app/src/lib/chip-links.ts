import { SUBCAT_MAP } from '~/lib/categories'
import type { CatalogItem } from '~/lib/api'

/**
 * Browse links for the PDP's attribute chips: clicking an attribute shows everything sharing it.
 *
 * Only the attributes the browse page can actually filter by get a link. `Assets` owns the vocabulary
 * (`category`, `subCategory`, `rarities`, `smart`), and a chip that wrote anything else would land on a
 * grid that silently ignored it — worse than not being clickable, because it looks like it worked.
 *
 * GENDER IS DELIBERATELY ABSENT. It is not an oversight or a missing switch: neither the browse filters
 * nor `/v3/catalog/unified` accept one, so "unisex" has nowhere to go without server work.
 *
 * Values are spelled the way `useUrlFilters` encodes them, and defaults are never written — so these
 * hrefs are exactly what the page would produce had the reader set the filter by hand, and the back
 * button behaves the same either way.
 */

/** Reverse of SUBCAT_MAP: a raw slot (`eyebrows`) to the sub-category key the filter state holds. */
const SLOT_TO_SUBCATEGORY = new Map<string, string>(
  Object.entries(SUBCAT_MAP).flatMap(([key, slots]) =>
    // A parent (Head, Accessories) covers several slots and would resolve a slot to the broad group
    // instead of the precise one, so only the single-slot entries are indexed.
    slots.length === 1 ? [[slots[0], key] as [string, string]] : []
  )
)

const BROWSE = '/items'

/** Everything of this rarity. */
export function rarityHref(rarity: string | undefined | null): string | null {
  if (!rarity) return null
  return `${BROWSE}?rarities=${encodeURIComponent(rarity.toLowerCase())}`
}

/**
 * Everything in this slot — `category` is set alongside `subCategory` because the browse page reads the
 * sub-category within a top-level section, and landing on "all" with a sub-category set would show a
 * sidebar whose selection is not visible.
 */
export function categoryHref(item: Pick<CatalogItem, 'category' | 'wearableCategory'>): string | null {
  const slot = item.wearableCategory
  if (slot) {
    const subCategory = SLOT_TO_SUBCATEGORY.get(slot)
    // An unmapped slot still filters usefully by its top-level section rather than not linking at all.
    return subCategory
      ? `${BROWSE}?category=wearable&subCategory=${encodeURIComponent(subCategory)}`
      : `${BROWSE}?category=wearable`
  }
  if (item.category === 'emote') return `${BROWSE}?category=emote`
  if (item.category === 'wearable') return `${BROWSE}?category=wearable`
  return null
}

/** Everything that is a smart wearable. */
export function smartHref(): string {
  return `${BROWSE}?smart=true`
}
