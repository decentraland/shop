import { useQuery } from '@tanstack/react-query'

// Catalyst lambdas profile endpoint. .zone for testnet, .org for prod.
const PEER_URL = import.meta.env.VITE_PEER_URL ?? 'https://peer.decentraland.zone'

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
