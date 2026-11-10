import { useQuery } from '@tanstack/react-query'
import { measureDownlinkMbps } from '~/lib/connectionSpeed'

/**
 * The link speed from one probe download, measured at most once per page load and only once `enabled`.
 * `pending` is true only while an enabled probe is still running.
 */
export function useMeasuredMbps(enabled: boolean): { mbps: number | null; pending: boolean } {
  const { data, isPending } = useQuery({
    queryKey: ['link-speed'],
    queryFn: measureDownlinkMbps,
    enabled,
    staleTime: Infinity,
    gcTime: Infinity,
    retry: false
  })
  return { mbps: data ?? null, pending: enabled && isPending }
}
