import { useQuery } from '@tanstack/react-query'
import { config } from '~/config'

// Catalyst lambdas profile endpoint (per-env — .zone testnet / .org prod — via src/config).
const PEER_URL = config.peerUrl

export type ProfileAvatar = {
  name?: string
  avatar?: { snapshots?: { face256?: string; body?: string } }
}

export function useProfile(address?: string) {
  return useQuery({
    queryKey: ['profile', address],
    enabled: !!address,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<ProfileAvatar | undefined> => {
      const res = await fetch(`${PEER_URL}/lambdas/profiles/${address!.toLowerCase()}`)
      if (!res.ok) return undefined
      const profile = await res.json()
      return profile?.avatars?.[0] as ProfileAvatar | undefined
    }
  })
}
