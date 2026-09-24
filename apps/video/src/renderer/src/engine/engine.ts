import { docToLayerUVMatrix, type LayerTransform } from '@easystudio/core'
import { NEUTRAL_EFFECTS, Renderer, type BlendMode, type EffectParams, type RenderLayer, type RenderScene } from '@easystudio/gpu'
import { mediaHandles, type MediaInfo } from '../media/media'
import { audioContext, ClipAudio, type AudioPart } from './audio'
import { VideoReader } from './videoReader'

/**
 * The playback engine. It knows nothing about the UI: it gets a `Composition` (what plays
 * when, and how it looks) and draws the frame at the current time on a canvas with the GPU
 * renderer, while the AudioContext plays the sound and keeps the time.
 */

export type TransitionKind = 'dissolve' | 'black' | 'slide' | 'zoom'

/** A transition as played: `dur` = how long the two clips overlap. */
export interface CompTransition {
  kind: TransitionKind
  dur: number
}

/** A title drawn to a canvas; `w` × `h` is its size in frame pixels (the canvas may be sharper). */
export interface CompTitle {
  key: string
  canvas: OffscreenCanvas
  w: number
  h: number
}

export interface CompClip {
  id: string
  /** Null for titles. */
  media: MediaInfo | null
  title?: CompTitle
  /** Entering / leaving transitions (main track). */
  transIn: CompTransition | null
  transOut: CompTransition | null
  /** Timeline seconds. */
  start: number
  dur: number
  /** Where the clip starts inside the source file (seconds). */
  in: number
  speed: number
  /** Stacking order of the picture (higher = on top). */
  z: number
  /** Box = media display size, placed in frame pixels. Null for sound-only clips. */
  transform: LayerTransform | null
  opacity: number
  blend: BlendMode
  effects: EffectParams
  /** Sound: 0 = muted. */
  volume: number
  fadeIn: number
  fadeOut: number
}

export interface Composition {
  width: number
  height: number
  fps: number
  duration: number
  clips: CompClip[]
}

export const EMPTY_COMP: Composition = { width: 1920, height: 1080, fps: 30, duration: 0, clips: [] }

/** Transform that fits a media box inside the frame (the default for new clips). */
export function fitTransform(mediaW: number, mediaH: number, frameW: number, frameH: number, cover = false): LayerTransform {
  const k = cover ? Math.max(frameW / mediaW, frameH / mediaH) : Math.min(frameW / mediaW, frameH / mediaH)
  return { cx: frameW / 2, cy: frameH / 2, sx: k, sy: k, rot: 0 }
}

const BG_ID = 'bg:black'

/** Clips visible (or audible) at time t. */
function activeAt(comp: Composition, t: number): CompClip[] {
  return comp.clips.filter((c) => t >= c.start - 1e-6 && t < c.start + c.dur - 1e-6)
}

const sourceTime = (c: CompClip, t: number) => c.in + (t - c.start) * c.speed
const clamp01 = (v: number) => Math.max(0, Math.min(1, v))
const smooth = (v: number) => v * v * (3 - 2 * v)

/** Opacity and placement of a clip at time t, including its transitions. */
function withTransitions(c: CompClip, t: number, W: number): { opacity: number; tr: LayerTransform } {
  let opacity = c.opacity
  let tr = c.transform!
  if (c.transIn && c.transIn.dur > 0) {
    const p = smooth(clamp01((t - c.start) / c.transIn.dur))
    if (c.transIn.kind === 'dissolve') opacity *= p
    else if (c.transIn.kind === 'black') opacity *= clamp01(2 * p - 1)
    else if (c.transIn.kind === 'slide') tr = { ...tr, cx: tr.cx + (1 - p) * W }
    else if (c.transIn.kind === 'zoom') {
      const k = 1 + 0.35 * (1 - p)
      tr = { ...tr, sx: tr.sx * k, sy: tr.sy * k }
      opacity *= p
    }
  }
  if (c.transOut && c.transOut.dur > 0) {
    const p = smooth(clamp01(1 - (c.start + c.dur - t) / c.transOut.dur))
    if (c.transOut.kind === 'black') opacity *= clamp01(1 - 2 * p)
    else if (c.transOut.kind === 'slide') tr = { ...tr, cx: tr.cx - p * W }
  }
  return { opacity, tr }
}

export { activeAt, sourceTime }

/** The black picture behind everything. */
export function ensureBackground(r: Renderer): void {
  if (r.hasSource(BG_ID)) return
  const black = new OffscreenCanvas(1, 1)
  const g = black.getContext('2d')!
  g.fillStyle = '#000'
  g.fillRect(0, 0, 1, 1)
  r.uploadSource(BG_ID, black, 1, 1)
}

function backgroundLayer(comp: Composition): RenderLayer {
  const W = comp.width
  const H = comp.height
  return {
    id: BG_ID,
    sourceId: BG_ID,
    visible: true,
    opacity: 1,
    blend: 'normal',
    docToLayer: docToLayerUVMatrix({ cx: W / 2, cy: H / 2, sx: 1, sy: 1, rot: 0 }, W, H),
    effects: NEUTRAL_EFFECTS
  }
}

/**
 * Layer for a clip. The texture holds the frame as stored in the file; phone videos also
 * carry a rotation, which is added to the clip's own rotation here.
 */
function clipLayer(comp: Composition, c: CompClip, sourceId: string, texW: number, texH: number, t: number): RenderLayer {
  const { opacity, tr } = withTransitions(c, t, comp.width)
  const rot = c.media?.kind === 'video' ? c.media.rotation : 0
  return {
    id: `L:${c.id}`,
    sourceId,
    visible: opacity > 0,
    opacity,
    blend: c.blend,
    docToLayer: docToLayerUVMatrix({ ...tr, rot: tr.rot + rot }, texW, texH),
    effects: c.effects
  }
}

/**
 * The frame at time t as a GPU scene (preview and export use the same code). Titles and
 * pictures are uploaded here; video frames must already be uploaded as `v:<clip id>`
 * (`hasVideo` says which ones are).
 */
export function buildScene(comp: Composition, t: number, r: Renderer, hasVideo: (sourceId: string) => boolean): RenderScene {
  const active = activeAt(comp, t).filter((c) => c.transform)
  active.sort((a, b) => a.z - b.z || a.start - b.start)
  const layers: RenderLayer[] = [backgroundLayer(comp)]
  for (const c of active) {
    let sourceId: string
    let w: number
    let h: number
    if (c.title) {
      sourceId = `txt:${c.title.key}`
      if (!r.hasSource(sourceId)) r.uploadSource(sourceId, c.title.canvas, c.title.canvas.width, c.title.canvas.height)
      w = c.title.w
      h = c.title.h
    } else if (!c.media) continue
    else if (c.media.kind === 'image') {
      sourceId = `img:${c.media.id}`
      const bmp = mediaHandles(c.media.id).image
      if (!bmp) continue
      if (!r.hasSource(sourceId)) r.uploadSource(sourceId, bmp, bmp.width, bmp.height)
      w = bmp.width
      h = bmp.height
    } else {
      sourceId = `v:${c.id}`
      if (!hasVideo(sourceId)) continue
      w = c.media.rotation % 180 ? c.media.height : c.media.width
      h = c.media.rotation % 180 ? c.media.width : c.media.height
    }
    layers.push(clipLayer(comp, c, sourceId, w, h, t))
  }
  return { width: comp.width, height: comp.height, layers }
}

export class Engine {
  private comp: Composition = EMPTY_COMP
  private renderer: Renderer | null = null
  private canvas: HTMLCanvasElement | null = null
  private readers = new Map<string, VideoReader>()
  private audio: ClipAudio[] = []
  private uploaded = new Set<string>()
  private raf = 0
  private t = 0
  private playing = false
  /** Playback anchor: timeline time `t0` is heard at AudioContext time `c0`. */
  private t0 = 0
  private c0 = 0
  private listeners = new Set<(t: number, playing: boolean) => void>()
  private needsDraw = true
  private pendingExact = 0

  /* ------------------------------ setup ------------------------------ */

  attach(canvas: HTMLCanvasElement): void {
    this.canvas = canvas
    this.renderer = new Renderer(canvas)
    ensureBackground(this.renderer)
    this.uploaded.clear()
    this.requestDraw(true)
  }

  detach(): void {
    cancelAnimationFrame(this.raf)
    this.renderer?.dispose()
    this.renderer = null
    this.canvas = null
  }

  get gpuName(): string {
    return this.renderer?.gpuName() ?? ''
  }

  onChange(fn: (t: number, playing: boolean) => void): () => void {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  private emit(): void {
    for (const fn of this.listeners) fn(this.t, this.playing)
  }

  setComposition(comp: Composition): void {
    this.comp = comp
    // Readers of clips that no longer exist.
    const ids = new Set(comp.clips.map((c) => c.id))
    for (const [id, r] of this.readers) {
      if (!ids.has(id)) {
        r.dispose()
        this.readers.delete(id)
      }
    }
    // GPU memory of titles / pictures / clips that are gone.
    if (this.renderer) {
      const sources = new Set([BG_ID])
      const layers = new Set<string>()
      for (const c of comp.clips) {
        layers.add(`L:${c.id}`)
        if (c.title) sources.add(`txt:${c.title.key}`)
        else if (c.media?.kind === 'image') sources.add(`img:${c.media.id}`)
        else sources.add(`v:${c.id}`)
      }
      this.renderer.retain(sources, layers)
      for (const id of [...this.uploaded]) if (!sources.has(id)) this.uploaded.delete(id)
    }
    if (this.t > comp.duration) this.t = comp.duration
    // Restart the sound only when something that is heard changed (not for colour sliders).
    const sig = Engine.audioSignature(comp)
    if (this.playing && sig !== this.audioSig) this.restartAudio()
    this.audioSig = sig
    this.requestDraw(true)
  }

  private audioSig = ''

  private static audioSignature(comp: Composition): string {
    return comp.clips
      .filter((c) => c.media?.hasAudio && c.volume > 0)
      .map((c) => [c.id, c.start, c.dur, c.in, c.speed, c.volume, c.fadeIn, c.fadeOut].join(','))
      .join(';')
  }

  get time(): number {
    return this.t
  }

  get isPlaying(): boolean {
    return this.playing
  }

  get duration(): number {
    return this.comp.duration
  }

  /* ------------------------------ transport ------------------------------ */

  async play(): Promise<void> {
    if (this.playing || this.comp.duration <= 0) return
    const ctx = audioContext()
    if (ctx.state !== 'running') await ctx.resume()
    if (this.t >= this.comp.duration - 1 / this.comp.fps) this.t = 0
    this.playing = true
    this.anchor(this.t)
    this.restartAudio()
    this.loop()
    this.emit()
  }

  pause(): void {
    if (!this.playing) return
    this.t = this.clockTime()
    this.playing = false
    this.stopAudio()
    cancelAnimationFrame(this.raf)
    this.requestDraw(true)
    this.emit()
  }

  toggle(): void {
    if (this.playing) this.pause()
    else void this.play()
  }

  seek(t: number): void {
    this.t = Math.max(0, Math.min(this.comp.duration, t))
    if (this.playing) {
      this.anchor(this.t)
      this.restartAudio()
    } else this.requestDraw(true)
    this.emit()
  }

  /** Step one frame (arrow keys). */
  step(frames: number): void {
    if (this.playing) this.pause()
    const f = 1 / this.comp.fps
    this.seek(Math.round(this.t / f) * f + frames * f)
  }

  private anchor(t: number): void {
    const ctx = audioContext()
    this.t0 = t
    // A small lead so the first sound buffers are scheduled in time.
    this.c0 = ctx.currentTime + 0.08
  }

  /** Current timeline time from the audio clock (minus what the speakers have not played yet). */
  private clockTime(): number {
    const ctx = audioContext()
    const lag = (ctx.outputLatency || 0) + (ctx.baseLatency || 0)
    return Math.max(0, this.t0 + (ctx.currentTime - this.c0 - lag))
  }

  private restartAudio(): void {
    this.stopAudio()
    const t0 = this.t
    const ctxAt = (tl: number) => this.c0 + (tl - this.t0)
    for (const c of this.comp.clips) {
      if (!c.media || c.volume <= 0 || !c.media.hasAudio || c.start + c.dur <= t0) continue
      const track = mediaHandles(c.media.id).audio
      if (!track) continue
      const part: AudioPart = { clipId: c.id, track, start: c.start, dur: c.dur, in: c.in, speed: c.speed, volume: c.volume, fadeIn: c.fadeIn, fadeOut: c.fadeOut }
      this.audio.push(new ClipAudio(part, ctxAt, t0, () => this.clockTime()))
    }
  }

  private stopAudio(): void {
    for (const a of this.audio) a.stop()
    this.audio = []
  }

  private loop = (): void => {
    if (!this.playing) return
    this.t = this.clockTime()
    if (this.t >= this.comp.duration) {
      this.t = this.comp.duration
      this.playing = false
      this.stopAudio()
      this.draw(false)
      this.emit()
      return
    }
    this.draw(true)
    this.emit()
    this.raf = requestAnimationFrame(this.loop)
  }

  /* ------------------------------ drawing ------------------------------ */

  /** Redraw when paused (after a seek or an edit); exact frames are fetched first. */
  requestDraw(exact = false): void {
    if (this.playing) return
    this.needsDraw = true
    if (exact) void this.drawExact()
    else requestAnimationFrame(() => this.needsDraw && this.draw(false))
  }

  private reader(c: CompClip): VideoReader | null {
    let r = this.readers.get(c.id)
    if (!r) {
      if (!c.media) return null
      const track = mediaHandles(c.media.id).video
      if (!track || !c.media.playable) return null
      r = new VideoReader(track)
      this.readers.set(c.id, r)
    }
    return r
  }

  private upload(id: string, frame: VideoFrame): void {
    // The visible size, not the coded one: 1080p H.264 is stored as 1920×1088.
    this.renderer?.updateSource(id, frame, frame.displayWidth, frame.displayHeight)
    this.uploaded.add(id)
  }

  /** Paused: fetch the exact frame of every visible clip, then draw. */
  private async drawExact(): Promise<void> {
    const token = ++this.pendingExact
    const t = this.t
    const visible = activeAt(this.comp, t).filter((c) => c.transform && c.media?.kind === 'video')
    const frames = await Promise.all(
      visible.map(async (c) => {
        const s = await this.reader(c)?.exact(sourceTime(c, t))
        return [c, s] as const
      })
    )
    if (token !== this.pendingExact || !this.renderer) {
      for (const [, s] of frames) s?.close()
      return
    }
    for (const [c, s] of frames) {
      if (!s) continue
      const f = s.toVideoFrame()
      this.upload(`v:${c.id}`, f)
      f.close()
      s.close()
    }
    this.draw(false)
  }

  private draw(playing: boolean): void {
    this.needsDraw = false
    const r = this.renderer
    const canvas = this.canvas
    if (!r || !canvas) return
    const t = this.t
    if (playing) {
      // Newest decoded frame of every visible video clip (never waits).
      for (const c of activeAt(this.comp, t)) {
        if (!c.transform || c.media?.kind !== 'video') continue
        const s = this.reader(c)?.frameFor(sourceTime(c, t))
        if (s) {
          const f = s.toVideoFrame()
          this.upload(`v:${c.id}`, f)
          f.close()
          this.stats.videoFrames++
        }
      }
    }
    const scene = buildScene(this.comp, t, r, (id) => this.uploaded.has(id))
    this.lastScene = scene
    this.stats.draws++
    const cw = canvas.width
    const ch = canvas.height
    const zoom = Math.min(cw / scene.width, ch / scene.height)
    r.present(scene, { zoom, panX: (cw - scene.width * zoom) / 2, panY: (ch - scene.height * zoom) / 2, dpr: 1, bg: [0.055, 0.059, 0.071] })
  }

  /** The last composed scene (tests). */
  lastScene: RenderScene | null = null
  /** Counters for performance checks: frames drawn, new video frames shown. */
  stats = { draws: 0, videoFrames: 0 }

  /** Resize the drawing buffer to the element (device pixels). */
  resize(w: number, h: number): void {
    if (!this.canvas) return
    this.canvas.width = Math.max(1, Math.round(w))
    this.canvas.height = Math.max(1, Math.round(h))
    this.draw(false)
  }
}

export const engine = new Engine()
