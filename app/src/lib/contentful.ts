import { ContentfulLocale, isSysLink } from '@dcl/schemas'
import type {
  BannerFields,
  CampaignFields,
  ContentfulAsset,
  ContentfulEntry,
  LocalizedField,
  LocalizedFields,
  SysLink
} from '@dcl/schemas'
import { config } from '~/config'
import type { Locale } from '~/intl/i18n'

/**
 * Decentraland's marketing CMS (Contentful behind `cms-api.decentraland.org`), read directly.
 *
 * One ADMIN entry per environment holds links to the seasonal campaign and to every banner slot. This
 * module resolves that entry into something renderable: the banners keyed by slot, the campaign's tag and
 * tab label, and every asset the two reference.
 *
 * Why not `decentraland-dapps`' `ContentfulClient`, which does exactly this: it imports `BaseClient` from
 * the package's `dist/lib` BARREL, which re-exports `./eth` — dragging in `decentraland-connect` and
 * `@ethersproject/providers` — and `BaseClient` itself imports node's `url`. A production build tree-shakes
 * that away; vitest does not, so every spec touching this module would eagerly evaluate a wallet stack.
 * (`lib/api.ts` deep-imports `TradeService` dynamically for the same reason.) The transport is three plain
 * fetches, so we own those and take every TYPE from `@dcl/schemas`, which already ships the whole model.
 *
 * Reads are PUBLIC — the proxy takes no token, which is what makes a client-side fetch possible at all.
 */

const BANNER_CONTENT_TYPE = 'banner'
const CAMPAIGN_CONTENT_TYPE = 'marketingCampaign'

// Contentful serves files from `images.ctfassets.net`; Decentraland proxies them here, which is the host
// the deployed CSP allows and where the quality/format transforms are applied.
const IMAGE_HOST = 'cms-images.decentraland.org'

/**
 * The locales fetched, in the order they are merged.
 *
 * The Shop ships English and Spanish, so Chinese is not requested — the Marketplace asks for all three
 * because it renders all three. `en-US` is non-negotiable: it is the fallback every read below lands on.
 */
const FETCHED_LOCALES: ContentfulLocale[] = [ContentfulLocale.enUS, ContentfulLocale.es]

/** A banner entry plus its own id, which analytics reports and the Marketplace's payloads both carry. */
export type CampaignBanner = BannerFields & { id: string }

/**
 * The resolved marketing content.
 *
 * `mainTag === null` is a NORMAL state, not a failure: production has run for months with banners
 * configured and no campaign entry at all. The banner surfaces render from `banners`; only the event tab
 * requires a tag, and it must hide itself without one.
 */
export type Campaign = {
  /** Contentful's internal `name`. For analytics and debugging — never displayed. */
  name: string | null
  /** The event tab's LABEL, per locale. Content, not UI copy, so it never goes through `t()`. */
  tabName: LocalizedField<string> | null
  /** The builder collection tag the event's items are selected by (e.g. `halloween`). */
  mainTag: string | null
  /** `mainTag` plus `additionalTags`, de-duplicated. What the builder is actually queried with. */
  tags: string[]
  /**
   * Collections named ONE BY ONE in the CMS, on top of whatever the tags resolve to.
   *
   * Tagging happens in the builder, which is a different tool with a different owner — so an editor who
   * needs one more collection in the event has no way to add it from Contentful. This field is that
   * escape hatch: a comma-separated list of addresses, unioned with the tagged ones.
   */
  collections: string[]
  /** Banners keyed by the ADMIN entry's field name (e.g. `marketplaceHomepageBanner`). */
  banners: Record<string, CampaignBanner>
  /** Every asset referenced above, keyed by id — what ui2's `<Banner>` resolves its artwork against. */
  assets: Record<string, ContentfulAsset>
}

/** The Shop's locale in Contentful's spelling. Anything unmapped reads English. */
export function toContentfulLocale(locale: Locale): ContentfulLocale {
  return locale === 'es' ? ContentfulLocale.es : ContentfulLocale.enUS
}

/**
 * One locale's value of a localized field, falling back to English.
 *
 * The fallback is what keeps a half-translated campaign readable: Contentful lets an editor publish the
 * English copy and leave `es` empty, and a Spanish reader must then see English rather than nothing.
 */
export function localized<T>(field: LocalizedField<T> | undefined | null, locale: ContentfulLocale): T | undefined {
  if (!field) return undefined
  return field[locale] ?? field[ContentfulLocale.enUS]
}

/**
 * A linked asset's URL, ready to put in an `src`.
 *
 * Assets are stored under `en-US` whatever the reader's language — the artwork is the same file in every
 * locale — which is the same key `decentraland-ui2` reads them under. Returns `''` for an absent link or an
 * asset that failed to load, so a caller can treat "no artwork" as one case.
 */
export function assetUrl(assets: Record<string, ContentfulAsset>, link: SysLink<'Asset'> | undefined): string {
  if (!link) return ''
  const url = assets[link.sys.id]?.fields.file[ContentfulLocale.enUS]?.url
  if (!url) return ''
  return /^https?:\/\//.test(url) ? url : `https:${url}`
}

/**
 * Whether this environment has a CMS to read. An environment with no admin entry configured has no
 * campaign by definition, and the caller must not issue the request at all.
 */
export function isContentfulConfigured(): boolean {
  return Boolean(
    config.contentfulUrl && config.contentfulSpaceId && config.contentfulEnvironment && config.contentfulAdminEntityId
  )
}

function cmsUrl(path: string): string {
  return `${config.contentfulUrl}/spaces/${config.contentfulSpaceId}/environments/${config.contentfulEnvironment}${path}`
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`contentful ${res.status}`)
  return (await res.json()) as T
}

/**
 * An asset URL as the browser should actually load it.
 *
 * Two jobs, and the first is not cosmetic: Contentful's own host is not in the Shop's CSP, so an
 * un-rewritten URL is a blocked request and a banner with no artwork. The second is the quality/format
 * transform the proxy supports — which matters here because banner artwork is authored as a 1280px PNG,
 * a format `q` does not compress at all, and it sits on the eagerly-loaded home route.
 *
 * WebP is requested unconditionally rather than probed for. `decentraland-dapps`' client feature-detects
 * it by rendering to a canvas — a check written when IE 8 was in scope. WebP has been supported by every
 * browser this app runs in since Safari 14 (2020), so the probe now only buys a DOM dependency in a
 * data-layer module, a "not implemented" error from jsdom in every test that touches it, and two CDN
 * cache entries per image instead of one.
 */
export function optimizeAssetUrl(url: string): string {
  try {
    const parsed = new URL(url.startsWith('//') ? `https:${url}` : url)
    parsed.hostname = IMAGE_HOST
    parsed.protocol = 'https:'
    parsed.searchParams.set('q', '80')
    if (/\.(jpe?g|png)$/i.test(parsed.pathname)) parsed.searchParams.set('fm', 'webp')
    return parsed.toString()
  } catch {
    // A relative or malformed URL is left alone: ui2's getAssetUrl prefixes a protocol, and a broken
    // image is a better failure than a thrown one on the home page.
    return url
  }
}

type RawEntry = {
  sys: ContentfulEntry<LocalizedFields>['sys']
  fields: Record<string, unknown>
  metadata: ContentfulEntry<LocalizedFields>['metadata']
}

/**
 * One entry, merged across the fetched locales into Contentful's localized shape.
 *
 * The CMS proxy answers a `?locale=` request with FLAT fields (one value per field), so the localized
 * `{ 'en-US': …, es: … }` shape the types and ui2 both expect has to be rebuilt by asking once per locale
 * and merging. That is how `decentraland-dapps` does it too — there is no single request that returns all
 * locales through this proxy.
 */
async function fetchEntryAllLocales<T extends LocalizedFields>(id: string): Promise<ContentfulEntry<T>> {
  const perLocale = await Promise.all(
    FETCHED_LOCALES.map(async locale => ({
      locale,
      entry: await getJson<RawEntry>(cmsUrl(`/entries/${id}/?${new URLSearchParams({ locale }).toString()}`))
    }))
  )

  const fields: Record<string, Record<string, unknown>> = {}
  for (const { locale, entry } of perLocale) {
    for (const [key, value] of Object.entries(entry.fields ?? {})) {
      fields[key] = { ...fields[key], [locale]: value }
    }
  }

  // Contentful omits a field from a locale's response when it has no value there, and ui2's banner indexes
  // the localized map DIRECTLY (`fields.desktopTitle[locale]`) rather than through a fallback helper — so a
  // field the editor left untranslated would render blank for a Spanish reader. Backfilling English here
  // makes that fallback deterministic instead of depending on how the space's fallback locale is set up.
  for (const field of Object.values(fields)) {
    const english = field[ContentfulLocale.enUS]
    if (english === undefined) continue
    for (const locale of FETCHED_LOCALES) {
      field[locale] ??= english
    }
  }

  return { ...perLocale[0].entry, fields } as unknown as ContentfulEntry<T>
}

/**
 * One asset, in the localized shape ui2's `getAssetUrl` reads.
 *
 * Assets are NOT fetched per locale: the proxy returns them flat, and the artwork is the same file in
 * every language. The response is wrapped under `en-US` — which is the key ui2 looks under — and the file
 * URL is rewritten for the image proxy on the way through.
 */
async function fetchAsset(id: string): Promise<ContentfulAsset> {
  const asset = await getJson<{
    sys: ContentfulAsset['sys']
    metadata: ContentfulAsset['metadata']
    fields: { title: string; description: string; file: { url: string } }
  }>(cmsUrl(`/assets/${id}/`))
  // An asset whose file is missing (still processing, or unpublished) would otherwise be a TypeError here.
  // Thrown rather than patched over: the caller tolerates a failed asset and drops it, so the banner loses
  // one image instead of the campaign losing everything.
  const file = asset.fields?.file
  if (!file?.url) throw new Error(`contentful asset ${id} has no file`)

  return {
    ...asset,
    fields: {
      title: { [ContentfulLocale.enUS]: asset.fields.title },
      description: { [ContentfulLocale.enUS]: asset.fields.description },
      file: { [ContentfulLocale.enUS]: { ...file, url: optimizeAssetUrl(file.url) } }
    }
  } as unknown as ContentfulAsset
}

/** Every `sys.id` linked from these field sets, for one link type. */
function linkedIds(fieldSets: Record<string, unknown>[], linkType: 'Entry' | 'Asset'): string[] {
  const ids = new Set<string>()
  const collect = (value: unknown) => {
    // A multi-reference field arrives as an ARRAY of links rather than a link. No field in the model has
    // that shape today (`decentraland-dapps` has the same blind spot), but missing one would be silent —
    // the banner would simply render without its artwork.
    if (Array.isArray(value)) {
      value.forEach(collect)
      return
    }
    if (isSysLink(value) && (value as SysLink<'Entry' | 'Asset'>).sys.linkType === linkType) {
      ids.add((value as SysLink<'Entry' | 'Asset'>).sys.id)
    }
  }
  for (const fields of fieldSets) {
    for (const localizedField of Object.values(fields ?? {})) {
      Object.values((localizedField ?? {}) as Record<string, unknown>).forEach(collect)
    }
  }
  return [...ids]
}

function settled<T>(results: PromiseSettledResult<T>[]): T[] {
  return results.flatMap(result => (result.status === 'fulfilled' ? [result.value] : []))
}

/**
 * Fields ui2's `<Banner>` reads WITHOUT optional-chaining the field itself — `fields.desktopTitleAlignment[
 * 'en-US']`, not `fields.desktopTitleAlignment?.['en-US']`.
 *
 * Contentful omits a field entirely when the editor leaves it empty, and `BannerFields` types every one of
 * these as required, so nothing between the CMS and the render catches it. A single unfilled alignment
 * would throw inside the banner and take the surface down through its error boundary — reported as what
 * looks like a ui2 bug. Each one is given an empty localized map instead, which every read above degrades
 * on cleanly (no title, no alignment, no artwork).
 */
const REQUIRED_BANNER_FIELDS = [
  'desktopTitle',
  'mobileTitle',
  'desktopTitleAlignment',
  'mobileTitleAlignment',
  'desktopText',
  'mobileText',
  'desktopTextAlignment',
  'mobileTextAlignment',
  'desktopButtonAlignment',
  'mobileButtonAlignment',
  'showButton',
  'fullSizeBackground',
  'mobileBackground'
] as const

function normalizeBanner(fields: Record<string, unknown>, id: string): CampaignBanner {
  const out: Record<string, unknown> = { ...fields }
  for (const key of REQUIRED_BANNER_FIELDS) out[key] ??= {}
  return { ...out, id } as unknown as CampaignBanner
}

/**
 * The `collectionIds` field: addresses separated by commas, as an editor types them.
 *
 * Anything that is not an address is DROPPED rather than passed on — a typo would otherwise travel into a
 * catalogue query as a filter nothing matches, and the event would come back mysteriously short. Lowercased
 * because that is how every catalogue feed stores them.
 */
export function parseCollectionIds(value: string | undefined): string[] {
  if (!value) return []
  const seen = new Set<string>()
  for (const part of value.split(',')) {
    const address = part.trim().toLowerCase()
    if (/^0x[0-9a-f]{40}$/.test(address)) seen.add(address)
  }
  return [...seen]
}

function dedupeTags(tags: (string | undefined)[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const tag of tags) {
    const trimmed = tag?.trim()
    // Builder tag lookup is case-insensitive, so `Halloween` and `halloween` are the same query and asking
    // for both would only double the request.
    if (!trimmed || seen.has(trimmed.toLowerCase())) continue
    seen.add(trimmed.toLowerCase())
    out.push(trimmed)
  }
  return out
}

/**
 * The environment's marketing content, or `null` when there is no CMS configured.
 *
 * THROWS on a transport failure rather than swallowing it, so react-query can retry and the caller can
 * tell "the CMS is down" from "there is no campaign". Every surface treats both as "render nothing".
 */
export async function fetchCampaign(): Promise<Campaign | null> {
  if (!isContentfulConfigured()) return null

  const admin = await fetchEntryAllLocales(config.contentfulAdminEntityId)
  const adminFields = admin.fields as Record<string, Record<string, unknown>>

  // Linked reads are tolerated individually. One unpublished or deleted asset would otherwise reject the
  // whole campaign through Promise.all, so a missing logo would cost every banner — and the banner slots
  // are independent of each other by design.
  const entries = settled(
    await Promise.allSettled(linkedIds([adminFields], 'Entry').map(id => fetchEntryAllLocales(id)))
  )
  const entryById = new Map(entries.map(entry => [entry.sys.id, entry]))

  const assetIds = linkedIds([adminFields, ...entries.map(e => e.fields as Record<string, unknown>)], 'Asset')
  const assets: Record<string, ContentfulAsset> = {}
  for (const asset of settled(await Promise.allSettled(assetIds.map(id => fetchAsset(id))))) {
    assets[asset.sys.id] = asset
  }

  // Banners are keyed by the ADMIN FIELD they hang off, not by entry id: that field name is the slot
  // ("the home page one", "the event page one"), and two slots may legitimately point at one entry — which
  // is exactly how production is configured today.
  const banners: Record<string, CampaignBanner> = {}
  for (const [key, field] of Object.entries(adminFields)) {
    const link = field?.[ContentfulLocale.enUS]
    if (!isSysLink(link)) continue
    const entry = entryById.get(link.sys.id)
    if (entry?.sys.contentType?.sys.id !== BANNER_CONTENT_TYPE) continue
    banners[key] = normalizeBanner(entry.fields, link.sys.id)
  }

  // Found by CONTENT TYPE rather than by the `campaign` field name, so renaming the field in Contentful
  // cannot silently drop the event.
  const campaignEntry = entries.find(entry => entry.sys.contentType?.sys.id === CAMPAIGN_CONTENT_TYPE)
  const campaignFields = campaignEntry?.fields as unknown as CampaignFields | undefined

  const mainTag = campaignFields?.mainTag?.[ContentfulLocale.enUS]?.trim() || null
  const additionalTags = campaignFields?.additionalTags?.[ContentfulLocale.enUS] ?? []
  // Not in `CampaignFields`: the field was added to the content type after `@dcl/schemas` shipped its
  // types, so it is read off the untyped entry and validated here.
  const collectionIds = (campaignFields as unknown as { collectionIds?: LocalizedField<string> } | undefined)
    ?.collectionIds?.[ContentfulLocale.enUS]

  return {
    name: campaignFields?.name?.[ContentfulLocale.enUS] ?? null,
    tabName: campaignFields?.marketplaceTabName ?? null,
    mainTag,
    tags: dedupeTags([mainTag ?? undefined, ...additionalTags]),
    collections: parseCollectionIds(collectionIds),
    banners,
    assets
  }
}
