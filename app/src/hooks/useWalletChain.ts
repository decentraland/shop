import { useCallback, useEffect, useMemo, useState } from 'react'
// Deep imports: @dcl/schemas' root barrel re-exports `getChainName` but NOT `getNetwork` /
// `getNetworkMapping`, so the chain helpers have to come from the module itself (same convention the
// preview helpers already use). Vite bundles all of @dcl/schemas into one chunk either way.
import { ChainId, getChainName, getNetwork, getNetworkMapping } from '@dcl/schemas/dist/dapps/chain-id'
import { Network } from '@dcl/schemas/dist/dapps/network'
import { ethers } from 'ethers'
// One home for both: lib/network owns the live chain read and the Amoy add-params, so the navbar and the
// gas-paying legs cannot disagree about what chain the wallet is on or how Amoy is added.
import { activeChainId as readChainId, AMOY_ADD_PARAMS } from '~/lib/network'
import { config } from '~/config'
import type { Session } from '~/lib/auth'
import { captureError } from '~/lib/monitoring'

/**
 * Which network the wallet is on, and moving it — only ever when the user asked.
 *
 * The shop never showed this. A wallet parked on Ethereum while the shop runs on Polygon produced a
 * wallet error that named a contract rather than the network, so the only way to find out was to open the
 * marketplace, read its selector, come back, and guess. This hook is the read half of that gap; the
 * NetworkSelector is the visible half.
 *
 * ⚠️ `switchTo` MUST be called from inside a user gesture (the click on an option). Wallets only honour
 * `wallet_*` requests they can attribute to a user action — fired from an effect or a retry, the same
 * request comes back `-32006 Unauthorized`, which ethers then reports as a revert without a reason. So
 * nothing here switches on its own: no auto-correct on mount, no retry after a rejection.
 */

// EIP-1193 event surface of the underlying wallet — the same shape useAccountWatcher subscribes to.
type Eip1193 = {
  on?: (event: string, cb: (...args: unknown[]) => void) => void
  removeListener?: (event: string, cb: (...args: unknown[]) => void) => void
}

// Amoy ships in almost no wallet by default, so switching to it can need an add (EIP-3085) first.
// These params are DUPLICATED from lib/authorizations.ts on purpose: importing that module here would
// pull the whole ERC20/ERC721/meta-tx authorization layer (and its config + ethers contract graph) into
// the navbar's chunk, which is on every page. Four literals are the cheaper dependency. If they ever
// need to change, change them in both places.

/** The wallet declined the request. Not an error to recover from — the user answered. */
const USER_REJECTED = 4001
/** The wallet does not know this chain yet and wants an `wallet_addEthereumChain` first. */
const UNKNOWN_CHAIN = 4902

/**
 * Chain ids are handled as plain numbers throughout, and widened here at the one boundary where they
 * come out of @dcl/schemas as `ChainId`.
 *
 * A wallet reports its chain over JSON-RPC as an arbitrary integer, so a `ChainId` for it would be a
 * claim we cannot back — and comparing that claim against the enum is exactly what
 * `no-unsafe-enum-comparison` is there to stop. Widening once keeps every comparison below honest.
 */
const AMOY_CHAIN_ID: number = ChainId.MATIC_AMOY
const KNOWN_CHAINS = Object.values(ChainId).filter((id): id is ChainId => typeof id === 'number')

/** Human name for a chain — "Polygon", "Ethereum Mainnet", "Amoy". Falls back to the id. */
export function chainLabel(chainId: number): string {
  return getChainName(chainId) ?? `Chain ${chainId}`
}

/**
 * The networks this deployment can actually transact on, newest-first: the shop's own chain, then its
 * Ethereum counterpart.
 *
 * DERIVED, not listed. `config.chainId` is the Polygon-side chain of the environment (137 on prod and
 * staging, 80002 on dev/.zone), and @dcl/schemas already carries the table pairing each Ethereum chain
 * with its Polygon one — so the sibling is found by asking which Ethereum chain maps to ours rather than
 * by hardcoding `[137, 1]` here. A hardcoded pair is how dev ends up offering Ethereum mainnet.
 *
 * Polygon first because that is where practically everything in the shop lives; Ethereum is there for
 * L1-only business (NAMEs, and MANA held on L1).
 */
export function supportedChains(configuredChainId: number = config.chainId): number[] {
  const own = configuredChainId
  const counterpart: number | undefined = KNOWN_CHAINS.find(id => {
    try {
      return getNetwork(id) === Network.ETHEREUM && Number(getNetworkMapping(id)[Network.MATIC]) === own
    } catch {
      // An id @dcl/schemas has no mapping for — not a candidate.
      return false
    }
  })
  return counterpart !== undefined && counterpart !== own ? [own, counterpart] : [own]
}

export type WalletChain = {
  /** The wallet's current chain, or undefined until the first read resolves. */
  chainId?: number
  /** Networks offered for this deployment. */
  chains: number[]
  /** The chain a switch is currently awaiting confirmation for, if any. */
  pendingChainId?: number
  /** Request a switch. Call ONLY from a user gesture. Resolves once the wallet answers either way. */
  switchTo: (chainId: number) => Promise<void>
}

export function useWalletChain(session: Session | null): WalletChain {
  const [chainId, setChainId] = useState<number | undefined>(session?.chainId)
  const [pendingChainId, setPendingChainId] = useState<number | undefined>()
  const chains = useMemo(() => supportedChains(), [])
  const web3Provider = session?.web3Provider

  // First read, then follow the wallet's own events. No interval: `chainChanged` is exactly the signal
  // we would be polling for, and a poll on the navbar runs on every page for the whole session.
  // `accountsChanged` is in here too because a different account can be on a different chain, and the
  // wallet does not re-announce the chain when the account changes.
  useEffect(() => {
    if (!web3Provider) {
      setChainId(undefined)
      return
    }

    let live = true
    const refresh = () => {
      void readChainId(web3Provider)
        .then(next => {
          if (live) setChainId(next)
        })
        .catch(e => {
          // A wallet that will not answer leaves the label on its last known value rather than blanking
          // it — a missing read is not evidence of a different chain.
          captureError(e, { flow: 'network-selector', step: 'read-chain' })
        })
    }
    refresh()

    const wallet = web3Provider.provider as Eip1193 | undefined
    if (!wallet?.on || !wallet.removeListener) return () => void (live = false)

    // The event carries the new chain as a hex string, but it is re-read from the provider anyway: the
    // payload shape varies between wallets, and the provider is the thing every other call goes through.
    const onChainChanged = () => {
      setPendingChainId(undefined)
      refresh()
    }
    wallet.on('chainChanged', onChainChanged)
    wallet.on('accountsChanged', onChainChanged)
    return () => {
      live = false
      wallet.removeListener?.('chainChanged', onChainChanged)
      wallet.removeListener?.('accountsChanged', onChainChanged)
    }
  }, [web3Provider])

  const switchTo = useCallback(
    async (target: number) => {
      // One request in flight at a time. Wallets serialise these anyway, so the end state was already
      // correct — but two clicks in quick succession would move `pendingChainId` to the second target and
      // make the first request's reply look like it answered the second.
      if (!web3Provider || target === chainId || pendingChainId !== undefined) return
      setPendingChainId(target)
      try {
        try {
          await web3Provider.send('wallet_switchEthereumChain', [{ chainId: ethers.utils.hexValue(target) }])
        } catch (e) {
          // Only Amoy gets the add: offering to ADD any chain the wallet does not recognise would let a
          // misconfigured environment teach someone's wallet about a network we made up.
          if ((e as { code?: number }).code === UNKNOWN_CHAIN && target === AMOY_CHAIN_ID) {
            await web3Provider.send('wallet_addEthereumChain', [AMOY_ADD_PARAMS])
          } else {
            throw e
          }
        }
        // Most wallets emit `chainChanged` and that is what moves the label. Some do not emit it for a
        // switch they consider a no-op, so confirm once here — one read after the user's own click, not
        // a loop.
        const settled = await readChainId(web3Provider)
        setChainId(settled)
      } catch (e) {
        // A declined switch is an answer: the wallet stayed where it was, so the UI must too. Anything
        // else is worth knowing about, but still leaves the label on the real chain.
        if ((e as { code?: number }).code !== USER_REJECTED) {
          captureError(e, { flow: 'network-selector', step: 'switch-chain', target })
        }
      } finally {
        setPendingChainId(undefined)
      }
    },
    [web3Provider, chainId, pendingChainId]
  )

  return { chainId, chains, pendingChainId, switchTo }
}
