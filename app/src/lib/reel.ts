import { config } from '~/config'
import type { CatalogItem } from '~/lib/api'

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
 * or fewer). So a page is read and ranked here, and the rest is thrown away. 50 is where the payload
 * stops being free — around 50KB over the wire, gzipped — and it is enough to rank from.
 */
const PAGE = 50
const SHOWN = 10

/** At most this many photos by the same person, or in the same place, so the strip is not one scene. */
const PER_AUTHOR = 2
const PER_PLACE = 2

type ServicePerson = {
  userName?: string
  userAddress?: string
  wearables?: string[]
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

/** Whether this person is wearing the item, whichever copy of it they own. */
function wears(person: ServicePerson, itemKey: string): boolean {
  const [contract, itemId] = itemKey.split('-')
  return (person.wearables ?? []).some(urn => {
    const parts = urn.split(':')
    return parts.length >= 7 && parts[4].toLowerCase() === contract && parts[5] === itemId
  })
}

function toPhoto(image: ServiceImage, itemKey: string): ReelPhoto | null {
  const metadata = image.metadata
  if (!metadata) return null

  const people = metadata.visiblePeople ?? []
  const shooter = (metadata.userAddress ?? '').toLowerCase()
  // The first match is enough: the credit names one wearer, even if several people in the shot own the item.
  const wearer = people.find(person => wears(person, itemKey))
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
    realm: metadata.realm ?? '',
    dateTime: metadata.dateTime ?? '',
    people: people.length
  }
}

/**
 * Fewest people first, then most recent, with a cap per person and per place.
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

  const ordered = [...photos].sort((a, b) => a.people - b.people || Number(b.dateTime) - Number(a.dateTime))

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
  const photos = (body.images ?? []).map(image => toPhoto(image, key)).filter((p): p is ReelPhoto => !!p)

  return rankReelPhotos(photos)
}
