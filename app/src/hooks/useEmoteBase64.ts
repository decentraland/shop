import { useQuery } from '@tanstack/react-query'
import { fetchEmoteBase64 } from '~/lib/emoteBase64'

/**
 * The base64 definition a preview needs to play a published emote (see lib/emoteBase64). Shared across
 * surfaces by urn — the same outfit emote is asked for by the detail page and the studio.
 */
export function useEmoteBase64(urn: string | null) {
  const query = useQuery({
    queryKey: ['emote-base64', urn],
    enabled: !!urn,
    staleTime: 30 * 60_000,
    retry: false,
    queryFn: () => fetchEmoteBase64(urn!)
  })

  return {
    base64: query.data?.base64 ?? null,
    /** Whether the emote loops. False when there is nothing to play, which is also what the preview assumes. */
    loop: query.data?.loop ?? false,
    // False with no urn to resolve, and once the lookup settles either way — a preview waiting on this
    // must never wait forever because the Catalyst was down.
    isLoading: query.isLoading
  }
}
