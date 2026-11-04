import { describe, it, expect } from 'vitest'
import { notificationPeople, type ShopNotification } from './notifications'

function notification(type: string, metadata: unknown): ShopNotification {
  return {
    id: type,
    type,
    address: '0xabc0000000000000000000000000000000000abc',
    timestamp: 0,
    read: true,
    created_at: '',
    updated_at: '',
    metadata
  }
}

describe('notificationPeople', () => {
  it('collects every person a notification names, keyed by lowercased address', () => {
    const people = notificationPeople([
      notification('social_service_friendship_request', { sender: { address: '0xAAA', name: 'goldboss' } }),
      notification('tip_received', { senderAddress: '0xBBB' }),
      notification('rental_started', { tenant: '0xCCC' }),
      notification('item_sold', { nftName: 'Hat' })
    ])
    expect([...people]).toEqual([
      ['0xaaa', 'goldboss'],
      ['0xbbb', undefined],
      ['0xccc', undefined]
    ])
  })

  it('keeps a name the service sent when the same person appears again without one', () => {
    const people = notificationPeople([
      notification('tip_received', { senderAddress: '0xAAA' }),
      notification('social_service_friendship_request', { sender: { address: '0xaaa', name: 'goldboss' } }),
      notification('gift_received', { senderAddress: '0xAaA' })
    ])
    expect(people.get('0xaaa')).toBe('goldboss')
  })

  it('ignores missing or malformed metadata', () => {
    const people = notificationPeople([
      notification('a', null),
      notification('b', { sender: { name: 'no address' } }),
      notification('c', { senderAddress: 42 })
    ])
    expect(people.size).toBe(0)
  })
})
