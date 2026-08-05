import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// The deployment's chain. 137 (prod/staging) so the derived pair is Polygon + Ethereum mainnet, which is
// what the selector is expected to offer in production.
vi.mock('~/config', () => ({ config: { chainId: 137 } }))

const captureError = vi.fn()
vi.mock('~/lib/monitoring', () => ({ captureError: (...args: unknown[]) => captureError(...args) }))

const track = vi.fn()
vi.mock('~/lib/analytics', () => ({ track: (...args: unknown[]) => track(...args) }))

type Listener = (...args: unknown[]) => void

// A wallet that answers `eth_chainId` from `chain` and records every request, so a spec can assert both
// WHAT was asked of it and how many times.
function makeWallet(chain: number) {
  const listeners: Record<string, Listener[]> = {}
  const send = vi.fn(async (method: string) => {
    if (method === 'eth_chainId') return `0x${chain.toString(16)}`
    return null
  })
  return {
    send,
    listeners,
    setChain: (next: number) => {
      chain = next
    },
    emit: (event: string) => (listeners[event] ?? []).forEach(l => l()),
    provider: {
      on: (event: string, cb: Listener) => {
        listeners[event] = [...(listeners[event] ?? []), cb]
      },
      removeListener: (event: string, cb: Listener) => {
        listeners[event] = (listeners[event] ?? []).filter(l => l !== cb)
      }
    }
  }
}

let wallet: ReturnType<typeof makeWallet>

function makeSession(providerType = 'injected') {
  return {
    address: '0xabc0000000000000000000000000000000000abc',
    chainId: 137,
    signer: {} as never,
    identity: { id: 'identity' } as never,
    providerType: providerType as never,
    web3Provider: wallet as never
  }
}

let walletState: { session: ReturnType<typeof makeSession> | null }
vi.mock('~/store/wallet', () => ({
  useWallet: (sel?: (s: typeof walletState) => unknown) => (sel ? sel(walletState) : walletState)
}))

import { NetworkSelector } from './NetworkSelector'

/** Wait for the first `eth_chainId` read to land, so the chip is on the real chain before we assert. */
async function renderSelector() {
  const view = render(<NetworkSelector />)
  await waitFor(() => expect(wallet.send).toHaveBeenCalledWith('eth_chainId', []))
  return view
}

function switchCalls() {
  return wallet.send.mock.calls.filter(([method]) => method === 'wallet_switchEthereumChain')
}

beforeEach(() => {
  vi.clearAllMocks()
  wallet = makeWallet(137)
  walletState = { session: makeSession() }
})

describe('NetworkSelector', () => {
  describe('when the wallet is self-custody and signed in', () => {
    it('should name the network the wallet is actually on', async () => {
      await renderSelector()

      const trigger = await screen.findByTestId('network-selector')
      await waitFor(() => expect(trigger).toHaveTextContent('Polygon'))
      expect(trigger).toHaveAttribute('aria-label', 'Network: Polygon')
      expect(trigger).toHaveAttribute('aria-expanded', 'false')
    })

    it('should read the chain from the wallet rather than trust the session', async () => {
      // The session was established on Polygon; the wallet has since moved to Ethereum. The chip must
      // report the wallet, because that is what a transaction will actually be submitted on.
      wallet = makeWallet(1)
      walletState = { session: makeSession() }
      await renderSelector()

      await waitFor(() => expect(screen.getByTestId('network-selector')).toHaveTextContent('Ethereum Mainnet'))
    })

    it('should still name a network the shop does not support, and offer a way off it', async () => {
      // Base (8453). The shop cannot transact there, so this is the case that used to produce a wallet
      // error naming a contract. Naming the chain is the whole point — and the menu is the way back.
      wallet = makeWallet(8453)
      walletState = { session: makeSession() }
      await renderSelector()

      const trigger = await screen.findByTestId('network-selector')
      await waitFor(() => expect(trigger).toHaveTextContent('Chain 8453'))
      await userEvent.click(trigger)

      expect(screen.getByTestId('network-option-137')).toHaveAttribute('aria-selected', 'false')
      expect(screen.getByTestId('network-option-1')).toHaveAttribute('aria-selected', 'false')
    })

    it('should offer every network this deployment supports, and only those', async () => {
      await renderSelector()
      await userEvent.click(screen.getByTestId('network-selector'))

      const menu = screen.getByRole('listbox')
      expect(menu).toHaveAccessibleName('Select a network')
      expect(screen.getByTestId('network-option-137')).toHaveTextContent('Polygon')
      expect(screen.getByTestId('network-option-1')).toHaveTextContent('Ethereum Mainnet')
      // Derived from the configured chain, so the testnets must not leak into a production build.
      expect(screen.queryByTestId('network-option-80002')).not.toBeInTheDocument()
      expect(screen.queryByTestId('network-option-11155111')).not.toBeInTheDocument()
      // The one the wallet is on is the selected option.
      expect(screen.getByTestId('network-option-137')).toHaveAttribute('aria-selected', 'true')
      expect(screen.getByTestId('network-option-1')).toHaveAttribute('aria-selected', 'false')
    })

    it('should mark the trigger expanded while the menu is open', async () => {
      await renderSelector()
      const trigger = screen.getByTestId('network-selector')

      await userEvent.click(trigger)
      expect(trigger).toHaveAttribute('aria-expanded', 'true')
      expect(screen.getByRole('listbox')).toBeInTheDocument()
    })

    it('should close on Escape and hand focus back to the trigger', async () => {
      await renderSelector()
      const trigger = screen.getByTestId('network-selector')
      await userEvent.click(trigger)

      await userEvent.keyboard('{Escape}')

      expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
      expect(trigger).toHaveAttribute('aria-expanded', 'false')
      expect(trigger).toHaveFocus()
    })

    it('should move focus between options with the arrow keys', async () => {
      await renderSelector()
      await userEvent.click(screen.getByTestId('network-selector'))

      // Opening lands on the current network; ArrowDown walks to the next one.
      await waitFor(() => expect(screen.getByTestId('network-option-137')).toHaveFocus())
      await userEvent.keyboard('{ArrowDown}')
      expect(screen.getByTestId('network-option-1')).toHaveFocus()
    })
  })

  describe('when the user picks a different network', () => {
    it('should ask the wallet to switch to that chain, once, with its hex id', async () => {
      await renderSelector()
      await userEvent.click(screen.getByTestId('network-selector'))

      await userEvent.click(screen.getByTestId('network-option-1'))

      await waitFor(() => expect(switchCalls()).toHaveLength(1))
      expect(wallet.send).toHaveBeenCalledWith('wallet_switchEthereumChain', [{ chainId: '0x1' }])
      expect(track).toHaveBeenCalledWith('Shop Network Switch Requested', { from_chain_id: 137, to_chain_id: 1 })
    })

    it('should not ask the wallet for anything when the chosen network is the current one', async () => {
      await renderSelector()
      await userEvent.click(screen.getByTestId('network-selector'))

      await userEvent.click(screen.getByTestId('network-option-137'))

      expect(switchCalls()).toHaveLength(0)
      expect(track).not.toHaveBeenCalled()
      // Still a dismissal — the menu closes.
      await waitFor(() => expect(screen.queryByRole('listbox')).not.toBeInTheDocument())
    })

    it('should never switch on its own — only the click does', async () => {
      // The wallet sits on Ethereum while the shop runs on Polygon: the exact case the old code silently
      // "corrected". Rendering must ask the wallet nothing but where it is.
      wallet = makeWallet(1)
      walletState = { session: makeSession() }
      await renderSelector()

      await waitFor(() => expect(screen.getByTestId('network-selector')).toHaveTextContent('Ethereum Mainnet'))
      expect(switchCalls()).toHaveLength(0)
      expect(wallet.send.mock.calls.every(([method]) => method === 'eth_chainId')).toBe(true)
    })
  })

  describe('and the wallet rejects the switch', () => {
    it('should leave the chip on the network the wallet is really on', async () => {
      wallet.send.mockImplementation(async (method: string) => {
        if (method === 'eth_chainId') return '0x89'
        // 4001: the user declined in the wallet. An answer, not a failure to retry around.
        throw Object.assign(new Error('User rejected the request'), { code: 4001 })
      })
      await renderSelector()
      await userEvent.click(screen.getByTestId('network-selector'))

      await userEvent.click(screen.getByTestId('network-option-1'))

      await waitFor(() => expect(screen.queryByRole('listbox')).not.toBeInTheDocument())
      expect(screen.getByTestId('network-selector')).toHaveTextContent('Polygon')
      expect(screen.getByTestId('network-selector')).toHaveAttribute('aria-label', 'Network: Polygon')
      // Declining is not an error worth reporting, and it is never retried.
      expect(captureError).not.toHaveBeenCalled()
      expect(switchCalls()).toHaveLength(1)
    })
  })

  describe('and the wallet changes network behind the app', () => {
    it('should follow chainChanged without a reload', async () => {
      await renderSelector()
      await waitFor(() => expect(screen.getByTestId('network-selector')).toHaveTextContent('Polygon'))

      wallet.setChain(1)
      await act(async () => {
        wallet.emit('chainChanged')
      })

      await waitFor(() => expect(screen.getByTestId('network-selector')).toHaveTextContent('Ethereum Mainnet'))
      expect(screen.getByTestId('network-selector')).toHaveAttribute('aria-label', 'Network: Ethereum Mainnet')
    })

    it('should re-read the chain when the account changes', async () => {
      // A different account can be sitting on a different network, and wallets do not re-announce the
      // chain along with the account.
      await renderSelector()

      wallet.setChain(1)
      await act(async () => {
        wallet.emit('accountsChanged')
      })

      await waitFor(() => expect(screen.getByTestId('network-selector')).toHaveTextContent('Ethereum Mainnet'))
    })

    it('should stop listening once unmounted', async () => {
      const { unmount } = await renderSelector()
      expect(wallet.listeners.chainChanged).toHaveLength(1)

      unmount()

      expect(wallet.listeners.chainChanged).toHaveLength(0)
      expect(wallet.listeners.accountsChanged).toHaveLength(0)
    })
  })

  describe('when the wallet is managed, or nobody is signed in', () => {
    it('should render nothing for a Magic wallet', async () => {
      walletState = { session: makeSession('magic') }

      render(<NetworkSelector />)

      expect(screen.queryByTestId('network-selector')).not.toBeInTheDocument()
      // Never even asks: a managed wallet has no network for the user to choose.
      expect(wallet.send).not.toHaveBeenCalled()
    })

    it('should render nothing for a thirdweb embedded wallet', () => {
      walletState = { session: makeSession('thirdweb') }

      render(<NetworkSelector />)

      expect(screen.queryByTestId('network-selector')).not.toBeInTheDocument()
    })

    it('should render nothing when signed out', () => {
      walletState = { session: null }

      render(<NetworkSelector />)

      expect(screen.queryByTestId('network-selector')).not.toBeInTheDocument()
    })
  })
})
