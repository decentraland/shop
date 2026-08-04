import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useProfile } from '~/hooks/useProfile'
import { avatarShape, type BodyShapeUrn } from '~/lib/bodyShape'
import { avatarColors } from '~/lib/profile'
import { fetchWearableRules, keepEquipped } from '~/lib/wearable-rules'

/**
 * HOW TO DRESS THE SHOPPER'S AVATAR IN SOMETHING THEY DON'T OWN YET.
 *
 * The simple way is to hand the preview `profile=<address>` and the urns to add, and let it load the avatar.
 * That is what we did, and it has one failure mode that matters: the preview honours what the avatar's OWN
 * wearables hide, so an equipped skin — which covers the whole body — silently swallowed the item the shopper
 * opened the fitting room to look at. Nothing rendered, nothing explained it.
 *
 * So when (and only when) an equipped wearable would hide what we are trying on, this rebuilds the avatar
 * from parts instead: the profile's own wearable list minus the ones in the way, its body shape, and its skin,
 * hair and eye colours. The result looks like the same avatar, because it is — with the hat back on.
 *
 * Everything about it is fail-soft. No wallet, no profile, no rules from the Catalyst, or nothing in the way:
 * it returns the plain `profile` form, i.e. exactly the behaviour it replaces.
 */
export type TryOnAvatar = {
  /** What to pass as the preview's `profile`: the address, or 'default' when we compose the list ourselves. */
  profile: string
  /** Body shape urn to pass — only when composing (with a real profile the address carries its own). */
  bodyShape?: BodyShapeUrn
  /** The urns to render: the try-on urns, or the pruned avatar + the try-on urns when composing. */
  urns: string[]
  skin?: string
  hair?: string
  eyes?: string
  /** True while the profile/rules lookups are still settling, so the caller can hold the preview mount. */
  isLoading: boolean
  /** True when an equipped wearable was dropped to make room. */
  composed: boolean
}

export function useTryOnAvatar({
  address,
  tryOnUrns,
  tryOnCategories,
  enabled = true
}: {
  address?: string
  tryOnUrns: string[]
  /** The wearable categories being tried on (e.g. ['hat']). Emotes contribute nothing here. */
  tryOnCategories: string[]
  enabled?: boolean
}): TryOnAvatar {
  const { data: profile, isFetched: profileFetched } = useProfile(address)
  const equipped = profile?.avatar?.wearables ?? []
  const hasAvatar = !!address && !!profile

  // Keyed by the equipped list alone — the rules describe those wearables, not what we are trying on, so the
  // answer is shared across every combination the shopper flips through.
  const equippedKey = equipped.join(',')
  const { data: rules, isLoading: rulesLoading } = useQuery({
    queryKey: ['wearable-rules', equippedKey],
    enabled: enabled && hasAvatar && equipped.length > 0 && tryOnCategories.length > 0,
    staleTime: 30 * 60_000,
    retry: false,
    queryFn: () => fetchWearableRules(equipped)
  })

  return useMemo(() => {
    const isLoading = (!!address && !profileFetched) || rulesLoading
    if (!hasAvatar || !rules || rules.length === 0) {
      return { profile: hasAvatar && address ? address : 'default', urns: tryOnUrns, isLoading, composed: false }
    }
    const kept = keepEquipped(rules, tryOnCategories)
    // Nothing was in the way → stay on the plain profile form, which also keeps every part of the avatar we
    // could not read rules for (a wearable missing from the Catalyst answer is not in `rules`).
    if (kept.length === rules.length) {
      return { profile: address ?? 'default', urns: tryOnUrns, isLoading, composed: false }
    }
    const colors = avatarColors(profile)
    return {
      profile: 'default',
      bodyShape: avatarShape(profile) ?? undefined,
      urns: [...kept, ...tryOnUrns],
      ...colors,
      isLoading,
      composed: true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address, hasAvatar, profile, profileFetched, rules, rulesLoading, tryOnUrns.join(','), tryOnCategories.join(',')])
}
