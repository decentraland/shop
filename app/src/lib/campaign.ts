import { config } from '~/config'
import { captureError } from '~/lib/monitoring'

/**
 * Which collections belong to a seasonal event.
 *
 * An event is NOT a list of items. It is one or more builder-server TAGS applied to whole collections, and
 * `GET /v1/addresses?tag=…` turns those tags into the on-chain collection addresses the storefront grid is
 * then filtered by. Same source the Marketplace's campaign browser reads.
 *
 * Public, unauthenticated read — unlike the rest of `lib/builder.ts`, which is signed as the creator.
 */

/**
 * How many collections a single event may pin the grid to.
 *
 * The addresses travel in the query string of the catalogue request, and they are 42 characters each: the
 * live `halloween` tag alone resolves to 97 collections (~4.2 KB), and an older festival tag resolves to
 * 159 (~6.8 KB), which is close enough to the usual 8 KB server and CDN ceiling to matter. A request that
 * gets truncated in transit does not fail — it arrives with a shorter list — so the list is capped HERE,
 * where the overflow can be reported, instead of being discovered as a mysteriously thin grid.
 *
 * Truncating still shows a partial event, which is why the server is also required to fail closed on an
 * empty list (an empty filter must never mean "the whole catalogue").
 */
export const MAX_CAMPAIGN_CONTRACTS = 120

type AddressesByTagResponse = { ok?: boolean; data?: string[] } | string[]

/**
 * The collection addresses carried by these tags, lowercased and de-duplicated.
 *
 * Returns `[]` for no tags and for a tag nobody has applied — both of which mean "this event selects
 * nothing". Callers MUST treat an empty result as "show no items", never as "no filter": that distinction
 * is the difference between an empty event tab and the entire catalogue presented as the event.
 *
 * An unreachable builder THROWS rather than returning `[]`, so react-query can retry it and a caller can
 * tell an outage apart from an empty event. Collapsing the two would make an outage look like a decision.
 */
export async function fetchCampaignContracts(tags: string[]): Promise<string[]> {
  const wanted = tags.map(tag => tag.trim()).filter(Boolean)
  if (wanted.length === 0) return []

  const query = wanted.map(tag => `tag=${encodeURIComponent(tag)}`).join('&')
  const res = await fetch(`${config.builderServerUrl}/v1/addresses?${query}`)
  if (!res.ok) throw new Error(`fetchCampaignContracts ${res.status}`)

  const json = (await res.json()) as AddressesByTagResponse
  const raw = Array.isArray(json) ? json : (json.data ?? [])

  const seen = new Set<string>()
  for (const address of raw) {
    if (typeof address === 'string' && /^0x[0-9a-fA-F]{40}$/.test(address)) seen.add(address.toLowerCase())
  }
  const addresses = [...seen]

  if (addresses.length > MAX_CAMPAIGN_CONTRACTS) {
    // Reported rather than thrown: a partial event is still a usable event, and taking the tab down over it
    // would be a worse outcome than the one being reported.
    captureError(new Error('campaign tag exceeds the contract cap'), {
      tags: wanted.join(','),
      resolved: String(addresses.length),
      cap: String(MAX_CAMPAIGN_CONTRACTS)
    })
    return addresses.slice(0, MAX_CAMPAIGN_CONTRACTS)
  }

  return addresses
}

/**
 * Whether an item's collection is part of the event.
 *
 * `contracts` is expected already lowercased, which is what `fetchCampaignContracts` guarantees; only the
 * address being tested is normalised here, since it comes from a feed that spells them either way.
 */
export function isInCampaign(contracts: string[], contractAddress: string | undefined | null): boolean {
  if (!contractAddress) return false
  return contracts.includes(contractAddress.toLowerCase())
}
