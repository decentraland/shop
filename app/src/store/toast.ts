import { create } from 'zustand'

// Lightweight app-wide toasts (success / error / info). Rendered by <Toaster/> (mounted in App).
export type ToastKind = 'success' | 'error' | 'info'
export type Toast = { id: number; message: string; kind: ToastKind }

type ToastState = {
  toasts: Toast[]
  push: (t: Omit<Toast, 'id'>) => number
  dismiss: (id: number) => void
}

let seq = 0

export const useToast = create<ToastState>(set => ({
  toasts: [],
  push: t => {
    const id = ++seq
    set(s => ({ toasts: [...s.toasts, { ...t, id }] }))
    return id
  },
  dismiss: id => set(s => ({ toasts: s.toasts.filter(x => x.id !== id) }))
}))

// Fire-and-forget helpers usable outside React (e.g. from async handlers).
export const toast = {
  success: (message: string) => useToast.getState().push({ message, kind: 'success' }),
  error: (message: string) => useToast.getState().push({ message, kind: 'error' }),
  info: (message: string) => useToast.getState().push({ message, kind: 'info' })
}
