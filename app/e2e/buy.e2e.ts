import { describe, it, afterEach } from 'vitest'
import { launchApp, type App } from './helpers/app'
import { clickWhenEnabled, waitForText } from './helpers/dom'
import { COLLECTION, buyTrade } from './fixtures'

let app: App | undefined
afterEach(async () => {
  await app?.close()
  app = undefined
})

describe('buy an item with credits', () => {
  it('goes item detail → Buy now → Buy Asset modal → purchase complete', async () => {
    // Deep-link the secondary item (Nebula Jacket, itemId 1). authorize is mocked; gasless is the
    // default, so the buyer signs the useCredits meta-tx (mock wallet) and it's POSTed to the mocked
    // relayer → canned hash → the modal reaches its "complete" state.
    app = await launchApp({ path: `/item/${COLLECTION}/1`, fixtures: { trade: buyTrade } })
    const { page } = app

    await waitForText(page, 'Nebula Jacket')
    await waitForText(page, 'Buy now')

    // Open the buy modal from the PDP.
    await clickWhenEnabled(page, 'button', /buy now/i)
    await waitForText(page, 'Buy Asset')

    // Confirm in the modal (its own "Buy" button — exact, not "Buy now"). The modal opens in a loading
    // state (same "Buy Asset" title) and only renders the enabled "Buy" button once the async
    // resolve-trade → authorize step reaches its ready phase, so wait for it rather than clicking early.
    await clickWhenEnabled(page, 'button', /^buy$/i)

    // The modal runs authorize → gasless buy → settlement, then shows the success state in place.
    await waitForText(page, 'Purchase complete!', 30000)
    await waitForText(page, 'was successful')
  })
})
