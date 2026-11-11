import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('~/config', () => ({ config: { chainId: 137 } }))
const launchDesktopApp = vi.fn()
vi.mock('decentraland-ui2/dist/modules/jumpIn', () => ({
  launchDesktopApp: (...args: unknown[]) => launchDesktopApp(...args)
}))

import { jumpIn, jumpUrl } from '~/lib/jump'

function setTouch(touch: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('coarse') ? touch : false }))
}

let open: ReturnType<typeof vi.fn>

beforeEach(() => {
  launchDesktopApp.mockReset()
  open = vi.fn(() => ({}))
  vi.stubGlobal('open', open)
  setTouch(false)
})

afterEach(() => vi.unstubAllGlobals())

describe('when building the jump page link for a spot', () => {
  it('should carry a parcel and a World, and drop a Genesis City realm', () => {
    expect(jumpUrl({ position: '-3,12', realm: 'main' })).toBe('https://decentraland.org/jump?position=-3%2C12')
    expect(jumpUrl({ position: '0,0', realm: 'club.dcl.eth' })).toBe(
      'https://decentraland.org/jump?position=0%2C0&realm=club.dcl.eth'
    )
  })

  it('and the position is not a parcel it should leave it out', () => {
    expect(jumpUrl({ position: '1,2&x=y' })).toBe('https://decentraland.org/jump')
  })
})

describe('when jumping into a spot', () => {
  it('and the desktop client opens it should not open the jump page too', async () => {
    launchDesktopApp.mockResolvedValue(true)

    await expect(jumpIn({ position: '4,5', realm: 'main' })).resolves.toBe('client')

    expect(launchDesktopApp).toHaveBeenCalledWith({ position: '4,5', realm: undefined })
    expect(open).not.toHaveBeenCalled()
  })

  it('and the client is not installed it should fall back to the jump page', async () => {
    launchDesktopApp.mockResolvedValue(false)

    await expect(jumpIn({ position: '4,5' })).resolves.toBe('jump_page')

    expect(open).toHaveBeenCalledWith('https://decentraland.org/jump?position=4%2C5', '_blank', 'noopener')
  })

  it('and it is a touch device it should go straight to the jump page, which knows the app', async () => {
    setTouch(true)

    await jumpIn({ position: '4,5' })

    expect(launchDesktopApp).not.toHaveBeenCalled()
    expect(open).toHaveBeenCalled()
  })
})
