import { afterEach, describe, expect, it, vi } from 'vitest'

import { config } from '~/config'
import { fetchCampaignContracts, isInCampaign, MAX_CAMPAIGN_CONTRACTS } from '~/lib/campaign'
import { setErrorForwarder } from '~/lib/monitoring'

const A = '0xabc0000000000000000000000000000000000001'
const B = '0xdef0000000000000000000000000000000000002'

function mockAddresses(data: unknown, ok = true) {
  const fetchMock = vi
    .fn()
    .mockResolvedValue({ ok, status: ok ? 200 : 503, json: () => Promise.resolve({ ok: true, data }) })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

describe('campaign', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    setErrorForwarder(null)
  })

  describe('when resolving a campaign tag', () => {
    it('should ask the builder for the addresses carrying the tag', async () => {
      const fetchMock = mockAddresses([A, B])
      await expect(fetchCampaignContracts(['halloween'])).resolves.toEqual([A, B])
      expect(String(fetchMock.mock.calls[0][0])).toBe(`${config.builderServerUrl}/v1/addresses?tag=halloween`)
    })

    it('should send every tag as its own parameter', async () => {
      // The builder's route repeats the key rather than taking a list, and additionalTags is how a campaign
      // folds a second collection set into one feed.
      const fetchMock = mockAddresses([A])
      await fetchCampaignContracts(['halloween', 'spooky'])
      expect(String(fetchMock.mock.calls[0][0])).toContain('tag=halloween&tag=spooky')
    })

    it('should lowercase and de-duplicate the addresses', async () => {
      mockAddresses([A.toUpperCase().replace('0X', '0x'), A, B])
      await expect(fetchCampaignContracts(['halloween'])).resolves.toEqual([A, B])
    })

    it('should drop anything that is not an address', async () => {
      mockAddresses([A, 'not-an-address', '0x123', null])
      await expect(fetchCampaignContracts(['halloween'])).resolves.toEqual([A])
    })

    it('should return nothing for no tags, without calling the builder', async () => {
      const fetchMock = mockAddresses([A])
      await expect(fetchCampaignContracts([])).resolves.toEqual([])
      await expect(fetchCampaignContracts(['  '])).resolves.toEqual([])
      expect(fetchMock).not.toHaveBeenCalled()
    })

    it('should return nothing for a tag nobody has applied', async () => {
      // An unknown tag is a legitimate answer ("this event selects nothing"), not an error — every caller
      // must render an empty grid rather than an unfiltered one.
      mockAddresses([])
      await expect(fetchCampaignContracts(['halloween2099'])).resolves.toEqual([])
    })

    it('should throw when the builder is unreachable', async () => {
      mockAddresses([], false)
      await expect(fetchCampaignContracts(['halloween'])).rejects.toThrow(/503/)
    })

    it('should cap an oversized tag and report it', async () => {
      // The addresses travel in a query string; past the cap a request risks being truncated in transit,
      // which arrives as a silently shorter list rather than as a failure.
      const many = Array.from({ length: MAX_CAMPAIGN_CONTRACTS + 5 }, (_, i) => `0x${String(i).padStart(40, '0')}`)
      mockAddresses(many)
      const reported: unknown[] = []
      setErrorForwarder(error => reported.push(error))

      const contracts = await fetchCampaignContracts(['halloween'])

      expect(contracts).toHaveLength(MAX_CAMPAIGN_CONTRACTS)
      expect(reported).toHaveLength(1)
    })
  })

  describe('when checking whether an item belongs to the campaign', () => {
    it('should match regardless of the address casing', () => {
      expect(isInCampaign([A], A.toUpperCase().replace('0X', '0x'))).toBe(true)
    })

    it('should not match an address outside the campaign', () => {
      expect(isInCampaign([A], B)).toBe(false)
    })

    it('should not match when there is no address', () => {
      expect(isInCampaign([A], undefined)).toBe(false)
      expect(isInCampaign([], A)).toBe(false)
    })
  })
})
