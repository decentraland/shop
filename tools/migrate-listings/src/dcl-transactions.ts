import { ChainId } from '@dcl/schemas'

// Self-contained contract config — a minimal copy of the two entries the tool needs from
// decentraland-transactions.
//
// Why copied instead of imported: decentraland-transactions' package `exports` map only whitelists
// the barrel + `./crossChain`, and the barrel transitively requires the crossChain provider
// (`@0xsquid/sdk`, a PEER dependency that isn't present in a lean install). Both facts make the
// package unusable from a plain-Node CLI without pulling a heavy, unrelated dep. The tool only needs
// `{ address, name, version }` for OffChainMarketplaceV2 + MANAToken to build the EIP-712 domain and
// the received asset's contractAddress — no ABI (ethers calls use inline ABIs). Values verified
// against decentraland-transactions@3 (cjs/contracts/offChainMarketplaceV2.js, manaToken.js).
//
// If the marketplace/MANA addresses change, update this table (or restore the package import once its
// crossChain peer dep is installed).

export enum ContractName {
  OffChainMarketplaceV2 = 'OffChainMarketplaceV2',
  MANAToken = 'MANAToken',
}

export type ContractConfig = {
  address: string
  name: string
  version: string
  chainId: ChainId
}

const OFFCHAIN_MARKETPLACE_V2: Partial<Record<ChainId, ContractConfig>> = {
  [ChainId.ETHEREUM_SEPOLIA]: {
    address: '0x1b67d0e31eeb6b52d8eeed71d3616c2f5b33b8e7',
    name: 'DecentralandMarketplaceEthereum',
    version: '1.0.0',
    chainId: ChainId.ETHEREUM_SEPOLIA,
  },
  [ChainId.ETHEREUM_MAINNET]: {
    address: '0x1b67d0e31eeb6b52d8eeed71d3616c2f5b33b8e7',
    name: 'DecentralandMarketplaceEthereum',
    version: '1.0.0',
    chainId: ChainId.ETHEREUM_MAINNET,
  },
  [ChainId.MATIC_AMOY]: {
    address: '0x1b67d0e31eeb6b52d8eeed71d3616c2f5b33b8e7',
    name: 'DecentralandMarketplacePolygon',
    version: '1.0.0',
    chainId: ChainId.MATIC_AMOY,
  },
  [ChainId.MATIC_MAINNET]: {
    address: '0xa40b1d129b8906888720686f3a01921ddf37716f',
    name: 'DecentralandMarketplacePolygon',
    version: '1.0.0',
    chainId: ChainId.MATIC_MAINNET,
  },
}

const MANA_TOKEN: Partial<Record<ChainId, ContractConfig>> = {
  [ChainId.ETHEREUM_MAINNET]: {
    address: '0x0f5d2fb29fb7d3cfee444a200298f468908cc942',
    name: 'MANAToken',
    version: '1',
    chainId: ChainId.ETHEREUM_MAINNET,
  },
  [ChainId.ETHEREUM_SEPOLIA]: {
    address: '0xfa04d2e2ba9aec166c93dfeeba7427b2303befa9',
    name: 'MANAToken',
    version: '1',
    chainId: ChainId.ETHEREUM_SEPOLIA,
  },
  [ChainId.MATIC_MAINNET]: {
    address: '0xA1c57f48F0Deb89f569dFbE6E2B7f46D33606fD4',
    name: '(PoS) Decentraland MANA',
    version: '1',
    chainId: ChainId.MATIC_MAINNET,
  },
  [ChainId.MATIC_AMOY]: {
    address: '0x7ad72b9f944ea9793cf4055d88f81138cc2c63a0',
    name: 'Decentraland MANA(PoS)',
    version: '1',
    chainId: ChainId.MATIC_AMOY,
  },
}

const TABLES: Record<ContractName, Partial<Record<ChainId, ContractConfig>>> = {
  [ContractName.OffChainMarketplaceV2]: OFFCHAIN_MARKETPLACE_V2,
  [ContractName.MANAToken]: MANA_TOKEN,
}

/** Drop-in for decentraland-transactions' getContract, scoped to the two contracts this tool uses. */
export function getContract(name: ContractName, chainId: ChainId | number): ContractConfig {
  const cfg = TABLES[name]?.[chainId as ChainId]
  if (!cfg) throw new Error(`No ${name} config for chainId ${chainId}. Add it to src/dcl-transactions.ts.`)
  return cfg
}
