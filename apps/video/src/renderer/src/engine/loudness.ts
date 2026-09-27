import { AudioBufferSink } from 'mediabunny'
import { mediaHandles } from '../media/media'
import { clipDur, type Clip } from '../state/project'

/** Loudness is measured in steps of this many seconds (of the clip's timeline). */
export const LOUDNESS_STEP = 0.05

/** Loudness (dBFS, loudest channel) of a clip, one value per LOUDNESS_STEP of its own timeline. */
export async function clipLoudness(c: Clip): Promise<Float32Array> {
  const track = mediaHandles(c.mediaId).audio
  const n = Math.max(1, Math.ceil(clipDur(c) / LOUDNESS_STEP))
  const sum = new Float64Array(n)
  const count = new Float64Array(n)
  if (!track) return new Float32Array(n).fill(-100)
  for await (const wb of new AudioBufferSink(track).buffers(c.in, c.out)) {
    const b = wb.buffer
    const rate = b.sampleRate
    const chans = Array.from({ length: b.numberOfChannels }, (_, i) => b.getChannelData(i))
    for (let s = 0; s < b.length; s++) {
      const src = wb.timestamp + s / rate
      if (src < c.in || src >= c.out) continue
      const i = Math.min(n - 1, Math.floor((src - c.in) / c.speed / LOUDNESS_STEP))
      let v = 0
      for (const ch of chans) v = Math.max(v, Math.abs(ch[s]))
      sum[i] += v * v
      count[i]++
    }
  }
  const db = new Float32Array(n)
  for (let i = 0; i < n; i++) db[i] = count[i] ? 10 * Math.log10(sum[i] / count[i] + 1e-10) : -100
  return db
}
