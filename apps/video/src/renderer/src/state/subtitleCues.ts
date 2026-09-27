import type { TextStyle } from '@easystudio/draw'
import { makeTextClip, newId, type Clip, type Project, type Track } from './project'

/** A subtitle: what is said between two moments of the video (seconds). */
export interface Cue {
  start: number
  end: number
  text: string
}

/** The shortest time a subtitle stays on screen. */
const MIN_CUE = 0.7

/**
 * Split what the speech recognition heard into short, readable subtitles: at most `maxChars`
 * characters each (the text wraps to two lines), with the time shared out by length. Cues do not
 * overlap and last at least MIN_CUE seconds.
 */
export function splitCues(chunks: Cue[], maxChars = 42): Cue[] {
  const out: Cue[] = []
  for (const c of chunks) {
    const words = c.text.replace(/\s+/g, ' ').trim().split(' ').filter(Boolean)
    if (!words.length) continue
    // As many pieces as needed, of about the same length; after a comma or a full stop is a
    // good place to cut.
    const n = Math.ceil(words.join(' ').length / maxChars)
    const target = words.join(' ').length / n
    const pieces: string[] = []
    let cur = ''
    for (const w of words) {
      const next = cur ? `${cur} ${w}` : w
      const endsPhrase = /[,.;:!?]$/.test(cur)
      const tooLong = next.length > maxChars || next.length > target * 1.15
      if (cur && (next.length > maxChars || (pieces.length < n - 1 && (tooLong || (endsPhrase && cur.length >= target * 0.6))))) {
        pieces.push(cur)
        cur = w
      } else cur = next
    }
    if (cur) pieces.push(cur)
    const total = pieces.reduce((n, p) => n + p.length, 0)
    const dur = Math.max(0, c.end - c.start)
    let t = c.start
    for (const p of pieces) {
      const d = (dur * p.length) / total
      out.push({ start: t, end: t + d, text: p })
      t += d
    }
  }
  out.sort((a, b) => a.start - b.start)
  for (let i = 0; i < out.length; i++) {
    const next = out[i + 1]
    out[i].end = Math.max(out[i].end, out[i].start + MIN_CUE)
    if (next && out[i].end > next.start) out[i].end = Math.max(out[i].start + 0.2, next.start)
  }
  return out.filter((c) => c.end - c.start > 0.1)
}

/** Put a long subtitle on two balanced lines. */
export function twoLines(text: string, maxLine = 26): string {
  if (text.length <= maxLine) return text
  const words = text.split(' ')
  let best = text
  let bestDiff = Infinity
  for (let i = 1; i < words.length; i++) {
    const a = words.slice(0, i).join(' ')
    const b = words.slice(i).join(' ')
    const diff = Math.abs(a.length - b.length)
    if (diff < bestDiff) {
      bestDiff = diff
      best = `${a}\n${b}`
    }
  }
  return best
}

/** A new track with one title clip per cue, above every picture, near the bottom of the frame. */
export function addSubtitleTrack(p: Project, cues: Cue[], style: TextStyle): Project {
  const cy = Math.round(p.height * (p.height > p.width ? 0.78 : 0.86))
  const clips: Clip[] = cues.map((c) => ({
    ...makeTextClip({ ...style, text: twoLines(c.text) }, c.start),
    out: Math.max(0.2, c.end - c.start),
    transform: { cx: p.width / 2, cy, sx: 1, sy: 1, rot: 0 }
  }))
  const track: Track = { id: newId('t'), kind: 'overlay', muted: false, hidden: false, clips }
  const tracks = [...p.tracks]
  const lastVisual = tracks.map((t) => t.kind !== 'audio').lastIndexOf(true)
  tracks.splice(lastVisual + 1, 0, track)
  return { ...p, tracks }
}
