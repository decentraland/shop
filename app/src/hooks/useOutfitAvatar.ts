import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useProfile } from '~/hooks/useProfile'
import { avatarShape, type BodyShapeUrn } from '~/lib/bodyShape'
import { avatarColors } from '~/lib/profile'
import { faceOnly, fetchWearableRules } from '~/lib/wearable-rules'

/**
 * THE AVATAR AN OUTFIT IS PREVIEWED ON: the shopper's face and colours, wearing the outfit and nothing else.
 *
 * The outfit is always composed from parts rather than loaded by address, because the preview must not put
 * the outfit on top of the shopper's own hat, hair and shoes — see `faceOnly`. What the avatar still
 * contributes is what makes it theirs: its body shape, its skin/hair/eye colours, and its face.
 *
 * Fail-soft, like the try-on it replaces here: no wallet, no profile, or no answer from the Catalyst, and
 * this is just the outfit on a mannequin.
 */
export type OutfitAvatar = {
  /** Always 'default' — the parts are passed explicitly, so no profile is loaded by address. */
  profile: string
  bodyShape?: BodyShapeUrn
  /** The face urns to keep, followed by the outfit's own. */
  urns: string[]
  skin?: string
  hair?: string
  eyes?: string
  /** True while the profile/face lookups are settling, so the caller can hold the preview mount. */
  isLoading: boolean
}

export function useOutfitAvatar({
  address,
  outfitUrns,
  enabled = true
}: {
  address?: string
  outfitUrns: string[]
  enabled?: boolean
}): OutfitAvatar {
  const { data: profile, isFetched: profileFetched } = useProfile(address)
  const equipped = profile?.avatar?.wearables ?? []
  const hasAvatar = !!address && !!profile

  // Keyed by the equipped list alone, and shared with the fitting room's try-on: the answer describes those
  // wearables, so it is the same one whichever surface asks.
  const equippedKey = equipped.join(',')
  const wantsRules = enabled && hasAvatar && equipped.length > 0
  const {
    data: rules,
    isLoading: rulesLoading,
    isFetched: rulesFetched
  } = useQuery({
    queryKey: ['wearable-rules', equippedKey],
    enabled: wantsRules,
    staleTime: 30 * 60_000,
    retry: false,
    queryFn: () => fetchWearableRules(equipped)
  })

  const outfitKey = outfitUrns.join(',')

  return useMemo(() => {
    // Loading covers the WHOLE settling, including the gap between the profile arriving and the rules
    // query it enables reporting anything: a caller that mounts its preview in that gap gets the outfit
    // alone, then the face a moment later — and every such change reloads the scene and restarts the
    // emote under it. `rulesLoading` alone is false in that gap, which is exactly when it must not be.
    const isLoading = (!!address && !profileFetched) || rulesLoading || (wantsRules && !rulesFetched)
    if (!hasAvatar) {
      return { profile: 'default', urns: outfitUrns, isLoading }
    }
    return {
      profile: 'default',
      bodyShape: avatarShape(profile) ?? undefined,
      urns: [...faceOnly(rules ?? []), ...outfitUrns],
      ...avatarColors(profile),
      isLoading
    }
  }, [address, hasAvatar, profile, profileFetched, rules, rulesLoading, rulesFetched, wantsRules, outfitKey])
}
