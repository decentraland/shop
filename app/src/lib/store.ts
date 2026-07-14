import { config } from '~/config'

// A creator's "store" — the cover banner + short description shown on their storefront hero.
// Backed by an off-chain content-server entity keyed by the store URN (one per owner address).
// This is the same source the classic marketplace account banner reads, so shop + marketplace
// stay in sync. Everything is optional: creators who never set up a store just get empty fields
// and the hero falls back to a default cover (see CreatorHero).
export type CreatorStore = {
  cover: string // absolute image URL, or '' when the creator set no cover
  description: string // short blurb, or '' when unset
  links: { website: string; twitter: string; discord: string; facebook: string }
}

const emptyStore = (): CreatorStore => ({
  cover: '',
  description: '',
  links: { website: '', twitter: '', discord: '', facebook: '' }
})

const storeUrn = (address: string) => `urn:decentraland:off-chain:marketplace-stores:${address.toLowerCase()}`

// Raw content-server entity shape (only the bits we read).
type StoreEntity = {
  content?: Array<{ file: string; hash: string }>
  metadata?: {
    description?: string
    images?: Array<{ name: string; file: string }>
    links?: Array<{ name: string; url: string }>
  }
}

function linkUrl(links: Array<{ name: string; url: string }> | undefined, name: string): string {
  return links?.find(l => l.name === name)?.url ?? ''
}

// Fetch the creator's store entity (cover + description + links). POSTs the store URN to the
// content server's active-entities endpoint. Returns an all-empty store when there's no entity
// (creator never made one) or on any error — the hero renders fine either way, never throwing.
export async function fetchStore(address: string): Promise<CreatorStore> {
  try {
    const res = await fetch(`${config.peerUrl}/content/entities/active`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pointers: [storeUrn(address)] })
    })
    if (!res.ok) return emptyStore()
    const entities = (await res.json()) as StoreEntity[]
    const entity = entities?.[0]
    if (!entity?.metadata) return emptyStore()

    const { metadata, content } = entity
    // The cover is the image named "cover"; resolve its file → content hash → absolute URL.
    const coverFile = metadata.images?.find(img => img.name === 'cover')?.file
    const coverHash = coverFile ? content?.find(c => c.file === coverFile)?.hash : undefined
    const cover = coverHash ? `${config.peerUrl}/content/contents/${coverHash}` : ''

    return {
      cover,
      description: (metadata.description ?? '').trim(),
      links: {
        website: linkUrl(metadata.links, 'website'),
        twitter: linkUrl(metadata.links, 'twitter'),
        discord: linkUrl(metadata.links, 'discord'),
        facebook: linkUrl(metadata.links, 'facebook')
      }
    }
  } catch {
    return emptyStore()
  }
}
