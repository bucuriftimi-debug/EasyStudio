import { AudioBufferSink, CanvasSink } from 'mediabunny'
import { mediaHandles, type MediaInfo } from './media'

/**
 * Pictures and sound shapes for the timeline, made in the background the first time a file is
 * put on the timeline, then kept:
 *  - film strip: small frames at a fixed time step;
 *  - waveform: loudest sample per 1/100 s.
 */

export interface FilmStrip {
  step: number
  width: number
  height: number
  frames: (ImageBitmap | null)[]
}

export interface Waveform {
  /** Peaks per second. */
  rate: number
  peaks: Float32Array
  /** How many peaks are ready (it fills up while decoding). */
  ready: number
}

const strips = new Map<string, FilmStrip>()
const waves = new Map<string, Waveform>()
const listeners = new Set<() => void>()
let notifyQueued = false

/** Called (at most once per frame) when strips or waveforms got more data. */
export function onStripsChanged(fn: () => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

function notify(): void {
  if (notifyQueued) return
  notifyQueued = true
  requestAnimationFrame(() => {
    notifyQueued = false
    for (const fn of listeners) fn()
  })
}

export const STRIP_HEIGHT = 54

export function filmStrip(m: MediaInfo): FilmStrip | null {
  if (m.kind === 'audio' || !m.hasVideo) return null
  let s = strips.get(m.id)
  if (s) return s
  const height = STRIP_HEIGHT * 2
  const width = Math.max(8, Math.round((height * m.width) / Math.max(1, m.height)))
  if (m.kind === 'image') {
    const bmp = mediaHandles(m.id).image
    s = { step: Infinity, width, height, frames: [null] }
    strips.set(m.id, s)
    if (bmp) void createImageBitmap(bmp, { resizeWidth: width, resizeHeight: height, resizeQuality: 'medium' }).then((b) => ((s!.frames[0] = b), notify()))
    return s
  }
  const step = Math.min(10, Math.max(0.5, m.duration / 120))
  const count = Math.max(1, Math.ceil(m.duration / step))
  s = { step, width, height, frames: new Array(count).fill(null) }
  strips.set(m.id, s)
  void fillStrip(m, s)
  return s
}

async function fillStrip(m: MediaInfo, s: FilmStrip): Promise<void> {
  const track = mediaHandles(m.id).video
  if (!track || !m.playable) return
  const sink = new CanvasSink(track, { width: s.width, height: s.height, fit: 'cover' })
  const times = s.frames.map((_, i) => Math.min(m.duration - 0.01, i * s.step + s.step / 2))
  let i = 0
  try {
    for await (const wc of sink.canvasesAtTimestamps(times)) {
      if (wc) s.frames[i] = await createImageBitmap(wc.canvas)
      i++
      if (i % 4 === 0) notify()
    }
  } catch (e) {
    console.warn('film strip', e)
  }
  notify()
}

export function waveform(m: MediaInfo): Waveform | null {
  if (!m.hasAudio) return null
  let w = waves.get(m.id)
  if (w) return w
  const rate = 100
  w = { rate, peaks: new Float32Array(Math.max(1, Math.ceil(m.duration * rate))), ready: 0 }
  waves.set(m.id, w)
  void fillWave(m, w)
  return w
}

async function fillWave(m: MediaInfo, w: Waveform): Promise<void> {
  const track = mediaHandles(m.id).audio
  if (!track) return
  const sink = new AudioBufferSink(track)
  let n = 0
  try {
    for await (const wb of sink.buffers()) {
      const b = wb.buffer
      const perPeak = b.sampleRate / w.rate
      const chans = Math.min(2, b.numberOfChannels)
      const data = Array.from({ length: chans }, (_, c) => b.getChannelData(c))
      const first = Math.floor(wb.timestamp * w.rate)
      for (let k = 0; first + k < w.peaks.length; k++) {
        const s0 = Math.floor(k * perPeak)
        if (s0 >= b.length) break
        const s1 = Math.min(b.length, Math.floor((k + 1) * perPeak))
        let peak = 0
        for (let c = 0; c < chans; c++) {
          const d = data[c]
          for (let s = s0; s < s1; s++) {
            const v = d[s] < 0 ? -d[s] : d[s]
            if (v > peak) peak = v
          }
        }
        const idx = first + k
        if (idx >= 0 && peak > w.peaks[idx]) w.peaks[idx] = peak
        w.ready = Math.max(w.ready, idx + 1)
      }
      if (++n % 20 === 0) notify()
    }
  } catch (e) {
    console.warn('waveform', e)
  }
  w.ready = w.peaks.length
  notify()
}

export function forgetStrips(mediaId: string): void {
  strips.get(mediaId)?.frames.forEach((f) => f?.close())
  strips.delete(mediaId)
  waves.delete(mediaId)
}
