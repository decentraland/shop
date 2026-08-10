import { config } from '~/config'

export type ProfileAvatar = {
  name?: string
  // Whether `name` is a claimed (paid) DCL name. Drives the avatar background color (unclaimed names
  // get an `#<last4 of address>` suffix before hashing — see lib/avatarColor.ts) and the "verified"
  // treatment elsewhere.
  hasClaimedName?: boolean
  // The owner address as returned by the Catalyst payload — used with `name`/`hasClaimedName` to
  // derive the deterministic avatar background color.
  ethAddress?: string
  // `bodyShape` is a BaseMale/BaseFemale URN in the Catalyst payload — used to detect whether an item
  // is compatible with the connected avatar's shape (see lib/bodyShape.ts).
  //
  // `wearables` + the three colours are what it takes to REBUILD this avatar from parts instead of asking
  // the preview to load it by address: the fitting room has to drop an equipped wearable that would hide the
  // item being tried on, and the only way to leave one out is to pass the list ourselves (see
  // hooks/useTryOnAvatar). Colours come as Color3 floats (0..1) — see avatarColors.
  avatar?: {
    bodyShape?: string
    wearables?: string[]
    eyes?: { color?: Color3 }
    hair?: { color?: Color3 }
    skin?: { color?: Color3 }
    snapshots?: { face256?: string; body?: string }
  }
}

type Color3 = { r?: number; g?: number; b?: number }

// Color3 (0..1 per channel) → the 6-digit hex the wearable preview takes, WITHOUT a leading '#'.
function toHex(color?: Color3): string | undefined {
  if (!color || color.r == null || color.g == null || color.b == null) return undefined
  const byte = (v: number) =>
    Math.max(0, Math.min(255, Math.round(v * 255)))
      .toString(16)
      .padStart(2, '0')
  return `${byte(color.r)}${byte(color.g)}${byte(color.b)}`
}

// The avatar's own skin/hair/eye colours, ready to hand to the preview. Undefined per channel when the
// profile does not carry it, in which case the preview keeps its default for that one.
export function avatarColors(profile?: ProfileAvatar): { skin?: string; hair?: string; eyes?: string } {
  return {
    skin: toHex(profile?.avatar?.skin?.color),
    hair: toHex(profile?.avatar?.hair?.color),
    eyes: toHex(profile?.avatar?.eyes?.color)
  }
}

// The raw Catalyst lambdas profile fetch. Single source of truth for the profile endpoint + shape,
// shared by useProfile (React-query hook) and lib/search (pure lib). Returns the first avatar, or
// undefined when the profile is missing (404) — callers treat "no profile" the same as "not ok".
export async function fetchProfile(address: string): Promise<ProfileAvatar | undefined> {
  const res = await fetch(`${config.peerUrl}/lambdas/profiles/${address.toLowerCase()}`)
  if (!res.ok) return undefined
  const profile = (await res.json()) as { avatars?: ProfileAvatar[] }
  return profile?.avatars?.[0]
}

/**
 * Profiles for many addresses in ONE request (Catalyst lambdas `POST /lambdas/profiles`).
 *
 * The single-address GET above is right for a page about one creator; a ranking has to know something
 * about every candidate before it can choose between them, and thirty sequential GETs to pick eight is
 * not that. Missing profiles are simply absent from the response, so callers get a partial map rather
 * than a hole per address.
 *
 * Keyed by LOWERCASED address: the Catalyst echoes `ethAddress` back in its own casing, and the caller's
 * address comes from a different system entirely.
 */
export async function fetchProfiles(addresses: string[]): Promise<Map<string, ProfileAvatar>> {
  const ids = addresses.map(address => address.toLowerCase())
  const byAddress = new Map<string, ProfileAvatar>()
  if (ids.length === 0) return byAddress

  const res = await fetch(`${config.peerUrl}/lambdas/profiles`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids })
  })
  if (!res.ok) throw new Error(`fetchProfiles ${res.status}`)

  const profiles = (await res.json()) as { avatars?: ProfileAvatar[] }[]
  for (const profile of profiles ?? []) {
    const avatar = profile?.avatars?.[0]
    if (avatar?.ethAddress) byAddress.set(avatar.ethAddress.toLowerCase(), avatar)
  }
  return byAddress
}
