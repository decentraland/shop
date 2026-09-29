import { beforeEach, describe, expect, it } from 'vitest'
import { couponUsedWith, recordCouponUse, recordCouponUses, useCouponUses } from './couponUses'

/** Reads through the store the components subscribe to, so the spec exercises the same path they do. */
const couponUsed = (coupon?: { id: string; used?: number } | null) =>
  couponUsedWith(useCouponUses.getState().spent, coupon)

const coupon = (used?: number, id = 'coupon-1') => ({ id, used })

/**
 * The bar under a discounted item reads its count from the server, which learns about a purchase on its
 * own schedule. These pin the one rule that makes the difference invisible to a buyer: the count may only
 * ever go up.
 */
describe('couponUses', () => {
  beforeEach(() => {
    useCouponUses.getState().reset()
  })

  it('reports what the catalogue says while nothing has been bought here', () => {
    expect(couponUsed(coupon(2))).toBe(2)
  })

  it('counts a purchase the moment it settles, without waiting for the server to notice', () => {
    recordCouponUse(coupon(2))
    expect(couponUsed(coupon(2))).toBe(3)
  })

  it('stacks a second purchase on the first rather than restating it', () => {
    recordCouponUse(coupon(2))
    // The catalogue has not moved yet, so the second purchase still sees 2 reported.
    recordCouponUse(coupon(2))
    expect(couponUsed(coupon(2))).toBe(4)
  })

  it('takes a cart of several copies in one go', () => {
    recordCouponUse(coupon(2), 3)
    expect(couponUsed(coupon(2))).toBe(5)
  })

  // The whole point of a floor rather than a value: the moment the server is ahead, it is the answer.
  it('steps aside once the server has caught up and passed it', () => {
    recordCouponUse(coupon(2))
    expect(couponUsed(coupon(5))).toBe(5)
  })

  it('never lets the count fall back to a figure the server has not updated yet', () => {
    recordCouponUse(coupon(2))
    expect(couponUsed(coupon(2))).toBe(3)
    expect(couponUsed(coupon(undefined))).toBe(3)
  })

  it('keeps each coupon to itself', () => {
    recordCouponUse(coupon(2, 'coupon-1'))
    expect(couponUsed(coupon(2, 'coupon-2'))).toBe(2)
  })

  describe('a basket settling at once', () => {
    it('counts every copy of one discount as one use each', () => {
      recordCouponUses([coupon(2), coupon(2), coupon(2)])
      expect(couponUsed(coupon(2))).toBe(5)
    })

    it('keeps two discounts in the same basket apart', () => {
      recordCouponUses([coupon(2, 'coupon-1'), coupon(7, 'coupon-2'), coupon(2, 'coupon-1')])
      expect(couponUsed(coupon(2, 'coupon-1'))).toBe(4)
      expect(couponUsed(coupon(7, 'coupon-2'))).toBe(8)
    })

    it('ignores the lines that carry no discount', () => {
      recordCouponUses([null, undefined, coupon(2)])
      expect(couponUsed(coupon(2))).toBe(3)
    })
  })

  it('has nothing to say about a listing with no coupon', () => {
    expect(couponUsed(null)).toBe(0)
    expect(couponUsed(undefined)).toBe(0)
    expect(() => recordCouponUse(null)).not.toThrow()
  })

  it('ignores a count that would spend nothing', () => {
    recordCouponUse(coupon(2), 0)
    expect(couponUsed(coupon(2))).toBe(2)
  })
})
