import { describe, it, expect, beforeEach } from 'vitest'
import type { CatalogItem } from '~/lib/api'
import { useHoverPreview } from '~/store/hoverPreview'

const item = (id: string): CatalogItem => ({ id }) as CatalogItem

beforeEach(() => {
  useHoverPreview.setState({ item: null, anchor: null, ready: false, token: 0 })
})

describe('when a card asks for the preview (show)', () => {
  it('should point the preview at the item + anchor, reset ready and bump the token', () => {
    const anchor = document.createElement('div')
    useHoverPreview.getState().show(item('a'), anchor)
    const s = useHoverPreview.getState()
    expect(s.item?.id).toBe('a')
    expect(s.anchor).toBe(anchor)
    expect(s.ready).toBe(false)
    expect(s.token).toBe(1)
  })

  it('re-entering the same card is a no-op so an already-loaded preview does not re-fade', () => {
    const anchor = document.createElement('div')
    useHoverPreview.getState().show(item('a'), anchor)
    useHoverPreview.getState().setReady()
    useHoverPreview.getState().show(item('a'), anchor)
    const s = useHoverPreview.getState()
    expect(s.ready).toBe(true)
    expect(s.token).toBe(1)
  })

  it('moving to a different card swaps the target and invalidates the previous load', () => {
    const a = document.createElement('div')
    const b = document.createElement('div')
    useHoverPreview.getState().show(item('a'), a)
    useHoverPreview.getState().setReady()
    useHoverPreview.getState().show(item('b'), b)
    const s = useHoverPreview.getState()
    expect(s.item?.id).toBe('b')
    expect(s.ready).toBe(false)
    expect(s.token).toBe(2)
  })
})

describe('when the hover ends (hide)', () => {
  it('should park the preview: no item, no anchor, not ready', () => {
    useHoverPreview.getState().show(item('a'), document.createElement('div'))
    useHoverPreview.getState().setReady()
    useHoverPreview.getState().hide()
    const s = useHoverPreview.getState()
    expect(s.item).toBeNull()
    expect(s.anchor).toBeNull()
    expect(s.ready).toBe(false)
  })
})

describe('when the scene finishes loading (setReady)', () => {
  it('should flip ready so the thumbnail crossfades to the 3D view', () => {
    useHoverPreview.getState().show(item('a'), document.createElement('div'))
    useHoverPreview.getState().setReady()
    expect(useHoverPreview.getState().ready).toBe(true)
  })
})
