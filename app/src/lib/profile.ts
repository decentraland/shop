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
  avatar?: { bodyShape?: string; snapshots?: { face256?: string; body?: string } }
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
