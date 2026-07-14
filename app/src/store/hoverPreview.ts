import { create } from 'zustand'
import type { CatalogItem } from '~/lib/api'

// Shared state for the ONE persistent hover-preview instance (see HoverPreviewLayer). Cards don't
// mount their own 3D preview anymore: on hover a card asks this store to point the single warm iframe
// at its item + media element. The layer keeps the 3D engine alive across hovers and only swaps the
// loaded wearable (via a postMessage UPDATE), so a hover costs a GLB load instead of a full iframe +
// WebGL-context + engine boot from scratch.
type HoverPreviewState = {
  // The item to preview, or null when nothing is hovered (iframe parked offscreen, kept warm).
  item: CatalogItem | null
  // The card media element the preview overlays; the layer tracks its on-screen rect.
  anchor: HTMLElement | null
  // The current item's scene has finished loading (drives the thumbnail→3D crossfade).
  ready: boolean
  // Bumps on every show() so the layer can ignore a LOAD event left over from a previous hover.
  token: number
  show: (item: CatalogItem, anchor: HTMLElement) => void
  hide: () => void
  setReady: () => void
}

export const useHoverPreview = create<HoverPreviewState>((set, get) => ({
  item: null,
  anchor: null,
  ready: false,
  token: 0,
  show: (item, anchor) => {
    // Re-entering the same card (e.g. mouse jitter) must NOT reset `ready` — that would re-trigger the
    // loading state and re-fade a preview that's already up.
    const cur = get()
    if (cur.item?.id === item.id && cur.anchor === anchor) return
    set(s => ({ item, anchor, ready: false, token: s.token + 1 }))
  },
  hide: () => set({ item: null, anchor: null, ready: false }),
  setReady: () => set({ ready: true })
}))
