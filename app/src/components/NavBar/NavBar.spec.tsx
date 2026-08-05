import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { ChainId } from '@dcl/schemas'

/**
 * Where the chain pill lives.
 *
 * The shop used to ship its own selector in the navbar row. It belongs in the profile panel, which is
 * where the marketplace has it — and ui2's own `UserCardPanel` renders it there once these three props are
 * passed. So what this pins is the wiring: the props reach ui2 for a wallet that has a network to choose,
 * and stay empty for one that does not.
 */

// TopNav stands in as a prop recorder — ui2's real navbar needs a MUI theme provider and pulls the whole
// avatar panel with it, none of which is what these assertions are about.
const topNavProps = vi.fn()
vi.mock('~/components/TopNav', () => ({
  TopNav: (props: Record<string, unknown>) => {
    topNavProps(props)
    return <nav data-testid="top-nav" />
  }
}))

const walletChain = vi.fn()
vi.mock('~/hooks/useWalletChain', () => ({ useWalletChain: (...a: unknown[]) => walletChain(...a) }))

let session: { address: string; providerType: string } | null = null
vi.mock('~/store/wallet', () => ({
  useWallet: (sel?: (s: unknown) => unknown) => {
    const state = { session, connecting: false, signIn: vi.fn(), disconnect: vi.fn(), restore: vi.fn() }
    return typeof sel === 'function' ? sel(state) : state
  }
}))

vi.mock('~/hooks/useProfile', () => ({ useProfile: () => ({ data: undefined, isLoading: false }) }))
vi.mock('~/hooks/useIsOutfitCreator', () => ({ useIsOutfitCreator: () => false }))
vi.mock('~/hooks/useOutfits', () => ({ useIsOutfitCreator: () => false }))
vi.mock('~/hooks/useBalance', () => ({ useBalance: () => ({ data: 0, isError: false, isLoading: false }) }))
vi.mock('~/hooks/useManaBalance', () => ({ useManaBalance: () => ({ data: undefined }) }))
vi.mock('~/store/cart', () => ({ useCart: () => 0 }))
vi.mock('~/components/CartPopover', () => ({ CartPopover: () => null }))
vi.mock('~/components/SearchDropdown', () => ({ SearchDropdown: () => null }))
vi.mock('~/components/NotificationsBell', () => ({ NotificationsBell: () => null }))
vi.mock('~/lib/analytics', () => ({ track: vi.fn() }))

import { NavBar } from './NavBar'

const CHAINS = [ChainId.ETHEREUM_MAINNET, ChainId.MATIC_MAINNET]

function renderNav() {
  return render(
    <MemoryRouter>
      <NavBar />
    </MemoryRouter>
  )
}

const lastProps = () => {
  expect(topNavProps).toHaveBeenCalled()
  return topNavProps.mock.calls.at(-1)![0]
}

describe('the navbar chain pill', () => {
  beforeEach(() => {
    topNavProps.mockClear()
    walletChain.mockReturnValue({ chainId: ChainId.MATIC_MAINNET, chains: CHAINS, switchTo: vi.fn() })
  })

  it('hands ui2 the chain props, so the pill renders inside the profile panel', () => {
    session = { address: '0xabc', providerType: 'injected' }
    renderNav()

    const props = lastProps()
    expect(props.selectedChain).toBe(ChainId.MATIC_MAINNET)
    expect(props.chains).toEqual(CHAINS)
    expect(typeof props.onSelectChain).toBe('function')
  })

  it('switches through the wallet when ui2 reports a pick', () => {
    const switchTo = vi.fn()
    walletChain.mockReturnValue({ chainId: ChainId.MATIC_MAINNET, chains: CHAINS, switchTo })
    session = { address: '0xabc', providerType: 'injected' }
    renderNav()

    ;(lastProps().onSelectChain as (c: number) => void)(ChainId.ETHEREUM_MAINNET)

    expect(switchTo).toHaveBeenCalledWith(ChainId.ETHEREUM_MAINNET)
  })

  // A managed wallet has no network to choose: every rail it touches is a relayed signature that works
  // from any chain, and network wording is what these users must never be shown.
  it('never asks a managed wallet where it is', () => {
    session = { address: '0xabc', providerType: 'magic' }
    renderNav()

    expect(walletChain).toHaveBeenCalledWith(null)
  })

  it('asks nothing when signed out', () => {
    session = null
    renderNav()

    expect(walletChain).toHaveBeenCalledWith(null)
  })
})
