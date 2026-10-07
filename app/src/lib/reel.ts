import { config } from '~/config'
import type { CatalogItem } from '~/lib/api'
import { framingScore, toScreenRect, type ScreenRect } from '~/lib/reelFraming'
import { fetchWearableRules, hiddenBy, type WearableRule } from '~/lib/wearable-rules'

/**
 * A public photo taken in world, from the camera reel service, showing someone wearing this item.
 *
 * Flattened from the service's own shape (an image plus the whole metadata of the shot) into what the
 * strip actually reads, so the component never walks the raw payload.
 */
export type ReelPhoto = {
  id: string
  url: string
  thumbnailUrl: string
  /** Who took the photo. */
  userName: string
  userAddress: string
  /** Who is wearing the item, when that is NOT the person who took it. Empty otherwise. */
  wearerName: string
  wearerAddress: string
  /** Scene name as the camera recorded it. Whether it is still there is a separate question. */
  place: string
  /** Places API id of the scene, when the camera knew it. Names are not unique; this is. */
  placeId: string
  /** "x,y" of the shot, for the jump-in link. */
  position: string
  /** "main" (or a catalyst name) for Genesis City; `<name>.dcl.eth` for a World. */
  realm: string
  /** Unix epoch SECONDS, as a string — the service's own shape. */
  dateTime: string
  /** People visible in the shot. 1-2 is a portrait; a dozen is an event crowd. */
  people: number
  /** Everything the wearer has on, as item urns, so the photo can be dropped when another piece hides this one. */
  wearerWearables: string[]
  /** This item's urn as the wearer carries it, without the token id. Empty when nobody in the shot wears it. */
  itemUrn: string
  /** The item's category from its Catalyst entity (`lower_body`, `hat`…). Empty when it could not be read. */
  itemCategory: string
  /** Where the wearer stands in the photo. Null on photos taken before the client recorded it. */
  wearerRect: ScreenRect | null
  /** The client recorded a rectangle for the wearer but it is empty: they are outside the saved photo. */
  wearerOffPhoto: boolean
  /** Where everyone else in the shot stands, for telling whether they cover the wearer. */
  otherRects: ScreenRect[]
}

/** `contract-itemId`, the same identity the favourites use, and what the service indexes photos by. */
export function reelKey(item: Pick<CatalogItem, 'contractAddress' | 'itemId'>): string | null {
  if (!item.contractAddress || !item.itemId) return null
  return `${item.contractAddress.toLowerCase()}-${item.itemId}`
}

/**
 * How many photos to ask for, and how many of them to show.
 *
 * The service answers newest first, and newest is not best: on a popular item most recent photos are
 * event crowds where the item cannot be seen at all (measured: 22 of the newest 100 have three people
 * or fewer). So the largest page the service serves (100, about 75KB over the wire) is read and
 * ranked here, and the rest is thrown away.
 */
const PAGE = 100
const SHOWN = 10

/**
 * Above this many people in the shot the item is a speck in a crowd, so the photo is not shown at all.
 * An item with only crowd shots then has no strip, which reads better than a strip of crowds.
 */
const MAX_PEOPLE = 5

function isCrowd(photo: ReelPhoto): boolean {
  return photo.people > MAX_PEOPLE
}

/**
 * How many of the best-ranked photos have their wearers' outfits read from the Catalyst: enough to fill the
 * strip twice over when some turn out to hide the item, and few enough that the lookup stays one or two
 * requests rather than one per photo on the page.
 */
const SHORTLIST = SHOWN * 2

/**
 * Wearables read per person. An avatar has fewer slots than this, so a longer list is not an outfit, and
 * capping it keeps one photo's metadata from deciding how many lookups every visitor to the item makes.
 */
const MAX_WEARABLES = 20

// The Catalyst reads a batch of pointers per request.
const RULES_BATCH = 100

/** The Catalyst rules for these urns, by lowercased urn. Empty when they cannot be read: the lookup fails soft. */
async function fetchRules(urns: string[]): Promise<Map<string, WearableRule>> {
  const unique = [...new Set(urns.filter(Boolean))]
  const batches: string[][] = []
  for (let i = 0; i < unique.length; i += RULES_BATCH) batches.push(unique.slice(i, i + RULES_BATCH))
  const rules = new Map<string, WearableRule>()
  for (const rule of (await Promise.all(batches.map(fetchWearableRules))).flat())
    rules.set(rule.urn.toLowerCase(), rule)
  return rules
}

/**
 * Whether the item is actually rendered on its wearer.
 *
 * A photo is tagged with everything the wearer has on, including pieces the renderer did not draw: a long
 * robe declares that it hides lower_body, and trousers under it never appear in the shot. That is read from
 * the same Catalyst rules the fitting room uses. A rule that could not be read hides nothing, since a strip
 * must not depend on this lookup.
 */
function itemVisible(photo: ReelPhoto, rules: Map<string, WearableRule>): boolean {
  if (!photo.itemCategory) return true
  const item = photo.itemUrn.toLowerCase()
  return !photo.wearerWearables.some(urn => {
    const rule = urn.toLowerCase() === item ? undefined : rules.get(urn.toLowerCase())
    return !!rule && hiddenBy(rule).has(photo.itemCategory)
  })
}

/** At most this many photos by the same person, or in the same place, so the strip is not one scene. */
const PER_AUTHOR = 2
const PER_PLACE = 2

type ServicePerson = {
  userName?: string
  userAddress?: string
  wearables?: string[]
  isEmoting?: boolean
  screenRect?: unknown
}

type ServiceImage = {
  id: string
  url: string
  thumbnailUrl: string
  metadata?: {
    userName?: string
    userAddress?: string
    dateTime?: string
    realm?: string
    placeId?: string
    scene?: { name?: string; location?: { x?: string; y?: string } }
    visiblePeople?: ServicePerson[]
  }
}

/**
 * The item's own urn for a token urn (drops the token id), which is what the Catalyst answers for. Only
 * on-chain collections carry a token id there: a third-party urn keeps every part, or its item is lost.
 */
function itemPointer(urn: string): string {
  const parts = urn.split(':')
  return parts.length > 6 && /^collections-v[12]$/i.test(parts[3] ?? '') ? parts.slice(0, 6).join(':') : urn
}

/** What the person has on, as item urns, read from photo metadata and so capped and kept to Decentraland urns. */
function outfit(person: ServicePerson): string[] {
  return (person.wearables ?? [])
    .filter(urn => typeof urn === 'string' && urn.toLowerCase().startsWith('urn:decentraland:'))
    .slice(0, MAX_WEARABLES)
    .map(itemPointer)
}

/** This item's urn on the person, whichever copy of it they own, or null when they do not wear it. */
function wornItem(person: ServicePerson, itemKey: string): string | null {
  const [contract, itemId] = itemKey.split('-')
  const urn = (person.wearables ?? []).find(urn => {
    if (typeof urn !== 'string') return false
    const parts = urn.split(':')
    return parts.length >= 7 && parts[4].toLowerCase() === contract && parts[5] === itemId
  })
  return urn ? itemPointer(urn) : null
}

/**
 * The photo once per person in it wearing the item, in the order the client listed them, or once with no
 * wearer when nobody does. The credit names one wearer, and which one is settled later: the first whose
 * item is not hidden under something else.
 */
function toPhotos(image: ServiceImage, itemKey: string): ReelPhoto[] {
  const metadata = image.metadata
  if (!metadata) return []
  const people = Array.isArray(metadata.visiblePeople) ? metadata.visiblePeople : []
  const wearers = people.filter(person => wornItem(person, itemKey))
  return (wearers.length > 0 ? wearers : [undefined]).map(wearer => toPhoto(image, people, wearer, itemKey))
}

function toPhoto(
  image: ServiceImage,
  people: ServicePerson[],
  wearer: ServicePerson | undefined,
  itemKey: string
): ReelPhoto {
  const metadata = image.metadata ?? {}
  const shooter = (metadata.userAddress ?? '').toLowerCase()
  const wearerAddress = (wearer?.userAddress ?? '').toLowerCase()
  const location = metadata.scene?.location

  return {
    id: image.id,
    url: image.url,
    thumbnailUrl: image.thumbnailUrl,
    userName: metadata.userName ?? '',
    userAddress: metadata.userAddress ?? '',
    wearerName: !wearer || wearerAddress === shooter ? '' : (wearer.userName ?? ''),
    wearerAddress: !wearer || wearerAddress === shooter ? '' : (wearer.userAddress ?? ''),
    place: metadata.scene?.name ?? '',
    placeId: metadata.placeId ?? '',
    position: location?.x != null && location?.y != null ? `${location.x},${location.y}` : '',
    wearerWearables: wearer ? outfit(wearer) : [],
    itemUrn: wearer ? (wornItem(wearer, itemKey) ?? '') : '',
    itemCategory: '',
    wearerRect: toScreenRect(wearer?.screenRect),
    // Present but empty is the client saying the wearer is outside the saved crop. Absent is an older photo.
    // Except while emoting: the client measured the photographer's own avatar from a collider that emotes
    // switch off, so an emoting wearer in plain view came out empty too, and is treated as not placed.
    wearerOffPhoto: wearer?.screenRect != null && !wearer.isEmoting && !toScreenRect(wearer.screenRect),
    otherRects: people
      .filter(person => person !== wearer)
      .map(person => toScreenRect(person.screenRect))
      .filter((rect): rect is ScreenRect => !!rect),
    realm: metadata.realm ?? '',
    dateTime: metadata.dateTime ?? '',
    people: people.length
  }
}

/**
 * Photos that show the wearer well first, best framed first; then the photos with no rectangle, fewest
 * people first and crowds left out. Most recent breaks ties, and a cap per person and per place applies.
 *
 * A photo with a rectangle is judged on it alone: too small, cut off where the item is, or covered by
 * others, and it is dropped however few people are in it.
 *
 * The caps are what keep the strip from opening with the same scene four times: a popular spot is
 * photographed by several people on the same night, and those shots are near-identical.
 */
export function rankReelPhotos(photos: ReelPhoto[], limit = SHOWN): ReelPhoto[] {
  const byAuthor = new Map<string, number>()
  const byPlace = new Map<string, number>()
  // One shot per person per place: the same person photographing the same scene twice in a night gets
  // two pictures that are the same picture, and the caps below would happily take both.
  const seen = new Set<string>()
  const ranked: ReelPhoto[] = []

  const newest = (a: ReelPhoto, b: ReelPhoto) => Number(b.dateTime) - Number(a.dateTime)
  const framed = photos
    .flatMap(photo => {
      const score = photo.wearerRect && framingScore(photo.wearerRect, photo.otherRects, photo.itemCategory)
      return score == null ? [] : [{ photo, score }]
    })
    .sort((a, b) => b.score - a.score || newest(a.photo, b.photo))
    .map(({ photo }) => photo)
  const unframed = photos
    .filter(photo => !photo.wearerRect && !photo.wearerOffPhoto && !isCrowd(photo))
    .sort((a, b) => a.people - b.people || newest(a, b))
  const ordered = [...framed, ...unframed]

  for (const photo of ordered) {
    const author = photo.userAddress.toLowerCase()
    const place = photo.placeId || photo.place
    if (seen.has(`${author}@${place}`)) continue
    if ((byAuthor.get(author) ?? 0) >= PER_AUTHOR || (byPlace.get(place) ?? 0) >= PER_PLACE) continue

    seen.add(`${author}@${place}`)
    byAuthor.set(author, (byAuthor.get(author) ?? 0) + 1)
    byPlace.set(place, (byPlace.get(place) ?? 0) + 1)
    ranked.push(photo)

    if (ranked.length === limit) break
  }

  return ranked
}

/** Public photos of people wearing this item, ranked for a storefront rather than for a timeline. */
export async function fetchItemReel(item: Pick<CatalogItem, 'contractAddress' | 'itemId'>): Promise<ReelPhoto[]> {
  const key = reelKey(item)
  if (!key) return []

  const res = await fetch(`${config.cameraReelUrl}/api/wearables/${key}/images?limit=${PAGE}`)
  if (!res.ok) throw new Error(`fetchItemReel ${res.status}`)

  const body = (await res.json()) as { images?: ServiceImage[] }
  const shots = (body.images ?? []).map(image => toPhotos(image, key)).filter(variants => variants.length > 0)

  // The item's category first: where it sits on the body decides how a cut-off wearer is scored.
  const itemRules = await fetchRules(shots.flat().map(photo => photo.itemUrn))
  const categorized = shots.map(variants =>
    variants.map(photo => ({ ...photo, itemCategory: itemRules.get(photo.itemUrn.toLowerCase())?.category ?? '' }))
  )

  // Then the outfits, only for the photos that could make the strip, each credited to its first wearer.
  const variantsOf = new Map(categorized.map(variants => [variants[0], variants]))
  const shortlist = rankReelPhotos([...variantsOf.keys()], SHORTLIST).map(photo => variantsOf.get(photo) ?? [photo])
  const outfitRules = await fetchRules(shortlist.flat().flatMap(photo => photo.wearerWearables))

  const visible = shortlist.flatMap(variants => variants.filter(photo => itemVisible(photo, outfitRules)).slice(0, 1))
  return rankReelPhotos(visible)
}
