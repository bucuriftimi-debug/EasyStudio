import { create } from 'zustand'
import type { MediaInfo } from '../media/media'

export interface Toast {
  id: number
  text: string
  kind: 'info' | 'success' | 'error'
}

export interface VideoState {
  /** The media library. */
  media: MediaInfo[]
  /** Files being read (shown as placeholders). */
  importing: { key: string; name: string }[]
  selectedMedia: string | null
  /** Player time (seconds) and state, mirrored from the engine for the UI. */
  time: number
  playing: boolean
  toasts: Toast[]
  busy: string | null
  /** An open yes / no question (see `ask`). */
  question: { text: string; yes: string; no: string; resolve: (v: boolean) => void } | null
}

export const useVideo = create<VideoState>(() => ({
  media: [],
  importing: [],
  selectedMedia: null,
  time: 0,
  playing: false,
  toasts: [],
  busy: null,
  question: null
}))

const set = useVideo.setState

let toastId = 0
export function toast(text: string, kind: Toast['kind'] = 'info', ms = 3500): void {
  const id = ++toastId
  set((s) => ({ toasts: [...s.toasts, { id, text, kind }] }))
  setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), ms)
}

export function setBusy(busy: string | null): void {
  set({ busy })
}

/** Ask a yes / no question in an in-app dialog. */
export function ask(text: string, yes: string, no: string): Promise<boolean> {
  return new Promise((resolve) => {
    useVideo.getState().question?.resolve(false)
    set({
      question: {
        text,
        yes,
        no,
        resolve: (v) => {
          set({ question: null })
          resolve(v)
        }
      }
    })
  })
}
