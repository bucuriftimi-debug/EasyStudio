import i18next from 'i18next'
import { create } from 'zustand'
import { CanvasSink, CanvasSource, Mp4OutputFormat, Output, StreamTarget, type StreamTargetChunk } from 'mediabunny'
import type { SegMessage, SegRequest } from '../engine/seg.worker'
import { loadMask } from '../media/masks'
import { mediaHandles } from '../media/media'
import { exportFile } from '../platform'
import { commit, getProject, mediaById } from './editor'
import * as P from './project'

/**
 * "Remove background" for a video clip: every frame goes through IS-Net in a worker,
 * the masks are saved as a small grey video in the app's data folder, and the clip points to it.
 * Playback and export then only read that video, so the cut-out plays smoothly.
 */

const t = (k: string, o?: Record<string, unknown>) => i18next.t(k, o) as string

/** Masks are made at this size (long side); a grey mask is smooth, so this is plenty. */
const MASK_SIDE = 512

export interface BgState {
  clipId: string | null
  phase: 'idle' | 'download' | 'work' | 'done' | 'error'
  progress: number | null
  error: string | null
}

export const useBgRemoval = create<BgState>(() => ({ clipId: null, phase: 'idle', progress: null, error: null }))
const set = useBgRemoval.setState

let worker: Worker | null = null
let waiting = new Map<number, (m: Uint8ClampedArray) => void>()
let failed: ((e: Error) => void) | null = null
let seq = 0

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL('../engine/seg.worker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = (e: MessageEvent<SegMessage>) => {
      const m = e.data
      if (m.type === 'download') set({ phase: 'download', progress: m.total ? m.loaded / m.total : null })
      else if (m.type === 'mask') {
        waiting.get(m.id)?.(m.mask)
        waiting.delete(m.id)
      } else if (m.type === 'error') failed?.(new Error(m.message))
    }
  }
  return worker
}

function segment(rgba: Uint8ClampedArray, width: number, height: number): Promise<Uint8ClampedArray> {
  return new Promise((resolve, reject) => {
    const id = ++seq
    waiting.set(id, resolve)
    failed = reject
    const req: SegRequest = { type: 'frame', id, rgba, width, height }
    getWorker().postMessage(req, [rgba.buffer])
  })
}

let abort: AbortController | null = null

export function cancelBgRemoval(): void {
  abort?.abort()
  // The model cannot stop mid-frame: a fresh worker next time.
  worker?.terminate()
  worker = null
  waiting = new Map()
  set({ clipId: null, phase: 'idle', progress: null })
}

export const closeBgRemoval = () => set({ clipId: null, phase: 'idle', progress: null, error: null })

/** Make the mask video of a clip and use it. */
export async function removeVideoBackground(clipId: string): Promise<boolean> {
  const p = getProject()
  const c = P.findClip(p, clipId)?.clip
  const m = c ? mediaById(c.mediaId) : undefined
  const io = exportFile()
  if (!c || !m?.hasVideo || !io) return false
  const track = mediaHandles(m.id).video
  if (!track) return false
  abort = new AbortController()
  const signal = abort.signal
  set({ clipId, phase: 'work', progress: 0, error: null })
  const k = MASK_SIDE / Math.max(m.width, m.height)
  const mw = Math.max(2, Math.round((m.width * k) / 2) * 2)
  const mh = Math.max(2, Math.round((m.height * k) / 2) * 2)
  const path = await io.internal(`mask-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}.mp4`)
  const fid = await io.open(path)
  let keep = false
  try {
    const writable = new WritableStream<StreamTargetChunk>({ write: (chunk) => io.write(fid, chunk.position, chunk.data) })
    const output = new Output({ format: new Mp4OutputFormat({ fastStart: false }), target: new StreamTarget(writable, { chunked: true, chunkSize: 2 * 1024 * 1024 }) })
    const canvas = new OffscreenCanvas(mw, mh)
    const ctx = canvas.getContext('2d')!
    const source = new CanvasSource(canvas, { codec: 'avc', bitrate: 1_500_000, keyFrameInterval: 1 })
    output.addVideoTrack(source, { frameRate: (m.fps || 30) > 35 ? (m.fps || 30) / 2 : m.fps || 30 })
    await output.start()
    const sink = new CanvasSink(track, { width: mw, height: mh, fit: 'fill' })
    const img = new ImageData(mw, mh)
    let last = -1
    // Masks at 25–30 per second are plenty: 50/60 fps clips use every second frame (half the time).
    const every = (m.fps || 30) > 35 ? 2 : 1
    let index = 0
    for await (const w of sink.canvases(c.in, c.out)) {
      if (signal.aborted) throw new Error('cancelled')
      if (index++ % every) continue
      const src = (w.canvas as OffscreenCanvas).getContext('2d', { willReadFrequently: true })!
      const rgba = src.getImageData(0, 0, mw, mh).data
      const mask = await segment(rgba, mw, mh)
      if (useBgRemoval.getState().phase !== 'work') set({ phase: 'work' })
      for (let i = 0; i < mask.length; i++) {
        img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = mask[i]
        img.data[i * 4 + 3] = 255
      }
      ctx.putImageData(img, 0, 0)
      const ts = Math.max(last + 1e-3, w.timestamp - c.in)
      last = ts
      await source.add(ts, w.duration * every)
      set({ progress: Math.min(1, (w.timestamp - c.in) / Math.max(1e-3, c.out - c.in)) })
    }
    await output.finalize()
    keep = true
  } catch (e) {
    if (!signal.aborted) {
      console.error(e)
      set({ phase: 'error', error: String((e as Error)?.message ?? e) })
    }
    return false
  } finally {
    await io.close(fid, keep)
  }
  await loadMask(path)
  commit(t('hist.bgRemove'), (q) => P.updateClip(q, clipId, { bgMask: { path, from: c.in, to: c.out } }))
  set({ phase: 'done', progress: 1 })
  return true
}

/** Show the whole picture again. */
export function restoreVideoBackground(clipId: string): void {
  commit(t('hist.bgRestore'), (q) => P.updateClip(q, clipId, { bgMask: null }))
}
