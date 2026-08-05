/** What a wallet actually returns from `eth_chainId`: a hex quantity, not a decimal number. */
export const hexChain = (id: number) => `0x${id.toString(16)}`
