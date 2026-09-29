import { describe, it, expect, afterEach } from 'vitest'
import { launchApp, type App } from './helpers/app'
import { bodyText, waitForText } from './helpers/dom'
import { COLLECTION } from './fixtures'

/**
 * The personalised rail on an item page.
 *
 * Two things make it different from the home page's: it must never offer back the item being looked at,
 * and it replaces the page's own collection cascade rather than stacking on top of it.
 */
let app: App | undefined
afterEach(async () => {
  await app?.close()
  app = undefined
})

describe('suggested for you on the item page', () => {
  it('asks the server to leave the anchor item out, exactly once', async () => {
    app = await launchApp({ suggestedForYou: true, path: `/item/${COLLECTION}/1` })
    const { page } = app
    const asked: string[] = []
    page.on('request', r => {
      if (r.url().includes('/v3/catalog/suggested')) asked.push(r.url())
    })
    await waitForText(page, 'Nebula Jacket')
    // The first request left before the listener existed, so ask again with it attached.
    await page.reload({ waitUntil: 'networkidle2' })
    await page.waitForSelector('[data-testid="suggested-row"]', { timeout: 15000 })

    expect(asked.length).toBeGreaterThan(0)
    const exclude = new URL(asked[asked.length - 1]).searchParams.get('exclude')
    expect(exclude).toBe(`${COLLECTION.toLowerCase()}-1`)

    // ONE distinct question, not two. The page asks in order to decide whether its own cascade is still
    // wanted and the rail asks in order to render; they share a react-query key, so they share the
    // request. If the two ever drift apart — a different `exclude`, a different size — this doubles the
    // load on the most expensive endpoint the Shop has, silently.
    expect(new Set(asked).size).toBe(1)
  })

  it('carries its own title, not the home page wording', async () => {
    app = await launchApp({ suggestedForYou: true, path: `/item/${COLLECTION}/1` })
    const { page } = app
    await waitForText(page, 'Nebula Jacket')
    await page.waitForSelector('[data-testid="suggested-row"]', { timeout: 15000 })
    expect(await bodyText(page)).toContain('Because of what you own')
  })

  it('stands in for the collection cascade rather than stacking a second carousel on it', async () => {
    app = await launchApp({ suggestedForYou: true, path: `/item/${COLLECTION}/1` })
    const { page } = app
    await waitForText(page, 'Nebula Jacket')
    await page.waitForSelector('[data-testid="suggested-row"]', { timeout: 15000 })

    expect(await page.$('[data-testid="carousel"]')).toBeNull()
  })

  it('falls back to the collection cascade when the server has nothing personal to say', async () => {
    app = await launchApp({ suggestedForYou: true, suggested: { personalized: false }, path: `/item/${COLLECTION}/1` })
    const { page } = app
    await waitForText(page, 'Nebula Jacket')
    // The page's own rail is what a reader with no personal answer should still get.
    await page.waitForSelector('[data-testid="carousel"]', { timeout: 15000 })
    expect(await page.$('[data-testid="suggested-row"]')).toBeNull()
  })

  it('shows neither rail twice when the feature is off', async () => {
    app = await launchApp({ suggestedForYou: false, path: `/item/${COLLECTION}/1` })
    const { page } = app
    await waitForText(page, 'Nebula Jacket')
    await page.waitForSelector('[data-testid="carousel"]', { timeout: 15000 })
    expect(await page.$('[data-testid="suggested-row"]')).toBeNull()
  })
})
