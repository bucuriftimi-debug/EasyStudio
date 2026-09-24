import { VideoSampleSink, type InputVideoTrack, type VideoSample } from 'mediabunny'

/**
 * Decoded frames of one clip. Two ways to ask:
 *  - `frameFor(t)` while playing: frames are decoded ahead in order (hardware decoder) and the
 *    one showing at `t` is returned — never waits, so the picture never stutters the clock;
 *  - `exact(t)` when paused / scrubbing / exporting: waits for exactly the frame at `t`.
 */
export class VideoReader {
  private sink: VideoSampleSink
  private iter: AsyncGenerator<VideoSample, void, unknown> | null = null
  private queue: VideoSample[] = []
  private gen = 0
  /** The decode-ahead loop currently running (awaitable). */
  private pumpP: Promise<void> | null = null
  private ended = false
  private iterFrom = 0
  /** Timestamp of the frame last handed out (to upload only when the picture changes). */
  private shown = NaN
  private scrubToken = 0
  private static readonly AHEAD = 5

  constructor(track: InputVideoTrack) {
    this.sink = new VideoSampleSink(track)
  }

  private closeQueue(): void {
    for (const s of this.queue) s.close()
    this.queue = []
  }

  private restart(t: number): void {
    this.gen++
    void this.iter?.return()
    this.closeQueue()
    this.iter = this.sink.samples(Math.max(0, t))
    this.iterFrom = t
    this.ended = false
    this.shown = NaN
    void this.pump()
  }

  /** Decode ahead until the queue is full. Calling it while it runs returns the same promise. */
  private pump(): Promise<void> {
    if (!this.pumpP) this.pumpP = this.fill().finally(() => (this.pumpP = null))
    return this.pumpP
  }

  private async fill(): Promise<void> {
    const gen = this.gen
    try {
      while (this.iter && gen === this.gen && !this.ended && this.queue.length < VideoReader.AHEAD) {
        const r = await this.iter.next()
        if (gen !== this.gen) {
          if (!r.done) r.value.close()
          return
        }
        if (r.done) this.ended = true
        else this.queue.push(r.value)
      }
    } catch (e) {
      console.warn('decode error', e)
      this.ended = true
    }
    // A restart happened while this loop was waiting: fill for the new position.
    if (gen !== this.gen) {
      await Promise.resolve()
      return this.fill()
    }
  }

  /**
   * Playback path. Returns the frame to show at `t` if it differs from the one shown last,
   * otherwise null (keep the current picture). Never waits.
   */
  frameFor(t: number): VideoSample | null {
    const last = this.queue[this.queue.length - 1]
    const behind = t < this.iterFrom - 1e-3
    const farAhead = this.queue.length > 0 ? t > last.timestamp + 1.5 : !this.pumpP && !this.ended && this.iter !== null && t > this.iterFrom + 1.5
    if (!this.iter || behind || farAhead) this.restart(t)
    // Drop frames that are over: keep the latest frame that has started.
    while (this.queue.length >= 2 && this.queue[1].timestamp <= t + 1e-4) this.queue.shift()!.close()
    void this.pump()
    const cur = this.queue[0]
    if (!cur || cur.timestamp > t + 0.05) return null
    if (cur.timestamp === this.shown) return null
    this.shown = cur.timestamp
    return cur
  }

  /**
   * Exact frame at `t` (paused, scrubbing). Only the newest request wins: older ones return
   * null so a fast scrub does not pile up work.
   */
  async exact(t: number): Promise<VideoSample | null> {
    const token = ++this.scrubToken
    const s = await this.sink.getSample(Math.max(0, t))
    if (token !== this.scrubToken) {
      s?.close()
      return null
    }
    this.shown = NaN
    return s
  }

  /**
   * Export path: frames are requested in increasing time; decode in order and wait until the
   * frame at `t` is available. The returned sample stays owned by the reader.
   */
  async sequential(t: number): Promise<VideoSample | null> {
    if (!this.iter || t < this.iterFrom - 1e-3) this.restart(t)
    for (;;) {
      while (this.queue.length >= 2 && this.queue[1].timestamp <= t + 1e-4) this.queue.shift()!.close()
      const next = this.queue[1]
      if (next || this.ended) return this.queue[0] ?? null
      // Waits for the decoder (the pump fills the queue or reaches the end).
      await this.pump()
    }
  }

  dispose(): void {
    this.gen++
    void this.iter?.return()
    this.iter = null
    this.closeQueue()
  }
}
