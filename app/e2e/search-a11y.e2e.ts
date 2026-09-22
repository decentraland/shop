import { describe, it, expect, afterEach } from 'vitest'
import { launchApp, type App } from './helpers/app'
import { axeViolations, describeViolations } from './helpers/axe'

let app: App | undefined
afterEach(async () => {
  await app?.close()
  app = undefined
})

const SEARCH = 'input[aria-label="Search the shop"]'
// The combobox and its panel: what the search box adds to the page, and nothing that was there before it.
const SCOPE = [SEARCH, '[data-testid="search-pop"]']

async function expectNoViolations(page: App['page'], state: string) {
  const violations = await axeViolations(page, SCOPE)
  expect(violations, `${state}:\n${describeViolations(violations)}`).toEqual([])
}

/**
 * axe-core over every state of the search box, with the keyboard relation checked alongside: an
 * automated pass says nothing about how a screen reader reads it, but it does catch a dangling
 * reference, a control without a name, or an option outside a listbox.
 */
describe('search box accessibility', () => {
  it('has no axe violations with results, with recent and popular searches, when empty, on an error and with a facet alone', async () => {
    app = await launchApp({ path: '/overview', fixtures: { suggestFailures: 2 } })
    const { page } = app

    await page.waitForSelector(SEARCH)
    // closed
    await expectNoViolations(page, 'closed')

    // recent and popular searches (a recent one first, so the removal controls are there too)
    await page.type(SEARCH, 'Nebula')
    await page.keyboard.press('Enter')
    await page.waitForFunction(() => /q=Nebula/.test(location.search))
    await page.click('[data-testid="subnav-search-clear"]')
    await page.waitForSelector('[data-testid="search-recent-row"]')
    await page.waitForSelector('[data-testid="search-popular-row"]')
    await expectNoViolations(page, 'recent and popular')

    // an error, with its retry outside the listbox, then the recovery through it
    await page.type(SEARCH, 'Galaxy')
    await page.waitForSelector('[data-testid="search-error"]')
    await expectNoViolations(page, 'error')
    await page.click('[data-testid="search-retry"]')
    await page.waitForSelector('[data-testid="search-pop-row"][data-kind="creator"]')

    // results, with a row active under the keyboard (the retry button took the focus and went away with
    // the error, so the box is focused again first)
    await page.focus(SEARCH)
    await page.keyboard.press('ArrowDown')
    await page.waitForSelector('[role="option"][aria-selected="true"]')
    expect(await page.$eval(SEARCH, el => el.getAttribute('aria-activedescendant'))).toMatch(/^search-row-item-/)
    await expectNoViolations(page, 'results with an active row')

    // a valid empty answer
    await page.$eval(SEARCH, el => el.select())
    await page.type(SEARCH, 'zzzz')
    await page.waitForFunction(() =>
      document.querySelector('[data-testid="search-pop"]')?.textContent?.includes('No results')
    )
    expect(await page.$eval(SEARCH, el => el.getAttribute('aria-controls'))).toBe('search-suggestions')
    expect(await page.$('#search-suggestions')).not.toBeNull()
    await expectNoViolations(page, 'no results')

    // a facet alone: the query names a category the fixtures hold nothing for
    await page.$eval(SEARCH, el => el.select())
    await page.type(SEARCH, 'zapatillas')
    await page.waitForSelector('[data-testid="search-pop-row"][data-kind="facet"]')
    await page.waitForFunction(() =>
      document.querySelector('[data-testid="search-pop"]')?.textContent?.includes('No items, collections or creators')
    )
    await expectNoViolations(page, 'facet only')
  })
})
