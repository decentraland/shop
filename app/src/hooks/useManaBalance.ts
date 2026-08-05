import { useQuery } from '@tanstack/react-query'
import type { Session } from '~/lib/auth'
import { readManaBalanceWei, readManaBalancesWei } from '~/lib/mana'

// The signed-in user's SPENDABLE MANA balance in wei — the shop's settlement chain (Polygon), which is
// the only MANA that can actually pay for a trade here. Used by the Buy Now flow to decide whether to
// OFFER paying directly with MANA (only shown when the balance is > 0). Cheap read-only RPC call,
// cached 30s like useBalance; invalidate ['mana-balance'] after a MANA purchase to refetch.
//
// Deliberately NOT the wallet's current chain. It used to pass `session.chainId`, which meant a wallet
// sitting on Ethereum resolved the L1 MANA contract but still queried it over the Polygon RPC — an
// address that is not MANA there — so the balance came back 0 and the MANA rail was hidden from users
// who did have Polygon MANA to spend. The chain that can settle is a property of the shop, not of
// wherever the wallet happens to be pointed.
export function useManaBalance(session: Session | null) {
  return useQuery({
    queryKey: ['mana-balance', session?.address],
    enabled: !!session,
    staleTime: 30_000,
    queryFn: async (): Promise<bigint> => readManaBalanceWei(session!.address)
  })
}

// MANA held across BOTH chains, for the navbar's balance display. Separate from useManaBalance because
// the two answer different questions: this one is "what does this wallet own", which spans Ethereum and
// Polygon, while the payment rails need "what can settle here", which is Polygon alone. Merging them
// would offer to pay a Polygon trade with L1 MANA.
export function useManaBalances(session: Session | null) {
  return useQuery({
    queryKey: ['mana-balances', session?.address],
    enabled: !!session,
    staleTime: 30_000,
    queryFn: async (): Promise<{ ethereum: bigint; matic: bigint }> => readManaBalancesWei(session!.address)
  })
}
