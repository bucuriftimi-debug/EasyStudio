import i18next from 'i18next'
import { formatBytes } from '@easystudio/core'
import { ensureModel, hasModel } from '../platform'
import { ask, useEditor } from '../state/store'
import { MODELS, type ModelId } from './models'

/** Thin RPC layer over the AI worker. */

type Pending = { resolve: (v: unknown) => void; reject: (e: Error) => void; onProgress?: (p: number) => void }

let worker: Worker | null = null
let seq = 0
const pending = new Map<number, Pending>()
let ready: Promise<{ device: string }> | null = null

function getWorker(): Worker {
  if (worker) return worker
  worker = new Worker(new URL('./ai.worker.ts', import.meta.url), { type: 'module', name: 'easystudio-ai' })
  worker.onmessage = (e: MessageEvent<{ id: number; ok?: boolean; data?: unknown; error?: string; progress?: number }>) => {
    const m = e.data
    const p = pending.get(m.id)
    if (!p) return
    if (m.progress !== undefined) return p.onProgress?.(m.progress)
    pending.delete(m.id)
    if (m.ok) p.resolve(m.data)
    else {
      // Out of memory leaves the AI engine unusable: start a fresh worker for the next task.
      if (/bad_alloc|failed to allocate|out of memory|device (was )?lost/i.test(m.error ?? '')) resetWorker()
      p.reject(new Error(m.error ?? 'AI error'))
    }
  }
  worker.onerror = (e) => {
    for (const p of pending.values()) p.reject(new Error(e.message || 'AI worker crashed'))
    pending.clear()
    worker = null
    ready = null
  }
  return worker
}

function resetWorker(): void {
  worker?.terminate()
  worker = null
  ready = null
}

function send<T>(msg: Record<string, unknown>, transfer: Transferable[] = [], onProgress?: (p: number) => void): Promise<T> {
  const w = getWorker()
  const id = ++seq
  return new Promise<T>((resolve, reject) => {
    pending.set(id, { resolve: resolve as (v: unknown) => void, reject, onProgress })
    w.postMessage({ ...msg, id }, transfer)
  })
}

/** Start the worker once; resolves with 'gpu' (WebGPU) or 'cpu'. */
export function aiReady(): Promise<{ device: string }> {
  ready ??= send<{ device: string }>({ type: 'init' })
  return ready
}

export const t = (k: string, o?: Record<string, unknown>) => i18next.t(k, o) as string

export function setProgress(text: string | null, progress: number | null = null): void {
  useEditor.setState({ busy: text, busyProgress: progress })
}

/**
 * Make sure the given models are on the computer. The first time, the user is asked before
 * anything is downloaded (with the size); downloads show a progress bar.
 * Returns the URLs to load them from, or null if the user said no.
 */
export async function prepareModels(ids: ModelId[]): Promise<Record<string, string> | null> {
  const missing: ModelId[] = []
  for (const id of ids) if (!(await hasModel(MODELS[id].file))) missing.push(id)
  if (missing.length) {
    const bytes = missing.reduce((n, id) => n + MODELS[id].bytes, 0)
    const ok = await ask(t('ai.downloadAsk', { size: formatBytes(bytes) }), t('ai.download'), t('dialog.cancel'))
    if (!ok) return null
  }
  const urls: Record<string, string> = {}
  for (const id of ids) {
    const m = MODELS[id]
    urls[id] = await ensureModel(m.file, m.url, (received, total) =>
      setProgress(t('ai.downloading', { done: formatBytes(received), total: formatBytes(total || m.bytes) }), total ? received / total : null)
    )
  }
  return urls
}

export const ai = {
  matte: (url: string, image: ImageBitmap) => send<{ alpha: Uint8ClampedArray; w: number; h: number }>({ type: 'matte', url, image }, [image]),
  samEncode: (url: string, image: ImageBitmap, origW: number, origH: number, key: string) =>
    send<boolean>({ type: 'samEncode', url, image, origW, origH, key }, [image]),
  samDecode: (url: string, key: string, points: { x: number; y: number; label: number }[]) =>
    send<{ alpha: Uint8ClampedArray; w: number; h: number }>({ type: 'samDecode', url, key, points }),
  inpaint: (url: string, image: ImageData, mask: Uint8ClampedArray) => send<ImageData>({ type: 'inpaint', url, image, mask }, [image.data.buffer, mask.buffer]),
  upscale: (url: string, image: ImageData, scale: 2 | 4, onProgress: (p: number) => void) =>
    send<ImageData>({ type: 'upscale', url, image, scale }, [image.data.buffer], onProgress),
  release: () => (worker ? send<boolean>({ type: 'release' }) : Promise.resolve(true))
}
