import { EntityType } from '@dcl/schemas'
import { Authenticator, type AuthIdentity } from '@dcl/crypto'
import { config } from '~/config'
import { captureError } from '~/lib/monitoring'

// A creator's "store" — the cover banner + short description shown on their storefront hero.
// Backed by an off-chain content-server entity keyed by the store URN (one per owner address).
// This is the same source the classic marketplace account banner reads, so shop + marketplace
// stay in sync. Everything is optional: creators who never set up a store just get empty fields
// and the hero falls back to a default cover (see CreatorHero).
export type CreatorStore = {
  cover: string // absolute image URL, or '' when the creator set no cover
  coverHash: string // the cover's content hash (deterministic from its bytes), or '' when no cover
  description: string // short blurb, or '' when unset
  links: { website: string; twitter: string; discord: string; facebook: string }
}

const emptyStore = (): CreatorStore => ({
  cover: '',
  coverHash: '',
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
  const url = links?.find(l => l.name === name)?.url ?? ''
  return url.startsWith('https://') ? url : ''
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
      coverHash: coverHash ?? '',
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

// ---------------------------------------------------------------------------
// Editing / saving a store (the /store-settings form). This deploys an off-chain
// STORE entity to the content server, keyed by the same store URN we read above,
// so the change shows up on the creator hero (shop) and the classic marketplace
// account banner alike. Deploy is authenticated with the signed-in account's
// AuthIdentity — no gas, no on-chain transaction.
// ---------------------------------------------------------------------------

// The four social links, in display order. Each has a fixed prefix: the form edits
// only the handle, and we store/deploy the full URL (mirrors the classic marketplace).
export const LINK_TYPES = ['website', 'twitter', 'discord', 'facebook'] as const
export type LinkType = (typeof LINK_TYPES)[number]

// A link's required prefix. `website` is just the scheme (any https URL); the socials
// pin the whole host so a creator only fills in their handle/invite id.
export const LINK_PREFIX: Record<LinkType, string> = {
  website: 'https://',
  twitter: 'https://www.twitter.com/',
  discord: 'https://discord.gg/',
  facebook: 'https://www.facebook.com/'
}

// The form's editable shape. `cover` is a display URL (a bundled template URL, a data:
// URL from an upload, or an existing content URL); `coverName` is the entity file key
// (`cover/<filename>`); `coverHash` is the cover's content hash when it came from a saved store
// (used to re-select the matching template after a reload — the filename is lost on the round-trip,
// but the content hash is stable). Links hold the FULL url (prefix included), same as CreatorStore.
export type StoreDraft = {
  cover: string
  coverName: string
  coverHash: string
  description: string
  links: Record<LinkType, string>
}

// A CreatorStore (read model) doesn't carry a cover filename — we only need one when a
// cover is set, and we can recover a stable name from the URL's basename.
export function draftFromStore(store: CreatorStore): StoreDraft {
  return {
    cover: store.cover,
    coverName: store.cover ? coverNameFromUrl(store.cover) : '',
    coverHash: store.coverHash,
    description: store.description,
    links: { ...store.links }
  }
}

// Content hash (hashV1 / IPFS CIDv1, the same algorithm the content server and the entity builder
// use for content[].hash) of a bundled template image. Memoized per URL — templates are immutable,
// so we only fetch + hash each once. Lets the picker re-select a saved template by comparing its
// hash to the loaded cover's hash (filenames don't survive the deploy round-trip; hashes do).
const templateHashCache = new Map<string, Promise<string>>()
export function templateHash(url: string): Promise<string> {
  let cached = templateHashCache.get(url)
  if (!cached) {
    cached = (async () => {
      const { hashV1 } = await import('@dcl/hashing')
      const bytes = new Uint8Array(await (await fetch(url)).arrayBuffer())
      return hashV1(bytes)
    })()
    templateHashCache.set(url, cached)
  }
  return cached
}

// Entity file keys live under `cover/`. Derive one from an image URL's basename, decoding
// percent-escapes so a name like "Holy Dripz.jpg" round-trips. Falls back to a generic name.
function coverNameFromUrl(url: string): string {
  const base = decodeURIComponent(url.split('?')[0].split('/').pop() || '')
  return `cover/${base || 'cover.jpeg'}`
}

// Whether a link value satisfies its prefix. Empty is valid (the link is simply omitted).
export function isValidLink(type: LinkType, value: string): boolean {
  return value === '' || value.startsWith(LINK_PREFIX[type])
}

// Build the STORE entity metadata from a draft. Empty links are dropped; the cover image
// is included only when both a URL and a file name are present. Shape matches @dcl/schemas'
// Store and the classic marketplace deploy, so both frontends read it identically.
export function buildStoreMetadata(address: string, draft: StoreDraft) {
  const owner = address.toLowerCase()
  const links = LINK_TYPES.filter(name => draft.links[name]).map(name => ({ name, url: draft.links[name] }))
  const images = draft.cover && draft.coverName ? [{ name: 'cover', file: draft.coverName }] : []
  return { id: storeUrn(owner), owner, description: draft.description, images, links, version: 1 }
}

// Fetch the current cover (template asset, data: URL, or existing content URL) into a byte
// buffer for deployment. Keyed by the entity file name. Returns an empty map when unset —
// same behavior as the classic marketplace (which always re-uploads the cover on save).
async function coverFiles(draft: StoreDraft): Promise<Map<string, Uint8Array>> {
  const files = new Map<string, Uint8Array>()
  if (draft.cover && draft.coverName) {
    const res = await fetch(draft.cover)
    files.set(draft.coverName, new Uint8Array(await res.arrayBuffer()))
  }
  return files
}

// Deploy the creator's store. Builds the entity + its files, signs the entity id with the
// account's identity, and deploys to the content server. Throws a friendly Error on failure
// (caller shows it) after reporting the real cause to Sentry — never surfaces a raw web3/network
// error to the UI (web2-first + PII rule).
export async function saveStore(address: string, draft: StoreDraft, identity: AuthIdentity): Promise<void> {
  try {
    // Lazy-load the catalyst client + entity builder: this pulls a chunk that's only needed when a
    // creator actually saves their store, keeping it out of the initial bundle.
    const [{ buildEntity }, { createContentClient }] = await Promise.all([
      import('dcl-catalyst-client/dist/client/utils/DeploymentBuilder'),
      import('dcl-catalyst-client/dist/client/ContentClient')
    ])

    const metadata = buildStoreMetadata(address, draft)
    const files = await coverFiles(draft)

    const entity = await buildEntity({
      type: EntityType.STORE,
      pointers: [storeUrn(address)],
      files,
      metadata,
      timestamp: Date.now()
    })

    const authChain = Authenticator.signPayload(identity, entity.entityId)
    // The client needs an IFetchComponent — a thin `{ fetch }` wrapper. The browser's global fetch
    // satisfies the shape, but it MUST stay bound to the window: passing the bare reference (or the
    // node-oriented @well-known-components fetcher) throws "Illegal invocation" when the client calls
    // it. Bind to globalThis so `this` is correct.
    const fetcher = { fetch: (url: string, init?: RequestInit) => globalThis.fetch(url, init) }
    const client = createContentClient({ url: `${config.peerUrl}/content`, fetcher })
    await client.deploy({ ...entity, authChain })
  } catch (error) {
    captureError(error, { flow: 'saveStore' })
    // Rethrow a stable message for the UI, but keep the original as `cause` for debugging. Set it
    // manually (not via the Error options arg) so we don't depend on the ES2022 lib target.
    const failure: Error & { cause?: unknown } = new Error('save-failed')
    failure.cause = error
    throw failure
  }
}
