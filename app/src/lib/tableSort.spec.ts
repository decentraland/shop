import { describe, it, expect } from 'vitest'
import { nextSort, sortRows } from '~/lib/tableSort'

type Row = { name: string; earned: bigint | null; sold: number }

const rows: Row[] = [
  { name: 'beta', earned: 5n, sold: 2 },
  { name: 'Alpha', earned: null, sold: 9 },
  { name: 'gamma', earned: 20n, sold: 2 }
]

describe('when choosing the next column sort', () => {
  describe('and no column is sorted yet', () => {
    it('should start the clicked column at its first direction', () => {
      expect(nextSort(null, 'earned', 'desc')).toEqual({ key: 'earned', dir: 'desc' })
    })
  })

  describe('and the clicked column is the one already sorted', () => {
    it('should flip its direction', () => {
      expect(nextSort({ key: 'earned', dir: 'desc' }, 'earned', 'desc')).toEqual({ key: 'earned', dir: 'asc' })
    })
  })

  describe('and a different column is clicked', () => {
    it('should start that column at its first direction', () => {
      expect(nextSort({ key: 'earned', dir: 'asc' }, 'name', 'asc')).toEqual({ key: 'name', dir: 'asc' })
    })
  })
})

describe('when sorting rows', () => {
  describe('and the value is text', () => {
    it('should order it ignoring case', () => {
      expect(sortRows(rows, r => r.name, 'asc').map(r => r.name)).toEqual(['Alpha', 'beta', 'gamma'])
    })
  })

  describe('and the value is a bigint, descending', () => {
    it('should put the biggest first and the missing value last', () => {
      expect(sortRows(rows, r => r.earned, 'desc').map(r => r.name)).toEqual(['gamma', 'beta', 'Alpha'])
    })
  })

  describe('and the value is a bigint, ascending', () => {
    it('should still put the missing value last', () => {
      expect(sortRows(rows, r => r.earned, 'asc').map(r => r.name)).toEqual(['beta', 'gamma', 'Alpha'])
    })
  })

  describe('and two rows tie', () => {
    it('should keep their incoming order', () => {
      expect(sortRows(rows, r => r.sold, 'asc').map(r => r.name)).toEqual(['beta', 'gamma', 'Alpha'])
    })
  })

  it('should not change the input', () => {
    const before = rows.map(r => r.name)

    sortRows(rows, r => r.name, 'desc')

    expect(rows.map(r => r.name)).toEqual(before)
  })
})
