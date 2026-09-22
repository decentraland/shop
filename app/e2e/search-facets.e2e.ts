import { describe, it, expect, afterEach } from 'vitest'
import { launchApp, type App } from './helpers/app'

let app: App | undefined
afterEach(async () => {
  await app?.close()
  app = undefined
})

const SEARCH = 'input[aria-label="Search the shop"]'
const FACET = '[data-testid="search-pop-row"][data-kind="facet"]'

// A wait that names itself and where the page was when it gave up, so a CI timeout says which step.
// Evaluated INSIDE the page (it must not close over anything here): the sidebar row with this label is
// active AND every accordion above it is open. The accordions fold with grid-template-rows: 0fr, so a
// folded row is still in the DOM and presence alone proves nothing.
const UNFOLDED = ([label]: string[]): boolean => {
  const row = Array.from(document.querySelectorAll('[data-sub][data-active]')).find(
    el => el.textContent?.trim() === label
  )
  if (!row) return false
  const accordions: Element[] = []
  for (let el = row.parentElement; el; el = el.parentElement) if (el.hasAttribute('data-subs')) accordions.push(el)
  return accordions.length > 0 && accordions.every(el => el.hasAttribute('data-open'))
}

async function until(page: App['page'], name: string, fn: (arg: string[]) => boolean, arg: string[] = []) {
  try {
    await page.waitForFunction(fn, {}, arg)
  } catch (error) {
    const href = await page.evaluate(() => location.href).catch(() => '?')
    if (error instanceof Error) error.message = `${name} (at ${href}): ${error.message}`
    throw error
  }
}

/**
 * A query that names a category or a rarity gets a way into it, next to its text matches: the same
 * destination the sidebar gives, built from the facet alone. It is an offer, never applied on its own:
 * Enter with no row active is still the text search.
 */
describe('search facets', () => {
  it('offers the category the query names first under the keyboard, and lands on its grid', async () => {
    // From the grid itself, so the landing is a filter change and not the results page's first, cold
    // compile, which under a full e2e run has outlived the wait.
    app = await launchApp({ path: '/items' })
    const { page } = app
    const seen: string[] = []
    page.on('request', req => seen.push(req.url()))

    await page.waitForSelector(SEARCH)
    await page.type(SEARCH, 'hat')
    await page.waitForSelector(FACET)
    await page.waitForSelector('[data-testid="search-pop-row"][data-kind="item"]')

    // first option of the listbox, and the first the arrow lands on; recognised locally
    expect(await page.$eval('[role="option"]', el => el.getAttribute('data-kind'))).toBe('facet')
    expect(await page.$eval(FACET, el => el.getAttribute('data-facet'))).toBe('category:Hat')
    expect(seen.filter(url => url.includes('/v3/catalog/suggest?')).length).toBe(1)
    await page.keyboard.press('ArrowDown')
    expect(await page.$eval(SEARCH, el => el.getAttribute('aria-activedescendant'))).toMatch(/^search-row-facet-/)

    await page.keyboard.press('Enter')
    await until(
      page,
      'landing URL',
      () => location.pathname === '/items' && location.search === '?category=wearable&subCategory=Hat'
    )
    // the sidebar marks the category (a category has no chip by design; rarities do), the grid asks for
    // it, and the box is empty
    await until(page, 'sidebar shows Hat active and unfolded', UNFOLDED, ['Hat'])
    await until(
      page,
      'grid request carries wearableCategory=hat',
      urls => urls.some(url => url.includes('wearableCategory=hat')),
      seen
    )
    expect(await page.$eval(SEARCH, el => el.value)).toBe('')
  })

  it('runs the text search on Enter while no row is active, facet or not', async () => {
    app = await launchApp({ path: '/overview' })
    const { page } = app

    await page.waitForSelector(SEARCH)
    await page.type(SEARCH, 'hat')
    await page.waitForSelector(FACET)
    await page.keyboard.press('Enter')

    await page.waitForFunction(() => location.pathname === '/items' && /q=hat/.test(location.search))
    expect(await page.evaluate(() => location.search)).not.toMatch(/subCategory/)
  })

  it('gives a phrase that merely ends in a category word no facet', async () => {
    app = await launchApp({ path: '/overview' })
    const { page } = app

    await page.waitForSelector(SEARCH)
    await page.type(SEARCH, 'pirate hat')
    await page.waitForSelector('[data-testid="search-pop"]')
    await page.waitForFunction(
      () =>
        document.querySelector('[data-testid="search-pop-row"]') ||
        document.querySelector('[data-testid="search-pop"]')?.textContent?.includes('No results')
    )
    expect(await page.$(FACET)).toBeNull()
  })

  it('lands on the rarity filter for a rarity name, and on an emote category for its name', async () => {
    // From the grid, as above: the first cold compile of the results page is not what this measures.
    app = await launchApp({ path: '/items' })
    const { page } = app
    const seen: string[] = []
    page.on('request', req => seen.push(req.url()))

    await page.waitForSelector(SEARCH)
    await page.type(SEARCH, 'epic')
    await page.waitForSelector(FACET)
    expect(await page.$eval(FACET, el => el.getAttribute('data-facet'))).toBe('rarity:epic')
    await page.click(FACET)
    await until(page, 'rarity URL', () => location.search === '?rarities=epic')
    await until(
      page,
      'rarity chip',
      () => !!document.querySelector('[data-testid="filter-chips"]')?.textContent?.includes('Epic')
    )
    await until(page, 'grid request carries rarity=epic', urls => urls.some(url => url.includes('rarity=epic')), seen)

    // the box emptied with the landing; the next query is its own
    expect(await page.$eval(SEARCH, el => el.value)).toBe('')
    await page.type(SEARCH, 'dance')
    await page.waitForSelector('[data-facet="category:Dance"]')
    await page.click('[data-facet="category:Dance"]')
    await until(page, 'emote URL', () => location.search === '?category=emote&subCategory=Dance')
    // the sidebar was already mounted: it still opens Emotes and marks the row
    await until(page, 'sidebar shows Dance active and unfolded', UNFOLDED, ['Dance'])
    // from the facet alone: the rarity the reader came from is not carried over
    expect(await page.evaluate(() => location.search)).not.toMatch(/rarities/)
  })

  it('unfolds the sidebar again when Back returns to a category, without a remount', async () => {
    app = await launchApp({ path: '/items?category=wearable&subCategory=Hat' })
    const { page } = app

    await page.waitForSelector(SEARCH)
    await until(page, 'Hat unfolded on load', UNFOLDED, ['Hat'])
    await page.type(SEARCH, 'dance')
    await page.waitForSelector('[data-facet="category:Dance"]')
    await page.click('[data-facet="category:Dance"]')
    await until(page, 'emote URL', () => location.search === '?category=emote&subCategory=Dance')
    await until(page, 'Dance unfolded', UNFOLDED, ['Dance'])

    await page.goBack()
    await until(page, 'back to Hat', () => location.search === '?category=wearable&subCategory=Hat')
    await until(page, 'Hat unfolded again after Back', UNFOLDED, ['Hat'])
  })

  it('keeps the facet on offer when nothing else matches, and says what is missing', async () => {
    app = await launchApp({ path: '/overview' })
    const { page } = app

    await page.waitForSelector(SEARCH)
    await page.type(SEARCH, 'zapatillas')
    await page.waitForSelector(FACET)
    await page.waitForFunction(() =>
      document.querySelector('[data-testid="search-pop"]')?.textContent?.includes('No items, collections or creators')
    )
    expect(await page.$eval(FACET, el => el.getAttribute('data-facet'))).toBe('category:Feet')
    expect(await page.$('[data-testid="search-pop-row"][data-kind="item"]')).toBeNull()
  })

  it('keeps the facet row inside a phone viewport', async () => {
    app = await launchApp({ path: '/overview' })
    const { page } = app
    await page.setViewport({ width: 375, height: 740 })

    await page.waitForSelector(SEARCH)
    await page.type(SEARCH, 'hat')
    await page.waitForSelector(FACET)
    const box = await page.$eval(FACET, el => {
      const r = el.getBoundingClientRect()
      return { left: r.left, right: r.right, height: r.height }
    })
    expect(box.left).toBeGreaterThanOrEqual(0)
    expect(box.right).toBeLessThanOrEqual(375)
    expect(box.height).toBeGreaterThanOrEqual(44)
  })
})
