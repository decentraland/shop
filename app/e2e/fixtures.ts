// Canned data for the e2e mocks. The test user address is derived from the fixed test key in
// helpers/session.ts (ethers.Wallet('0x11..').address).
export const TEST_ADDRESS = '0x19e7e376e7c213b7e7e7e46cc70a5dd086daff2a'
export const COLLECTION = '0xc0113c1100000000000000000000000000000001'
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
      thumbnail: '',
      rarity: 'epic',
      category: 'wearable',
      wearableCategory: 'hat',
      creator: TEST_ADDRESS,
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
      creator: TEST_ADDRESS,
      priceCredits: 135,
      available: 1,
      network: 'MATIC',
      chainId: 80002
    }
  ],
  total: 2
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
