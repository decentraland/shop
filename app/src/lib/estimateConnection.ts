// Estimates the client's downlink bandwidth without issuing an extra request, by reading the transfer
// timings of assets the page has ALREADY downloaded (PerformanceResourceTiming). This is the primary
// signal for choosing the item-preview renderer (see pickRenderer). navigator.connection is used only
// to read saveData and as a coarse fallback estimate — it is Chromium-only and its downlink/effectiveType
// are browser guesses, not measurements (they don't reflect DevTools throttling).

export type ConnectionEstimate = {
  // Estimated downlink in Mbps, or null when it can't be determined (no sizable transfers yet).
  mbps: number | null
  // The user has opted into reduced data usage — a hard signal to prefer the lighter renderer.
  saveData: boolean
  source: 'resource-timing' | 'network-info' | 'none'
}

// Transfers below this many bytes are dominated by latency/slow-start and give misleading throughput,
// so they're excluded from the estimate.
const MIN_SAMPLE_BYTES = 30_000

type NavigatorConnection = {
  downlink?: number
  saveData?: boolean
  effectiveType?: string
}

function getConnection(): NavigatorConnection | undefined {
  if (typeof navigator === 'undefined') return undefined
  return (navigator as unknown as { connection?: NavigatorConnection }).connection
}

// Peak per-resource throughput (Mbps) among sizable same-origin transfers. transferSize is the real
// bytes-over-network, so cache hits (transferSize 0) and cross-origin entries without Timing-Allow-Origin
// (also 0) are naturally excluded. Parallel downloads only depress each sample's rate, so the max is the
// least-contended — the closest safe approximation of available bandwidth.
function estimateFromResourceTiming(): number | null {
  if (typeof performance === 'undefined' || typeof performance.getEntriesByType !== 'function') return null
  const entries = performance.getEntriesByType('resource') as PerformanceResourceTiming[]
  let best: number | null = null
  for (const e of entries) {
    if (e.transferSize >= MIN_SAMPLE_BYTES && e.duration > 0) {
      const mbps = (e.transferSize * 8) / 1e6 / (e.duration / 1000)
      if (best === null || mbps > best) best = mbps
    }
  }
  return best
}

function round(mbps: number): number {
  return Math.round(mbps * 10) / 10
}

export function estimateConnection(): ConnectionEstimate {
  const conn = getConnection()
  const saveData = conn?.saveData === true

  const measured = estimateFromResourceTiming()
  if (measured !== null) {
    return { mbps: round(measured), saveData, source: 'resource-timing' }
  }
  if (typeof conn?.downlink === 'number' && conn.downlink > 0) {
    return { mbps: conn.downlink, saveData, source: 'network-info' }
  }
  return { mbps: null, saveData, source: 'none' }
}
