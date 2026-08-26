import { ethers } from 'ethers'
import { getLatestOffChainMarketplaceContract } from '~/lib/marketplace'
import { config } from '~/config'
import type { ManaRate } from '~/lib/mana-convert'

// The conversions live in lib/mana-convert (pure arithmetic, no chain imports) and are re-exported here so
// every existing `from '~/lib/mana-rate'` import keeps working. See that module for why they are split.
export * from '~/lib/mana-convert'

// The live MANA→USD market rate + the MANA-wei→credits conversion used by the unified browse (Assets)
// for its legacy (market-priced) cards.
//
// Source: the SAME on-chain oracle the purchase path uses. USD-pegged trades convert USD→MANA via
// marketplace.manaUsdAggregator() (see lib/buy.ts tradeManaPriceWei); here we read that aggregator
// directly and go the other way (MANA→USD) so we can DISPLAY a legacy MANA listing's price in
// credits before any purchase. Reading the oracle (rather than the credits-server) means the grid
// can show prices with no wallet/auth — and it's the exact rate settlement will use.
//
// The displayed credit price is only INDICATIVE (it drifts with the rate). The price is LOCKED at
// checkout by the credits-server authorize call (which sizes MANA at its own oracle read and signs a
// fixed maxCreditedValue) — see MarketCheckout (opened from the unified browse).

// ethers v5 `Contract` returns `any` for dynamically-named ABI methods; narrow to the aggregator's
// fragments so the round-data tuple reads below stay type-checked.
type OracleReaderContract = ethers.Contract & {
  manaUsdAggregator(): Promise<string>
}
type AggregatorContract = ethers.Contract & {
  decimals(): Promise<number>
  latestRoundData(): Promise<[ethers.BigNumber, ethers.BigNumber, ethers.BigNumber, ethers.BigNumber, ethers.BigNumber]>
}

// Max age of the oracle round before we treat it as stale. The MANA/USD aggregator's heartbeat is on
// the order of a day (~24h); we add a ~1h buffer over that so a slightly-fast client clock or a round
// that lands right at the heartbeat doesn't briefly (and wrongly) disable Buy Now. Still catches a
// genuinely stuck feed.
const MAX_STALENESS_SECONDS = 90000

// Read the MANA/USD Chainlink-style aggregator off the marketplace contract (decoupled from the
// wallet's network via the read-only RPC). Throws if the oracle is unreachable/stale/incomplete so
// callers can disable Buy Now with a message instead of pricing off a bad rate.
export async function readManaUsdRate(chainId: number = config.chainId): Promise<ManaRate> {
  const market = getLatestOffChainMarketplaceContract(chainId)
  const provider = new ethers.providers.JsonRpcProvider(config.rpcUrl)
  const mkt = new ethers.Contract(
    market.address,
    ['function manaUsdAggregator() view returns (address)'],
    provider
  ) as OracleReaderContract
  const aggAddr = await mkt.manaUsdAggregator()
  const agg = new ethers.Contract(
    aggAddr,
    [
      'function decimals() view returns (uint8)',
      'function latestRoundData() view returns (uint80,int256,uint256,uint256,uint80)'
    ],
    provider
  ) as AggregatorContract
  const decimals = await agg.decimals()
  // latestRoundData = [roundId, answer, startedAt, updatedAt, answeredInRound].
  const rd = await agg.latestRoundData()
  const rate = BigInt(rd[1].toString())
  if (rate <= 0n) throw new Error('mana rate unavailable')
  // Completeness: an answer carried over from an earlier round (answeredInRound < roundId) is not
  // fresh data for this round — reject it rather than price off a partial update.
  if (BigInt(rd[4].toString()) < BigInt(rd[0].toString())) throw new Error('mana rate incomplete')
  // Staleness: a stuck-but-positive feed would otherwise pass the rate > 0 check. Reject a round that
  // hasn't updated within the heartbeat so the Buy Now gate actually fires (see doc comment above).
  const updatedAt = Number(rd[3].toString())
  const ageSeconds = Math.floor(Date.now() / 1000) - updatedAt
  if (!Number.isFinite(updatedAt) || updatedAt <= 0 || ageSeconds > MAX_STALENESS_SECONDS) {
    throw new Error('mana rate stale')
  }
  return { rate, decimals: Number(decimals) }
}
