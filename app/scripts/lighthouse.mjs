import { execFileSync } from 'node:child_process'
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { parseArgs } from 'node:util'
import * as chromeLauncher from 'chrome-launcher'
import lighthouse from 'lighthouse'
import desktopConfig from 'lighthouse/core/config/desktop-config.js'
import { computeMedianRun } from 'lighthouse/core/lib/median-run.js'

// Reproducible Lighthouse runs, so a perf change can be shown rather than asserted.
//
// A DevTools run measures whatever the browser happens to be: extensions inject scripts, a signed-in
// session pulls chunks a visitor never sees, and the viewport is the window. The first two runs of this
// series differed by 58 points on the SAME deployed release for exactly that reason. So: a throwaway
// Chrome profile (chrome-launcher makes one per launch — no extensions, no storage), Lighthouse's own
// screen emulation rather than the real window, cold cache, and N runs reduced to their median.
//
// Numbers from here are NOT comparable to a DevTools export: that one disables screen emulation. Runs
// carry their provenance in `shopRunMeta` and the table separates them.
//
//   node scripts/lighthouse.mjs --url https://decentraland.org/shop/overview --label guest
//   node scripts/lighthouse.mjs --scenario pdp --preset mobile --runs 5
//   node scripts/lighthouse.mjs --summary          # rebuild the table, run nothing

const SCENARIOS = {
  home: 'https://decentraland.org/shop/overview',
  pdp: 'https://decentraland.org/shop/item/0x7ef9c5602f4395be5dec9786f50fa8109ca8ce78/0',
  items: 'https://decentraland.org/shop/items'
}

const { values: argv } = parseArgs({
  options: {
    url: { type: 'string' },
    scenario: { type: 'string', default: 'home' },
    preset: { type: 'string', default: 'desktop' },
    label: { type: 'string' },
    runs: { type: 'string', default: '3' },
    // The first run against a cold DNS/TLS/CDN path is reliably the outlier — 72 against 87/90 on the
    // same URL minutes apart — so one run is thrown away before the batch starts. Set 0 to keep it.
    warmup: { type: 'string', default: '1' },
    out: { type: 'string' },
    headful: { type: 'boolean', default: false },
    summary: { type: 'boolean', default: false }
  }
})

const outDir = argv.out ?? new URL('../../lighthouse-runs/', import.meta.url).pathname
const preset = argv.preset
const runs = Number(argv.runs)
const warmup = Number(argv.warmup)
const url = argv.url ?? SCENARIOS[argv.scenario]
// Defaults to the scenario name so a batch is identifiable without spelling it out; `--label` overrides
// it for anything the URL cannot say (authenticated, a campaign running, a preview deploy).
const label = argv.label ?? argv.scenario

if (!['desktop', 'mobile'].includes(preset)) throw new Error(`--preset must be desktop or mobile, got "${preset}"`)
if (!argv.summary && !url)
  throw new Error(`unknown --scenario "${argv.scenario}" (${Object.keys(SCENARIOS).join(', ')})`)
if (!Number.isInteger(runs) || runs < 1) throw new Error(`--runs must be a positive integer, got "${argv.runs}"`)
if (!Number.isInteger(warmup) || warmup < 0) throw new Error(`--warmup must be 0 or more, got "${argv.warmup}"`)

// Mobile is Lighthouse's default config (Moto G4, 4x CPU slowdown, slow 4G); desktop overrides it.
const config = preset === 'desktop' ? desktopConfig : undefined

function git(...args) {
  try {
    return execFileSync('git', args, { encoding: 'utf8' }).trim()
  } catch {
    return null
  }
}

// The deployed release under test, read off the asset URLs rather than package.json: the run measures
// whatever the CDN is serving, which is not necessarily what this checkout builds.
function releaseOf(lhr) {
  for (const item of lhr.audits['network-requests']?.details?.items ?? []) {
    const match = /@dcl\/shop\/([^/]+)\//.exec(item.url)
    if (match) return match[1]
  }
  return null
}

const METRICS = [
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

function summarize(lhr) {
  return Object.fromEntries(METRICS.map(([key, read]) => [key, read(lhr)]))
}

async function collect() {
  const files = (await readdir(outDir).catch(() => [])).filter(f => f.endsWith('.json') && f !== 'index.json')
  const batches = new Map()
  for (const file of files.sort()) {
    const lhr = JSON.parse(await readFile(`${outDir}${file}`, 'utf8'))
    if (!lhr.categories?.performance) continue
    const meta = lhr.shopRunMeta ?? {}
    // A run with no meta is a hand-exported DevTools report. Keep it in the table — it is the history —
    // but under its own provenance, because its settings are not these.
    const key = meta.batch ?? `devtools:${file}`
    const batch = batches.get(key) ?? {
      key,
      provenance: meta.batch ? 'script' : 'devtools',
      preset: meta.preset ?? (lhr.configSettings.formFactor === 'desktop' ? 'desktop' : 'mobile'),
      label: meta.label ?? '?',
      url: lhr.finalDisplayedUrl,
      fetchTime: lhr.fetchTime,
      lhVersion: lhr.lighthouseVersion,
      release: releaseOf(lhr),
      commit: meta.commit ?? null,
      emulated: !lhr.configSettings.screenEmulation.disabled,
      files: [],
      lhrs: []
    }
    batch.files.push(file)
    batch.lhrs.push(lhr)
    batches.set(key, batch)
  }
  return [...batches.values()].sort((a, b) => a.fetchTime.localeCompare(b.fetchTime))
}

function row(batch) {
  const median = batch.lhrs.length > 1 ? computeMedianRun(batch.lhrs) : batch.lhrs[0]
  const s = summarize(median)
  const scores = batch.lhrs.map(lhr => Math.round(lhr.categories.performance.score * 100))
  const spread = scores.length > 1 ? ` (${Math.min(...scores)}–${Math.max(...scores)})` : ''
  return {
    ...s,
    perfCell: `**${s.perf}**${spread}`,
    n: batch.lhrs.length,
    when: batch.fetchTime.slice(0, 19).replace('T', ' '),
    batch
  }
}

async function writeIndex() {
  const batches = await collect()
  const rows = batches.map(row)
  const head =
    '| when (UTC) | preset | label | n | perf | FCP | LCP | TBT | CLS | SI | KiB | reqs | a11y | BP | SEO | release | src |'
  const rule = `|${'---|'.repeat(17)}`
  const body = rows.map(
    r =>
      `| ${r.when} | ${r.batch.preset} | ${r.batch.label} | ${r.n} | ${r.perfCell} | ${r.fcp} | ${r.lcp} | ${r.tbt} | ${r.cls} | ${r.si} | ${r.bytes} | ${r.reqs} | ${r.a11y} | ${r.bp} | ${r.seo} | ${r.batch.release ?? '?'} | ${r.batch.provenance} |`
  )
  const notes = rows
    .filter(r => r.batch.provenance === 'devtools')
    .map(r => `- \`${r.batch.files[0]}\` — DevTools export, screen emulation ${r.batch.emulated ? 'on' : 'off'}.`)

  await writeFile(
    `${outDir}index.md`,
    [
      '# Lighthouse runs',
      '',
      'Generated by `npm run lighthouse` — do not edit by hand; it is rebuilt from the JSONs in this folder.',
      '',
      "Times are the run's `fetchTime`. `perf` is the median of the batch, with the min–max spread when n > 1.",
      '`reqs`/`KiB` come from the `diagnostics` audit (not `resource-summary`, which counts fewer).',
      '',
      '`src = devtools` rows were exported by hand from the DevTools panel and are **not** comparable to',
      '`src = script` rows: DevTools measures the real window with screen emulation disabled, this script',
      "uses Lighthouse's own emulation and a throwaway Chrome profile. Compare within a provenance.",
      '',
      head,
      rule,
      ...body,
      '',
      ...(notes.length ? ['## Provenance notes', '', ...notes, ''] : [])
    ].join('\n')
  )
  return rows
}

if (argv.summary) {
  const rows = await writeIndex()
  console.log(`index.md rebuilt from ${rows.length} batch(es) in ${outDir}`)
  process.exit(0)
}

await mkdir(outDir, { recursive: true })

const chrome = await chromeLauncher.launch({
  chromeFlags: [
    ...(argv.headful ? [] : ['--headless=new']),
    // chrome-launcher already isolates the profile; this is belt and braces against a policy-installed
    // extension, which is how a "clean" run ends up with 1.8 MB of injected scripts in it.
    '--disable-extensions',
    '--no-first-run',
    '--no-default-browser-check',
    '--window-size=1350,940'
  ]
})

const batch = `${new Date().toISOString().replace(/[:.]/g, '-')}-${preset}-${label}`
const commit = git('rev-parse', '--short', 'HEAD')
const meta = {
  batch,
  preset,
  label,
  url,
  runs,
  commit,
  branch: git('rev-parse', '--abbrev-ref', 'HEAD'),
  // Whether the checkout is dirty is worth knowing when the run targets a local build; against
  // production it is noise, but cheap noise.
  dirty: git('status', '--porcelain') !== '',
  cache: 'cold',
  session: 'none',
  warmup,
  headless: !argv.headful
}

console.log(`${url}\n${preset}, ${runs} run(s) after ${warmup} warm-up, label "${label}"\n`)

const lhrs = []
try {
  for (let i = 0; i < warmup; i++) {
    await lighthouse(url, { logLevel: 'error', output: 'json', port: chrome.port }, config)
    console.log(`  warm-up ${i + 1}/${warmup} (discarded)`)
  }
  for (let i = 0; i < runs; i++) {
    const result = await lighthouse(url, { logLevel: 'error', output: 'json', port: chrome.port }, config)
    if (!result?.lhr) throw new Error(`run ${i + 1} produced no report`)
    const lhr = result.lhr
    if (lhr.runtimeError?.code) throw new Error(`run ${i + 1}: ${lhr.runtimeError.message}`)
    lhr.shopRunMeta = { ...meta, run: i + 1 }
    const file = `${lhr.fetchTime.slice(0, 19).replace(/[:]/g, '-')}Z-${preset}-${label}-r${i + 1}.json`
    await writeFile(`${outDir}${file}`, JSON.stringify(lhr))
    const s = summarize(lhr)
    console.log(
      `  run ${i + 1}/${runs}  perf ${s.perf}  FCP ${s.fcp}  LCP ${s.lcp}  TBT ${s.tbt}  SI ${s.si}  CLS ${s.cls}  → ${file}`
    )
    lhrs.push(lhr)
  }
} finally {
  await chrome.kill()
}

const rows = await writeIndex()
const median = summarize(lhrs.length > 1 ? computeMedianRun(lhrs) : lhrs[0])
const previous = rows.filter(
  r => r.batch.key !== batch && r.batch.provenance === 'script' && r.batch.preset === preset && r.batch.label === label
)
const before = previous.at(-1)

console.log(`\nmedian  ${METRICS.map(([key]) => `${key} ${median[key]}`).join('  ')}`)
if (before) {
  const delta = METRICS.map(([key]) => {
    const diff = median[key] - before[key]
    return `${key} ${diff > 0 ? '+' : ''}${Number(diff.toFixed(3))}`
  }).join('  ')
  console.log(`vs ${before.when} (${before.batch.commit ?? '?'})\n        ${delta}`)
}
console.log(`\n${outDir}index.md`)
