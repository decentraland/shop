import { describe, it, expect } from 'vitest'
// @ts-expect-error — a plain .mjs helper for the Lighthouse harness; it ships no types by design.
import { entryChunkOf, medians, restoredSession, summarize } from './lighthouse-lib.mjs'

type Numbers = { perf: number; fcp: number; lcp: number; tbt: number; cls: number; si: number; ttiMs?: number }

/** A Lighthouse report reduced to the fields the harness reads. */
function lhr({ perf, fcp, lcp, tbt, cls, si, ttiMs = 1000 }: Numbers, urls: string[] = []) {
  return {
    categories: {
      performance: { score: perf / 100 },
      accessibility: { score: 0.96 },
      'best-practices': { score: 0.77 },
      seo: { score: 0.69 }
    },
    audits: {
      'first-contentful-paint': { numericValue: fcp },
      'largest-contentful-paint': { numericValue: lcp },
      'total-blocking-time': { numericValue: tbt },
      'cumulative-layout-shift': { numericValue: cls },
      'speed-index': { numericValue: si },
      interactive: { numericValue: ttiMs },
      diagnostics: { details: { items: [{ totalByteWeight: 1024 * 100, numRequests: 200 }] } },
      'network-requests': { details: { items: urls.map(url => ({ url })) } }
    }
  }
}

/**
 * The harness used to report the metrics of ONE run — the one Lighthouse's `computeMedianRun` picks as
 * closest to the median FCP and TTI — under the word "median". These cases are built so the two answers
 * cannot coincide: the run that is central in FCP/TTI is deliberately the extreme one in LCP and score.
 */
describe('medians', () => {
  it('should take each metric from the whole batch, not from one representative run', () => {
    // Middle FCP/TTI, worst LCP and lowest score: exactly the run a representative-run pick would report.
    const representative = lhr({ perf: 59, fcp: 5000, lcp: 9000, tbt: 100, cls: 0.01, si: 6000, ttiMs: 8000 })
    const batch = [
      lhr({ perf: 63, fcp: 4000, lcp: 7000, tbt: 80, cls: 0.01, si: 5000, ttiMs: 7000 }),
      representative,
      lhr({ perf: 61, fcp: 6000, lcp: 8000, tbt: 120, cls: 0.01, si: 7000, ttiMs: 9000 })
    ]

    const result = medians(batch)

    expect(result.perf).toBe(61)
    expect(result.lcp).toBe(8000)
    expect(result.tbt).toBe(100)
    // …and none of it is the representative run's own numbers.
    expect(result.perf).not.toBe(summarize(representative).perf)
    expect(result.lcp).not.toBe(summarize(representative).lcp)
  })

  // A score and a request count have no halves, so an even batch rounds them back; CLS keeps its decimals.
  it('should round whole-valued metrics when the batch has no middle run', () => {
    const batch = [
      lhr({ perf: 69, fcp: 1300, lcp: 5900, tbt: 0, cls: 0.001, si: 2100 }),
      lhr({ perf: 92, fcp: 1080, lcp: 1440, tbt: 1, cls: 0.012, si: 1548 })
    ]

    const result = medians(batch)

    expect(result.perf).toBe(81)
    expect(Number.isInteger(result.reqs)).toBe(true)
    // 0.0065 carried to the three decimals CLS is reported in, not the raw average.
    expect(result.cls).toBe(0.007)
  })
})

/**
 * A run whose seeded session failed to restore is a guest run. Filing one under a signed-in label does not
 * merely add noise — it understates the one thing that row exists to measure, and it looks like a result.
 */
describe('restoredSession', () => {
  it('should hold when the notifications chunk loaded', () => {
    expect(
      restoredSession(lhr({ perf: 90, fcp: 1, lcp: 1, tbt: 0, cls: 0, si: 1 }, ['/_assets/NotificationsBell-a1.js']))
    ).toBe(true)
  })

  it('should fail for a run that never loaded it, however complete the report looks', () => {
    const guest = lhr({ perf: 90, fcp: 1, lcp: 1, tbt: 0, cls: 0, si: 1 }, [
      '/_assets/index-a1.js',
      '/_assets/react-b2.js'
    ])

    expect(restoredSession(guest)).toBe(false)
  })

  // The batch-level check this replaced passed as long as ONE of three runs restored, and the whole batch
  // was then presented as signed-in.
  it('should be answerable per run, so a mixed batch cannot pass as a whole', () => {
    const batch = [
      lhr({ perf: 90, fcp: 1, lcp: 1, tbt: 0, cls: 0, si: 1 }, ['/_assets/NotificationsBell-a1.js']),
      lhr({ perf: 90, fcp: 1, lcp: 1, tbt: 0, cls: 0, si: 1 }, ['/_assets/index-a1.js']),
      lhr({ perf: 90, fcp: 1, lcp: 1, tbt: 0, cls: 0, si: 1 }, ['/_assets/index-a1.js'])
    ]

    expect(batch.some(restoredSession)).toBe(true)
    expect(batch.every(restoredSession)).toBe(false)
  })
})

describe('entryChunkOf', () => {
  it('should name the build that answered', () => {
    const report = lhr({ perf: 90, fcp: 1, lcp: 1, tbt: 0, cls: 0, si: 1 }, [
      'https://example.test/_assets/react-CUgFe0AV.js',
      'https://example.test/_assets/index-CzQZl3i8.js'
    ])

    expect(entryChunkOf(report)).toBe('index-CzQZl3i8.js')
  })

  it('should be null when nothing identifies it, rather than guess', () => {
    expect(entryChunkOf(lhr({ perf: 90, fcp: 1, lcp: 1, tbt: 0, cls: 0, si: 1 }, ['https://example.test/x.css']))).toBe(
      null
    )
  })
})
