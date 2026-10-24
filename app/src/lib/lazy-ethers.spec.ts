import { describe, it, expect, vi } from 'vitest'
import { createEthersLoader } from '~/lib/lazy-ethers'

type EthersModule = typeof import('ethers')
const module = (marker: string) => ({ ethers: { marker } }) as unknown as EthersModule

describe('createEthersLoader', () => {
  it('should resolve the ethers namespace', async () => {
    const load = createEthersLoader(async () => module('ethers'))

    expect(await load()).toEqual({ marker: 'ethers' })
  })

  it('should import once for concurrent callers', async () => {
    const importer = vi.fn(async () => module('ethers'))
    const load = createEthersLoader(importer)

    const [a, b] = await Promise.all([load(), load()])

    expect(a).toBe(b)
    expect(importer).toHaveBeenCalledTimes(1)
  })

  // The regression this guards against: caching the REJECTED promise, so one failed chunk load broke every
  // later sign-in and balance read until the page was reloaded.
  it('should import again after a failed attempt instead of repeating the failure', async () => {
    const importer = vi
      .fn<() => Promise<EthersModule>>()
      .mockRejectedValueOnce(new Error('chunk failed to load'))
      .mockResolvedValueOnce(module('ethers'))
    const load = createEthersLoader(importer)

    await expect(load()).rejects.toThrow('chunk failed to load')
    await expect(load()).resolves.toEqual({ marker: 'ethers' })
    expect(importer).toHaveBeenCalledTimes(2)
  })
})
