import { useQuery } from '@tanstack/react-query'
import { fetchProfile, type ProfileAvatar } from '~/lib/profile'

// Re-exported so existing importers (e.g. lib/bodyShape) keep their `~/hooks/useProfile` path; the
// type + raw fetch now live in lib/profile as the single source of truth.
export type { ProfileAvatar }

export function useProfile(address?: string) {
  return useQuery({
    queryKey: ['profile', address],
    enabled: !!address,
    staleTime: 5 * 60_000,
    // react-query v5 fails a query that resolves `undefined` (without retrying), so a missing profile
    // must resolve `null` — otherwise it never caches and every remounting consumer refetches it.
    queryFn: async (): Promise<ProfileAvatar | null> => (await fetchProfile(address!)) ?? null,
    select: (profile): ProfileAvatar | undefined => profile ?? undefined
  })
}
