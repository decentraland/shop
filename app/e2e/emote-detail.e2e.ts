import { describe, it, expect, afterEach } from 'vitest'
import { launchApp, type App } from './helpers/app'
import { waitForText } from './helpers/dom'
import { COLLECTION, CREATOR_ADDRESS } from './fixtures'

let app: App | undefined
afterEach(async () => {
  await app?.close()
  app = undefined
})

// Regression guard for the emote PDP crash: EmoteControls (decentraland-ui2) is the one emote-only
// component whose styled parts read `theme.spacing()` from emotion's context. With no ThemeProvider
// the whole detail page white-screened ("e.spacing is not a function" → ErrorBoundary). This drives
// a real browser (the only place the real ui2 EmoteControls + emotion run) to prove it renders.
const emoteListing = {
  data: [
    {
      tradeId: 'trade-emote',
      listingType: 'primary',
      contractAddress: COLLECTION,
      itemId: '2',
      tokenId: null,
      name: 'Cosmic Dance',
      thumbnail: 'https://img.test/cosmic-dance.png',
      rarity: 'rare',
      category: 'emote',
      creator: CREATOR_ADDRESS,
      priceCredits: 90,
      available: 100,
      network: 'MATIC',
      chainId: 80002
    }
  ],
  total: 1
}

describe('view an emote item detail page', () => {
  it('renders the emote PDP (with its play/scrub controls) without crashing', async () => {
    app = await launchApp({ path: `/item/${COLLECTION}/2`, fixtures: { shopListings: emoteListing } })
    const { page } = app

    // The page resolves the emote and paints its header + buy CTA (no ErrorBoundary fallback).
    await waitForText(page, 'Cosmic Dance')
    await waitForText(page, 'Buy now')

    // The ErrorBoundary fallback must NOT be on the page.
    const crashed = await page.evaluate(() => /something went wrong/i.test(document.body.innerText))
    expect(crashed).toBe(false)

    // The emote-only controls region (which hosts the ui2 EmoteControls) mounted successfully — i.e.
    // the theme.spacing()-dependent styled components rendered instead of throwing.
    await page.waitForSelector('[data-testid="emote-controls"]', { timeout: 20000 })
    const hasControls = await page.$('[data-testid="emote-controls"]')
    expect(hasControls).not.toBeNull()

    // The playback bar reads as a proper bar (not the collapsed empty pill the ui2 default produced):
    // its play/pause button and scrub slider are present. The button/slider are rendered by the ui2
    // EmoteControls, so target them by tag/type under our testid'd container (no class selectors).
    await page.waitForSelector('[data-testid="emote-controls"] button', { timeout: 20000 })
    const playButton = await page.$('[data-testid="emote-controls"] button')
    expect(playButton).not.toBeNull()
    const scrubber = await page.$('[data-testid="emote-controls"] input[type="range"]')
    expect(scrubber).not.toBeNull()

    // The bar sits at the bottom of the preview, stays within it horizontally, and has real width —
    // proving the ui2 container's position:absolute overlay layout was neutralized (a collapsed bar
    // would be a near-zero-width empty pill). Loose bounds only; no exact-pixel assertions.
    const layout = await page.evaluate(() => {
      const preview = document.querySelector('[data-testid="item-preview"]') as HTMLElement
      const bar = document.querySelector('[data-testid="emote-controls"]') as HTMLElement
      const p = preview.getBoundingClientRect()
      const b = bar.getBoundingClientRect()
      return {
        barWidth: b.width,
        withinX: b.left >= p.left && b.right <= p.right,
        inLowerHalf: b.top > p.top + p.height / 2,
        aboveBottom: b.bottom <= p.bottom
      }
    })
    expect(layout.barWidth).toBeGreaterThan(150)
    expect(layout.withinX).toBe(true)
    expect(layout.inLowerHalf).toBe(true)
    expect(layout.aboveBottom).toBe(true)
  })
})
