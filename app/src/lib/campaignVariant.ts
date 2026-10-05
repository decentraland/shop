import { parseCampaignTheme } from '~/lib/campaignTheme'
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

/** Takes the skin off without touching the CMS. Not a theme, so the registry cannot answer for it. */
const NO_SKIN = 'none'

/**
 * What the `shop-campaign` variant payload says: which seasonal theme to wear, and who gets to see the
 * event at all.
 *
 * - `halloween` — the skin, and the event, for everybody.
 * - `halloween:0xa…,0xb…` — the skin, and the event, for those accounts only.
 * - `0xa…,0xb…` — the event for those accounts, themed from the campaign's own tag.
 * - `none` — the event for everybody with no skin.
 *
 * A bare address list is recognised without the colon because every OTHER flag in this app carries exactly
 * that, and a payload typed from the habit would otherwise read as a theme name nobody knows.
 *
 * Which is why, with no colon to separate the two halves, only a payload this build can ACT on opens the
 * event to everybody: a registered theme, or `none`. Anything else was a restriction that went wrong, and
 * it restricts the event to nobody. Guessing from shape instead (does it start with `0x`, does it hold a
 * separator) leaves a gap for every list that does not look like one, `alice.dcl.eth` among them, and the
 * event escapes to the whole world while the payload still reads as deliberate.
 *
 * With a colon the operator has separated the halves themselves, so an unknown theme there is just an
 * unknown theme: no skin, and whatever restriction the second half carries.
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

  const token = payload.trim()
  if (parseCampaignTheme(token) !== null || token.toLowerCase() === NO_SKIN) return { theme: token, only: null }
  return { theme: null, only: [] }
}
