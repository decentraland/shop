import { create } from 'zustand'
import { track } from '~/lib/analytics'

// Client-side creator follows — a lightweight "wishlist for creators", persisted in
// localStorage (no backend, like recently-viewed). Powers the Follow button on a creator's
// page and the "From creators you follow" row on the overview. Addresses are stored
// lowercased and deduped, newest-followed first.
const STORAGE_KEY = 'shop:followed-creators:v1'
const CAP = 200

function load(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((a): a is string => typeof a === 'string') : []
  } catch {
    return []
  }
}

function persist(list: string[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list))
  } catch {
    // best-effort (private mode / quota) — following still works for the session
  }
}

type FollowState = {
  followed: string[]
  isFollowing: (address: string) => boolean
  follow: (address: string) => void
  unfollow: (address: string) => void
  toggle: (address: string) => void
}

export const useFollows = create<FollowState>((set, get) => ({
  followed: load(),
  isFollowing: address => get().followed.includes(address.toLowerCase()),
  follow: address => {
    const a = address.toLowerCase()
    if (!a || get().followed.includes(a)) return
    const next = [a, ...get().followed].slice(0, CAP)
    persist(next)
    set({ followed: next })
    track('Shop Followed Creator', { creator_address: a, following_count: next.length })
  },
  unfollow: address => {
    const a = address.toLowerCase()
    if (!get().followed.includes(a)) return
    const next = get().followed.filter(x => x !== a)
    persist(next)
    set({ followed: next })
    track('Shop Unfollowed Creator', { creator_address: a, following_count: next.length })
  },
  toggle: address => (get().isFollowing(address) ? get().unfollow(address) : get().follow(address))
}))
