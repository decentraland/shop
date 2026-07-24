// DCL collection (ERC721CollectionV2) token-id packing. Verified against wearables-contracts
// ERC721CollectionV2.sol: ITEM_ID_BITS = 40, ISSUED_ID_BITS = 216, and
//   tokenId = (itemId << 216) | issuedId
// So the itemId can ALWAYS be recovered from a tokenId (itemId = tokenId >> 216), but a bare number is
// NOT self-describing: item 0's tokens have small tokenIds (= issuedId) that collide with real itemIds.
// That's why the app uses SEPARATE routes (/item/:itemId vs /token/:tokenId) instead of guessing which
// one a number is. Values are arbitrary-precision (a tokenId is up to 256 bits), so everything is BigInt
// and the public API takes/returns decimal strings.

const ISSUED_ID_BITS = 216n
const ISSUED_ID_MASK = (1n << ISSUED_ID_BITS) - 1n

export type DecodedTokenId = {
  /** The item this token is a copy of (decimal string). */
  itemId: string
  /** The token's mint index within the item, i.e. "#N" (decimal string). */
  issuedId: string
}

/**
 * Decode a collection tokenId into its (itemId, issuedId) parts. Throws on a non-integer / negative
 * input so a malformed route param fails loudly rather than silently resolving the wrong item.
 */
export function decodeTokenId(tokenId: string | bigint): DecodedTokenId {
  const n = typeof tokenId === 'bigint' ? tokenId : BigInt(tokenId.trim())
  if (n < 0n) throw new Error(`Invalid tokenId: ${String(tokenId)}`)
  return {
    itemId: (n >> ISSUED_ID_BITS).toString(),
    issuedId: (n & ISSUED_ID_MASK).toString()
  }
}

/** Inverse of decodeTokenId: pack (itemId, issuedId) back into a tokenId (decimal string). */
export function encodeTokenId(itemId: string | bigint, issuedId: string | bigint): string {
  const item = typeof itemId === 'bigint' ? itemId : BigInt(String(itemId).trim())
  const issued = typeof issuedId === 'bigint' ? issuedId : BigInt(String(issuedId).trim())
  if (item < 0n || issued < 0n) throw new Error('Invalid itemId/issuedId')
  return ((item << ISSUED_ID_BITS) | issued).toString()
}

/** Best-effort itemId from a tokenId — returns null instead of throwing on a malformed value. */
export function itemIdFromTokenId(tokenId: string | null | undefined): string | null {
  if (!tokenId) return null
  try {
    return decodeTokenId(tokenId).itemId
  } catch {
    return null
  }
}
