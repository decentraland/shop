// The pure readers behind `lighthouse.mjs`, split out so they can be tested. The script itself launches
// Chrome at import time, so importing THAT from a spec would start a browser.

export const METRICS = [
  ['perf', lhr => Math.round(lhr.categories.performance.score * 100)],
  ['fcp', lhr => Math.round(lhr.audits['first-contentful-paint'].numericValue)],
  ['lcp', lhr => Math.round(lhr.audits['largest-contentful-paint'].numericValue)],
  ['tbt', lhr => Math.round(lhr.audits['total-blocking-time'].numericValue)],
  ['cls', lhr => Number(lhr.audits['cumulative-layout-shift'].numericValue.toFixed(3))],
  ['si', lhr => Math.round(lhr.audits['speed-index'].numericValue)],
  // `diagnostics` and `resource-summary` count requests differently (288 vs 237 on the same run), so the
  // table commits to one of them and never mixes the two.
  ['bytes', lhr => Math.round(lhr.audits.diagnostics.details.items[0].totalByteWeight / 1024)],
  ['reqs', lhr => lhr.audits.diagnostics.details.items[0].numRequests],
  ['a11y', lhr => Math.round(lhr.categories.accessibility.score * 100)],
  ['bp', lhr => Math.round(lhr.categories['best-practices'].score * 100)],
  ['seo', lhr => Math.round(lhr.categories.seo.score * 100)]
]

export function summarize(lhr) {
  return Object.fromEntries(METRICS.map(([key, read]) => [key, read(lhr)]))
}

export function median(values) {
  const sorted = [...values].sort((a, b) => a - b)
  const middle = sorted.length >> 1
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

/**
 * The median OF EACH METRIC across the batch — not the metrics of one chosen run.
 *
 * Lighthouse ships `computeMedianRun`, which picks the single run closest to the median FCP and TTI, and
 * this used to report that run's every number under the word "median". They are not the same thing and the
 * gap is not academic: a batch scoring 59/60/59 has median 60 reported for a true median of 59, and the
 * same batch reported an LCP 150ms off its own median. A per-metric median cannot be attributed to any one
 * run, which is why the individual JSONs are all kept.
 */
export function medians(lhrs) {
  return Object.fromEntries(
    METRICS.map(([key, read]) => {
      const values = lhrs.map(read)
      const mid = median(values)
      // An even-sized batch averages its two middle values, which is the right median and the wrong
      // number to print for a Lighthouse score or a request count: neither has halves. Metrics that are
      // whole by nature are rounded back; CLS, which is not, keeps its decimals.
      return [key, values.every(Number.isInteger) ? Math.round(mid) : Number(mid.toFixed(3))]
    })
  )
}

// The entry chunk's hashed name — the only handle this has on WHICH BUILD answered. A batch whose two
// halves hit different builds is not a comparison, and that has already happened here: `main` took four
// merges during one measurement window, so a row compared the branch against an older `main` than the row
// below it. Recorded per run, checked per batch.
// `NavBar` mounts the notifications bell only with a session, and it is a chunk of its own, so its
// absence from the network log means the seeded identity never restored. Kept as a named predicate
// because it is the one thing standing between a guest run and a table row labelled signed-in.
export function restoredSession(lhr) {
  return (lhr.audits['network-requests']?.details?.items ?? []).some(item => /NotificationsBell/.test(item.url))
}

export function entryChunkOf(lhr) {
  for (const item of lhr.audits['network-requests']?.details?.items ?? []) {
    const match = /\/(index-[A-Za-z0-9_-]+\.js)(\?|$)/.exec(item.url)
    if (match) return match[1]
  }
  return null
}
