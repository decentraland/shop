import { describe, it, expect } from 'vitest'
import { itemIdFromUrn } from './urn'

describe('itemIdFromUrn', () => {
  it('parses a collections-v2 item URN into a `contract-itemId` catalog id', () => {
    expect(itemIdFromUrn('urn:decentraland:matic:collections-v2:0x90f3d8780f8e32c0f1f937edfc0ad930b2e7347f:0')).toBe(
      '0x90f3d8780f8e32c0f1f937edfc0ad930b2e7347f-0'
    )
    expect(itemIdFromUrn('urn:decentraland:amoy:collections-v2:0xBA7F33D73AA04B81CBEE3F2ECF95F5D442939D0E:12')).toBe(
      '0xba7f33d73aa04b81cbee3f2ecf95f5d442939d0e-12'
    )
  })

  it('returns null for URNs that are not collections-v2 items', () => {
    expect(itemIdFromUrn('urn:decentraland:off-chain:base-avatars:BaseFemale')).toBeNull()
    expect(itemIdFromUrn('../OutfitStudio/Poses/Pose_15')).toBeNull()
    expect(itemIdFromUrn('')).toBeNull()
  })
})
