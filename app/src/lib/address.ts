/**
 * The address that owns nothing and matches nothing.
 *
 * Used as a "select none" sentinel when a collection filter has to be PRESENT but empty: every catalogue
 * feed reads a missing filter as "no filter", so an empty one would answer with the entire catalogue. The
 * marketplace's campaign browser substitutes the same address for the same reason.
 */
export const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'

export function shortAddress(addr: string): string {
  return /^0x[a-fA-F0-9]{40}$/.test(addr) ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : addr
}
