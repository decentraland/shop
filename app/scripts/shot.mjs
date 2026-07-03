import puppeteer from 'puppeteer'

const BASE = process.env.SHOP_URL ?? 'http://localhost:5173'
const OUT = new URL('../../design/screens/', import.meta.url).pathname
const routes = [
  ['overview', '/overview'],
  ['assets', '/assets'],
  ['cart', '/cart'],
  ['my-assets', '/my-assets']
]

const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] })
const page = await browser.newPage()
await page.setViewport({ width: 1440, height: 1200, deviceScaleFactor: 1 })

for (const [name, path] of routes) {
  try {
    await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle2', timeout: 45000 })
  } catch {
    // proceed to screenshot whatever rendered
  }
  await new Promise(r => setTimeout(r, 2500))
  await page.screenshot({ path: `${OUT}shot-${name}.png`, fullPage: false })
  console.log('shot', name)
}

await browser.close()
