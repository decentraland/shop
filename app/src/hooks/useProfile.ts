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
    queryFn: (): Promise<ProfileAvatar | undefined> => fetchProfile(address!)
  })
}
