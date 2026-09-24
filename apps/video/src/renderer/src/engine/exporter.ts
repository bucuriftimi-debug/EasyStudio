import { AudioBufferSink, AudioBufferSource, CanvasSource, Mp4OutputFormat, Output, StreamTarget, WebMOutputFormat, canEncodeAudio, canEncodeVideo, type StreamTargetChunk } from 'mediabunny'
import { Renderer } from '@easystudio/gpu'
import { mediaHandles } from '../media/media'
import { activeAt, buildScene, ensureBackground, sourceTime, type Composition } from './engine'
import { VideoReader } from './videoReader'

/**
 * Export: the same compositor as the preview draws every frame at the final size on an
 * OffscreenCanvas; the GPU encoder (WebCodecs, via Mediabunny) turns it into H.264 / VP9, the
 * sound of all clips is mixed in 10-second pieces, and the file is written as it is made.
 */

export type ExportFormat = 'mp4' | 'webm'
export type ExportQuality = 'small' | 'medium' | 'high'

export interface ExportSettings {
  format: ExportFormat
  width: number
  height: number
  fps: number
  quality: ExportQuality
}

export interface ExportTarget {
  write(position: number, data: Uint8Array): Promise<void>
}

export interface ExportProgress {
  frame: number
  frames: number
  /** Seconds since the start. */
  elapsed: number
}

/** Bits per pixel per frame for each quality (H.264; VP9 needs a bit less). */
const BPP: Record<ExportQuality, number> = { small: 0.045, medium: 0.085, high: 0.15 }
export const AUDIO_BITRATE = 160_000
const AUDIO_RATE = 48_000
const AUDIO_CHUNK = 10

export function videoBitrate(s: ExportSettings): number {
  const bpp = BPP[s.quality] * (s.format === 'webm' ? 0.8 : 1)
  return Math.round(Math.min(80e6, Math.max(0.8e6, s.width * s.height * s.fps * bpp)))
}

export function estimateBytes(s: ExportSettings, duration: number, hasAudio: boolean): number {
  return ((videoBitrate(s) + (hasAudio ? AUDIO_BITRATE : 0)) * duration) / 8
}

export const hasSound = (comp: Composition) => comp.clips.some((c) => c.media?.hasAudio && c.volume > 0)

export class ExportCancelled extends Error {
  constructor() {
    super('cancelled')
  }
}

/** The same composition at another frame size (everything placed in pixels is scaled). */
export function scaleComposition(comp: Composition, width: number, height: number): Composition {
  const k = Math.min(width / comp.width, height / comp.height)
  if (k === 1 && width === comp.width && height === comp.height) return comp
  const dx = (width - comp.width * k) / 2
  const dy = (height - comp.height * k) / 2
  return {
    ...comp,
    width,
    height,
    clips: comp.clips.map((c) => (c.transform ? { ...c, transform: { ...c.transform, cx: c.transform.cx * k + dx, cy: c.transform.cy * k + dy, sx: c.transform.sx * k, sy: c.transform.sy * k } } : c))
  }
}

/** Can this computer encode these settings? Returns the audio codec to use (or null = no sound possible). */
export async function checkEncoders(s: ExportSettings): Promise<{ video: boolean; audio: 'aac' | 'opus' | null }> {
  const vcodec = s.format === 'mp4' ? 'avc' : 'vp9'
  const video = await canEncodeVideo(vcodec, { width: s.width, height: s.height, bitrate: videoBitrate(s) })
  let audio: 'aac' | 'opus' | null = null
  if (s.format === 'mp4' && (await canEncodeAudio('aac', { numberOfChannels: 2, sampleRate: AUDIO_RATE, bitrate: AUDIO_BITRATE }))) audio = 'aac'
  else if (await canEncodeAudio('opus', { numberOfChannels: 2, sampleRate: AUDIO_RATE, bitrate: AUDIO_BITRATE })) audio = 'opus'
  return { video, audio }
}

/** Mix the sound of every clip for [from, to) — fades, volume and speed included. */
async function mixAudio(comp: Composition, from: number, to: number): Promise<AudioBuffer> {
  const s0 = Math.round(from * AUDIO_RATE)
  const s1 = Math.round(to * AUDIO_RATE)
  const ctx = new OfflineAudioContext(2, Math.max(1, s1 - s0), AUDIO_RATE)
  const t0 = s0 / AUDIO_RATE
  for (const c of comp.clips) {
    if (!c.media?.hasAudio || c.volume <= 0) continue
    const cs = Math.max(from, c.start)
    const ce = Math.min(to, c.start + c.dur)
    if (ce <= cs) continue
    const track = mediaHandles(c.media.id).audio
    if (!track) continue
    const level = (t: number) => {
      let k = 1
      if (c.fadeIn > 0) k = Math.min(k, Math.max(0, (t - c.start) / c.fadeIn))
      if (c.fadeOut > 0) k = Math.min(k, Math.max(0, (c.start + c.dur - t) / c.fadeOut))
      return c.volume * k
    }
    const gain = ctx.createGain()
    gain.connect(ctx.destination)
    const n = Math.max(2, Math.ceil((ce - cs) * 100))
    const curve = new Float32Array(n)
    for (let i = 0; i < n; i++) curve[i] = level(cs + ((ce - cs) * i) / (n - 1))
    gain.gain.setValueCurveAtTime(curve, cs - t0, ce - cs)
    const srcFrom = c.in + (cs - c.start) * c.speed
    const srcTo = c.in + (ce - c.start) * c.speed
    for await (const wb of new AudioBufferSink(track).buffers(srcFrom, srcTo)) {
      const a = Math.max(wb.timestamp, srcFrom)
      const b = Math.min(wb.timestamp + wb.duration, srcTo)
      if (b - a <= 1e-4) continue
      const node = ctx.createBufferSource()
      node.buffer = wb.buffer
      node.playbackRate.value = c.speed
      node.connect(gain)
      node.start(Math.max(0, c.start + (a - c.in) / c.speed - t0), a - wb.timestamp, b - a)
    }
  }
  return ctx.startRendering()
}

export async function exportVideo(comp0: Composition, s: ExportSettings, target: ExportTarget, onProgress: (p: ExportProgress) => void, signal: AbortSignal): Promise<void> {
  const comp = scaleComposition(comp0, s.width, s.height)
  const enc = await checkEncoders(s)
  if (!enc.video) throw new Error('video-encoder')
  const withSound = hasSound(comp) && !!enc.audio

  const canvas = new OffscreenCanvas(s.width, s.height)
  const r = new Renderer(canvas)
  ensureBackground(r)
  const readers = new Map<string, VideoReader>()
  const ready = new Set<string>()

  let writeError: unknown = null
  const writable = new WritableStream<StreamTargetChunk>({
    write: async (chunk) => {
      try {
        await target.write(chunk.position, chunk.data)
      } catch (e) {
        writeError = e
        throw e
      }
    }
  })
  const output = new Output({
    format: s.format === 'mp4' ? new Mp4OutputFormat() : new WebMOutputFormat(),
    target: new StreamTarget(writable, { chunked: true, chunkSize: 4 * 1024 * 1024 })
  })
  const video = new CanvasSource(canvas, { codec: s.format === 'mp4' ? 'avc' : 'vp9', bitrate: videoBitrate(s), keyFrameInterval: 2 })
  output.addVideoTrack(video, { frameRate: s.fps })
  const audio = withSound ? new AudioBufferSource({ codec: enc.audio!, bitrate: AUDIO_BITRATE }) : null
  if (audio) output.addAudioTrack(audio)

  const frames = Math.max(1, Math.round(comp.duration * s.fps))
  const started = performance.now()
  let audioDone = 0
  try {
    await output.start()
    for (let i = 0; i < frames; i++) {
      if (signal.aborted) throw new ExportCancelled()
      const t = i / s.fps
      // Sound goes a little ahead of the picture (the file is written in time order).
      while (audio && audioDone < comp.duration && audioDone < t + 1) {
        const to = Math.min(comp.duration, audioDone + AUDIO_CHUNK)
        await audio.add(await mixAudio(comp, audioDone, to))
        audioDone = to
      }
      for (const c of activeAt(comp, t)) {
        if (!c.transform || c.media?.kind !== 'video' || !c.media.playable) continue
        let rd = readers.get(c.id)
        if (!rd) {
          const track = mediaHandles(c.media.id).video
          if (!track) continue
          rd = new VideoReader(track)
          readers.set(c.id, rd)
        }
        const sample = await rd.sequential(sourceTime(c, t))
        if (!sample) continue
        const f = sample.toVideoFrame()
        r.updateSource(`v:${c.id}`, f, f.displayWidth, f.displayHeight)
        f.close()
        ready.add(`v:${c.id}`)
      }
      const scene = buildScene(comp, t, r, (id) => ready.has(id))
      r.present(scene, { zoom: 1, panX: 0, panY: 0, dpr: 1, bg: [0, 0, 0] })
      await video.add(t, 1 / s.fps)
      if (writeError) throw writeError
      onProgress({ frame: i + 1, frames, elapsed: (performance.now() - started) / 1000 })
    }
    while (audio && audioDone < comp.duration) {
      const to = Math.min(comp.duration, audioDone + AUDIO_CHUNK)
      await audio.add(await mixAudio(comp, audioDone, to))
      audioDone = to
    }
    await output.finalize()
  } catch (e) {
    await output.cancel().catch(() => undefined)
    throw e
  } finally {
    for (const rd of readers.values()) rd.dispose()
    r.dispose()
    r.gl.getExtension('WEBGL_lose_context')?.loseContext()
  }
}
