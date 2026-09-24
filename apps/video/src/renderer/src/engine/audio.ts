import { AudioBufferSink, type InputAudioTrack } from 'mediabunny'

/** One AudioContext for the whole app; its clock drives playback (sound and picture stay in sync). */
let ctx: AudioContext | null = null
let master: GainNode | null = null

export function audioContext(): AudioContext {
  if (!ctx) {
    ctx = new AudioContext({ latencyHint: 'interactive' })
    master = ctx.createGain()
    master.connect(ctx.destination)
  }
  return ctx
}

export function masterGain(): GainNode {
  audioContext()
  return master!
}

/** What one clip contributes to the sound (timeline seconds). */
export interface AudioPart {
  clipId: string
  track: InputAudioTrack
  start: number
  dur: number
  in: number
  speed: number
  /** 0..2 */
  volume: number
  fadeIn: number
  fadeOut: number
}

/**
 * Plays the sound of one clip from a timeline position: decodes ~2 seconds ahead and schedules
 * each decoded buffer on the AudioContext at the right moment.
 */
export class ClipAudio {
  private sink: AudioBufferSink
  private nodes = new Set<AudioBufferSourceNode>()
  private gain: GainNode
  private stopped = false

  constructor(
    private part: AudioPart,
    /** AudioContext time at which timeline time `t0` plays. */
    private ctxAt: (timelineT: number) => number,
    private t0: number,
    private now: () => number
  ) {
    const c = audioContext()
    this.sink = new AudioBufferSink(part.track)
    this.gain = c.createGain()
    this.gain.connect(masterGain())
    this.envelope()
    void this.run()
  }

  /** Volume with fade in / fade out, as automation on the clip's gain. */
  private envelope(): void {
    const p = this.part
    const g = this.gain.gain
    const at = (t: number) => Math.max(this.ctxAt(this.t0), this.ctxAt(t))
    const level = (t: number) => {
      let k = 1
      if (p.fadeIn > 0) k = Math.min(k, Math.max(0, (t - p.start) / p.fadeIn))
      if (p.fadeOut > 0) k = Math.min(k, Math.max(0, (p.start + p.dur - t) / p.fadeOut))
      return p.volume * k
    }
    g.cancelScheduledValues(0)
    g.setValueAtTime(level(Math.max(this.t0, p.start)), at(Math.max(this.t0, p.start)))
    const fadeInEnd = p.start + p.fadeIn
    if (p.fadeIn > 0 && fadeInEnd > this.t0) g.linearRampToValueAtTime(level(fadeInEnd), at(fadeInEnd))
    const fadeOutStart = p.start + p.dur - p.fadeOut
    if (p.fadeOut > 0) {
      if (fadeOutStart > this.t0) g.setValueAtTime(level(fadeOutStart), at(fadeOutStart))
      g.linearRampToValueAtTime(0, at(p.start + p.dur))
    }
  }

  private async run(): Promise<void> {
    const p = this.part
    const c = audioContext()
    const from = Math.max(this.t0, p.start)
    const srcFrom = p.in + (from - p.start) * p.speed
    const srcTo = p.in + p.dur * p.speed
    try {
      for await (const wb of this.sink.buffers(srcFrom, srcTo)) {
        if (this.stopped) break
        // Timeline time of this buffer.
        const tl = p.start + (wb.timestamp - p.in) / p.speed
        // Do not decode too far ahead of what is playing.
        while (!this.stopped && tl - this.now() > 2) await new Promise((r) => setTimeout(r, 100))
        if (this.stopped) break
        // Part of this buffer (source seconds) that belongs to the clip and is not already past.
        let a = Math.max(wb.timestamp, srcFrom)
        const b = Math.min(wb.timestamp + wb.duration, srcTo)
        let startAt = this.ctxAt(p.start + (a - p.in) / p.speed)
        if (startAt < c.currentTime) {
          a += (c.currentTime - startAt) * p.speed
          startAt = c.currentTime
        }
        if (b - a <= 0.001) continue
        const node = c.createBufferSource()
        node.buffer = wb.buffer
        node.playbackRate.value = p.speed
        node.connect(this.gain)
        // offset / duration are in buffer seconds (they already account for playbackRate).
        node.start(startAt, a - wb.timestamp, b - a)
        this.nodes.add(node)
        node.onended = () => this.nodes.delete(node)
      }
    } catch (e) {
      if (!this.stopped) console.warn('audio decode error', e)
    }
  }

  stop(): void {
    this.stopped = true
    for (const n of this.nodes) {
      try {
        n.stop()
      } catch {
        /* not started */
      }
      n.disconnect()
    }
    this.nodes.clear()
    this.gain.disconnect()
  }
}
