import { parseAddressList } from '~/lib/featureFlags'

export type CampaignVariant = {
  /** The theme token as written, before the registry is consulted. `null` when the payload names none. */
  theme: string | null
  /**
   * Who the event is for. `null` means no restriction was written, so it is for everybody; an ARRAY is a
   * restriction, and an empty one restricts it to nobody.
   *
   * The distinction is the whole safety of this feature. An operator who reached for a restriction and
   * mistyped it must not get a public launch, so a payload that was clearly trying to name accounts and
   * yielded none lands on the empty array rather than on `null`.
   */
  only: string[] | null
}

const UNRESTRICTED: CampaignVariant = { theme: null, only: null }

/**
 * Anything that marks a payload as an attempt at an address list rather than a theme name: an address
 * prefix, or a separator between entries. A theme is one word and carries none of them.
 */
const REACHING_FOR_A_LIST = /0x|[,;|]/i

/**
 * What the `shop-campaign` variant payload says: which seasonal theme to wear, and who gets to see the
 * event at all.
 *
 * - `halloween` — the skin, and the event, for everybody.
 * - `halloween:0xa…,0xb…` — the skin, and the event, for those accounts only.
 * - `0xa…,0xb…` — the event for those accounts, themed from the campaign's own tag.
 * - `none` — the event for everybody with no skin. The kill switch for the theme alone.
 *
 * A bare address list is recognised without the colon because every OTHER flag in this app carries exactly
 * that, and a payload typed from the habit would otherwise read as a theme name nobody knows.
 *
 * Everything here fails CLOSED. A truncated address, a `;` where a `,` belongs, an entry that is not an
 * address at all: each leaves a restriction that matches nobody, so the event stays hidden and the mistake
 * is visible within a minute. The alternative — reading an unparseable list as "no list" — ships the event
 * to the whole world and looks exactly like success.
 */
export function parseCampaignVariant(payload: string | null | undefined): CampaignVariant {
  if (!payload || payload.trim().length === 0) return UNRESTRICTED

  const separator = payload.indexOf(':')
  if (separator !== -1) {
    const after = payload.slice(separator + 1)
    return {
      theme: payload.slice(0, separator).trim() || null,
      // Only a blank half means the operator wrote no list. Anything else was an attempt at one.
      only: after.trim().length === 0 ? null : parseAddressList(after)
    }
  }

  const only = parseAddressList(payload)
  if (only.length > 0) return { theme: null, only }
  if (REACHING_FOR_A_LIST.test(payload)) return { theme: null, only: [] }
  return { theme: payload.trim(), only: null }
}
