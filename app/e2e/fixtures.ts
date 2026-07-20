// Canned data for the e2e mocks. The test user address is derived from the fixed test key in
// helpers/session.ts (ethers.Wallet('0x11..').address).
export const TEST_ADDRESS = '0x19e7e376e7c213b7e7e7e46cc70a5dd086daff2a'
export const COLLECTION = '0xc0113c1100000000000000000000000000000001'
// A creator that is NOT the signed-in test wallet — browse/detail listings are other people's items,
// so the self-purchase guard (own primary → can't add to cart) doesn't fire on the buy-flow e2e.
export const CREATOR_ADDRESS = '0x' + 'cc'.repeat(20)
export const MANA_WEI_PER = '100000000000000000000' // 100 MANA (→ ~$27 → 270 credits)

// --- Builder (creator's publishable collection items → "Your creations") ---
export const builderCollections = {
  data: [
    {
      id: 'col-1',
      name: 'Galaxy Drip',
      eth_address: TEST_ADDRESS,
      contract_address: COLLECTION,
      is_published: true,
      is_approved: true,
      minters: []
    }
  ]
}
export const builderItems = {
  data: [
    {
      id: 'item-1',
      collection_id: 'col-1',
      contract_address: COLLECTION,
      blockchain_item_id: '0',
      name: 'Galaxy Hat',
      thumbnail: 'thumbnail.png',
      contents: { 'thumbnail.png': 'bafybeigalaxyhatthumbnailfakehashxxxxxxxxxxxxxxxxxx' },
      is_published: true,
      is_approved: true,
      total_supply: 0,
      rarity: 'epic',
      type: 'wearable',
      data: { wearable: { category: 'hat' } }
    }
  ]
}

// --- Owned NFTs (secondary → "Items you own"), /v1/nfts?owner= shape ---
export const ownedNfts = {
  data: [
    {
      nft: {
        id: `${COLLECTION}-42`,
        contractAddress: COLLECTION,
        tokenId: '42',
        itemId: '0',
        name: 'Galaxy Hat #42',
        category: 'wearable',
        image: 'https://peer.decentraland.zone/lambdas/collections/contents/urn:x/thumbnail',
        network: 'MATIC',
        chainId: 80002,
        data: { wearable: { rarity: 'epic' } }
      },
      order: null
    }
  ],
  total: 1
}

// --- Owned NFT that is ALREADY on sale (secondary) → "Remove listing" path ---
// Same token as `ownedNfts`, but with an open `order` carrying a `tradeId` + USD-pegged price.
// fetchMyAssets maps `order != null` → isOnSale, and `order.tradeId` → the trade to cancel. A spec
// opts in by passing this as `ownedNfts` (plus `trade: buyTrade`, whose id matches the order's).
// USD wei ($13.50, 1e18 = $1) → 135 credits shown in the "On sale" badge.
export const ownedNftsOnSale = {
  data: [
    {
      nft: {
        id: `${COLLECTION}-42`,
        contractAddress: COLLECTION,
        tokenId: '42',
        itemId: '0',
        name: 'Galaxy Hat #42',
        category: 'wearable',
        image: 'https://peer.decentraland.zone/lambdas/collections/contents/urn:x/thumbnail',
        network: 'MATIC',
        chainId: 80002,
        data: { wearable: { rarity: 'epic' } }
      },
      order: { price: '13500000000000000000', tradeId: 'trade-2' }
    }
  ],
  total: 1
}

// --- Importable (old classic MANA listings → /v3/catalog/importable) ---
export const importable = {
  data: [
    {
      oldTradeId: 'old-trade-primary-1',
      listingType: 'primary',
      contractAddress: COLLECTION,
      itemId: '0',
      tokenId: null,
      name: 'Galaxy Hat',
      thumbnail: '',
      rarity: 'epic',
      category: 'wearable',
      wearableCategory: 'hat',
      manaWei: MANA_WEI_PER,
      available: 100,
      network: 'MATIC',
      chainId: 80002
    },
    {
      oldTradeId: 'old-trade-secondary-1',
      listingType: 'secondary',
      contractAddress: COLLECTION,
      itemId: '1',
      tokenId: '7',
      name: 'Nebula Jacket',
      thumbnail: '',
      rarity: 'legendary',
      category: 'wearable',
      wearableCategory: 'upper_body',
      manaWei: '50000000000000000000', // 50 MANA
      available: 1,
      network: 'MATIC',
      chainId: 80002
    }
  ]
}

// --- Shop feed (v3/catalog/shop → browse grid) ---
export const shopListings = {
  data: [
    {
      tradeId: 'trade-1',
      listingType: 'primary',
      contractAddress: COLLECTION,
      itemId: '0',
      tokenId: null,
      name: 'Galaxy Hat',
      thumbnail: 'https://img.test/galaxy-hat.png',
      rarity: 'epic',
      category: 'wearable',
      wearableCategory: 'hat',
      creator: CREATOR_ADDRESS,
      priceCredits: 270,
      available: 100,
      network: 'MATIC',
      chainId: 80002
    },
    {
      tradeId: 'trade-2',
      listingType: 'secondary',
      contractAddress: COLLECTION,
      itemId: '1',
      tokenId: '7',
      name: 'Nebula Jacket',
      thumbnail: '',
      rarity: 'legendary',
      category: 'wearable',
      wearableCategory: 'upper_body',
      creator: CREATOR_ADDRESS,
      priceCredits: 135,
      available: 1,
      network: 'MATIC',
      chainId: 80002,
      isSmart: true
    }
  ],
  total: 2
}

// --- Collections search (/v1/collections?search=) → search dropdown "Collections" section ---
// The dropdown also derives its "Creators" section from these collections' `creator` addresses.
export const collections = {
  data: [{ contractAddress: COLLECTION, name: 'Galaxy Collection', creator: CREATOR_ADDRESS }],
  total: 1
}

// --- Creator search (search dropdown "Creators" section, lib/search.ts) ---
// Step 1: DCL names matching the query (/v1/nfts?category=ens&search=) → owner address.
export const creatorNames = {
  data: [{ nft: { name: 'GalaxyStudio', owner: CREATOR_ADDRESS } }],
  total: 1
}
// Step 2: which owners are actual sellers (/v1/accounts) — CREATOR_ADDRESS has collections.
export const accounts = {
  data: [{ address: CREATOR_ADDRESS, collections: 3 }],
  total: 1
}

// --- Legacy catalog (v3/catalog/legacy → Market grid): OLD classic MANA-priced liquidity ---
// Same items as the importable set, in the /v3/catalog/legacy response shape (tradeId + manaWei).
export const legacyListings = {
  data: [
    {
      tradeId: 'legacy-trade-1',
      listingType: 'primary',
      contractAddress: COLLECTION,
      itemId: '0',
      name: 'Retro Cap',
      thumbnail: '',
      rarity: 'epic',
      category: 'wearable',
      wearableCategory: 'hat',
      creator: TEST_ADDRESS,
      manaWei: MANA_WEI_PER, // 100 MANA → ~$27 → ~100 credits at the mock rate
      available: 100,
      network: 'MATIC',
      chainId: 80002,
      createdAt: 1_700_000_000
    },
    {
      tradeId: 'legacy-trade-2',
      listingType: 'primary',
      contractAddress: COLLECTION,
      itemId: '1',
      name: 'Vintage Jacket',
      thumbnail: '',
      rarity: 'legendary',
      category: 'wearable',
      wearableCategory: 'upper_body',
      creator: TEST_ADDRESS,
      manaWei: '50000000000000000000', // 50 MANA
      available: 10,
      network: 'MATIC',
      chainId: 80002,
      createdAt: 1_700_000_100
    }
  ],
  total: 2
}

// --- Unified catalog (v3/catalog/unified → the ONE browse grid): native + legacy in one feed ---
// Native rows (source 'native', manaWei null) render Add to cart at their fixed priceCredits; legacy
// rows (source 'legacy' + manaWei) render an "≈" live-rate price + Buy Now. Reuses the shop natives
// (Galaxy Hat / Nebula Jacket) and adds legacy liquidity (Retro Cap) so both card types are present.
export const unifiedListings = {
  data: [
    {
      tradeId: 'trade-1',
      listingType: 'primary',
      contractAddress: COLLECTION,
      itemId: '0',
      tokenId: null,
      name: 'Galaxy Hat',
      thumbnail: '',
      rarity: 'epic',
      category: 'wearable',
      wearableCategory: 'hat',
      creator: CREATOR_ADDRESS,
      priceCredits: 270,
      available: 100,
      network: 'MATIC',
      chainId: 80002,
      source: 'native',
      manaWei: null
    },
    {
      tradeId: 'trade-2',
      listingType: 'secondary',
      contractAddress: COLLECTION,
      itemId: '1',
      tokenId: '7',
      name: 'Nebula Jacket',
      thumbnail: '',
      rarity: 'legendary',
      category: 'wearable',
      wearableCategory: 'upper_body',
      creator: CREATOR_ADDRESS,
      priceCredits: 135,
      available: 1,
      network: 'MATIC',
      chainId: 80002,
      source: 'native',
      manaWei: null,
      isSmart: true
    },
    {
      tradeId: 'legacy-trade-1',
      listingType: 'primary',
      contractAddress: COLLECTION,
      itemId: '0',
      tokenId: null,
      name: 'Retro Cap',
      thumbnail: '',
      rarity: 'epic',
      category: 'wearable',
      wearableCategory: 'hat',
      creator: CREATOR_ADDRESS,
      priceCredits: 100, // server snapshot; the UI DISPLAYS the live-rate value instead
      available: 100,
      network: 'MATIC',
      chainId: 80002,
      source: 'legacy',
      manaWei: MANA_WEI_PER // 100 MANA → ~$27 → ~100 credits at the mock rate
    }
  ],
  total: 3
}

// --- Credits balance (credits-server /users/:addr/credits) ---
export const creditsResponse = {
  credits: [],
  totalCredits: 0,
  totals: { expiring: 0, nonExpiring: 0 },
  usd: { balanceCents: 5000, credits: 500 }
}

// --- A full signed Trade (what fetchTrade returns) for the buy-with-credits path ---
// Secondary ERC721 order for Nebula Jacket (token 7), priced $13.50 (135 credits). `contract` is the
// real Amoy OffChainMarketplaceV2 address so getContractName() resolves it in the browser.
export const OFFCHAIN_MARKETPLACE_AMOY = '0x1b67d0e31eeb6b52d8eeed71d3616c2f5b33b8e7'
export const MANA_AMOY = '0x7ad72b9f944ea9793cf4055d88f81138cc2c63a0'
export const buyTrade = {
  id: 'trade-2',
  signer: '0x' + 'aa'.repeat(20),
  signature: '0x' + 'ab'.repeat(65),
  network: 'MATIC',
  chainId: 80002,
  type: 'public_nft_order',
  contract: OFFCHAIN_MARKETPLACE_AMOY,
  checks: {
    uses: 1,
    expiration: Date.now() + 86_400_000,
    effective: Date.now() - 60_000,
    salt: '0x' + '00'.repeat(32),
    contractSignatureIndex: 0,
    signerSignatureIndex: 0,
    allowedRoot: '0x',
    allowedProof: [],
    externalChecks: []
  },
  sent: [{ assetType: 3, contractAddress: COLLECTION, value: '7', tokenId: '7', extra: '0x' }],
  received: [
    {
      assetType: 2,
      contractAddress: MANA_AMOY,
      value: '13500000000000000000',
      amount: '13500000000000000000',
      beneficiary: '0x' + 'aa'.repeat(20),
      extra: '0x'
    }
  ]
}

// A full signed Trade for the legacy Buy Now path (what fetchTrade('legacy-trade-1') returns). A
// USD-pegged primary item order priced $27 (270 credits) on the real Amoy marketplace.
export const legacyTrade = {
  id: 'legacy-trade-1',
  signer: '0x' + 'aa'.repeat(20),
  signature: '0x' + 'ab'.repeat(65),
  network: 'MATIC',
  chainId: 80002,
  type: 'public_item_order',
  contract: OFFCHAIN_MARKETPLACE_AMOY,
  checks: {
    uses: 100,
    expiration: Date.now() + 86_400_000,
    effective: Date.now() - 60_000,
    salt: '0x' + '00'.repeat(32),
    contractSignatureIndex: 0,
    signerSignatureIndex: 0,
    allowedRoot: '0x',
    allowedProof: [],
    externalChecks: []
  },
  sent: [{ assetType: 4, contractAddress: COLLECTION, value: '0', itemId: '0', extra: '0x' }],
  received: [
    {
      assetType: 2,
      contractAddress: MANA_AMOY,
      value: '27000000000000000000',
      amount: '27000000000000000000',
      beneficiary: '0x' + 'aa'.repeat(20),
      extra: '0x'
    }
  ]
}

// A full signed PRIMARY (mint) Trade for the Galaxy Hat (shop tradeId 'trade-1', itemId 0). A
// USD-pegged public_item_order priced $27 (270 credits), uses = remaining supply (100) so the same
// trade can be accepted multiple times in one accept([...]) — the basis for multi-quantity buys.
export const primaryTrade = {
  id: 'trade-1',
  signer: CREATOR_ADDRESS,
  signature: '0x' + 'ab'.repeat(65),
  network: 'MATIC',
  chainId: 80002,
  type: 'public_item_order',
  contract: OFFCHAIN_MARKETPLACE_AMOY,
  checks: {
    uses: 100,
    expiration: Date.now() + 86_400_000,
    effective: Date.now() - 60_000,
    salt: '0x' + '00'.repeat(32),
    contractSignatureIndex: 0,
    signerSignatureIndex: 0,
    allowedRoot: '0x',
    allowedProof: [],
    externalChecks: []
  },
  sent: [{ assetType: 4, contractAddress: COLLECTION, value: '0', itemId: '0', extra: '0x' }],
  received: [
    {
      assetType: 2,
      contractAddress: MANA_AMOY,
      value: '27000000000000000000',
      amount: '27000000000000000000',
      beneficiary: CREATOR_ADDRESS,
      extra: '0x'
    }
  ]
}

// --- Profile (peer lambdas) ---
export const profile = {
  avatars: [
    {
      name: 'e2e-tester',
      userId: TEST_ADDRESS,
      ethAddress: TEST_ADDRESS,
      avatar: { snapshots: { face256: '' } }
    }
  ]
}
