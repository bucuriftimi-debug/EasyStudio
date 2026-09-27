import { clipDur, findClip, newId, withTrack, type Clip, type Project } from './project'

/**
 * "Cut out pauses": find where someone speaks from the loudness of a clip, then keep only
 * those parts. Pure functions (the loudness itself is measured in engine/loudness.ts).
 */

export interface PauseOptions {
  /** 0…1: higher = quieter sounds also count as pauses. */
  sensitivity: number
  /** Pauses shorter than this (seconds) stay. */
  minPause: number
  /** Kept around every spoken part so words are not cut (seconds). */
  pad: number
}

export const DEFAULT_PAUSES: PauseOptions = { sensitivity: 0.3, minPause: 0.6, pad: 0.15 }

const percentile = (v: Float32Array, q: number) => {
  const s = Float32Array.from(v).sort()
  return s[Math.min(s.length - 1, Math.max(0, Math.floor(q * (s.length - 1))))]
}

/**
 * Loudness level (dB) under which a moment counts as silence: a set distance below the voice
 * (room noise in pauses varies a lot, the voice does not), and always above the quietest parts.
 */
export function silenceLevel(db: Float32Array, sensitivity: number): number {
  const noise = percentile(db, 0.05)
  const voice = percentile(db, 0.9)
  return Math.max(noise + 6, voice - (45 - 30 * sensitivity))
}

/**
 * The spoken parts, in seconds from the start of the measured range. `db` holds one loudness
 * value per `step` seconds.
 */
export function speechRanges(db: Float32Array, step: number, o: PauseOptions): [number, number][] {
  if (!db.length) return []
  const level = silenceLevel(db, o.sensitivity)
  const total = db.length * step
  const loud: [number, number][] = []
  let from = -1
  for (let i = 0; i <= db.length; i++) {
    const on = i < db.length && db[i] > level
    if (on && from < 0) from = i
    if (!on && from >= 0) {
      loud.push([from * step, i * step])
      from = -1
    }
  }
  // Short pauses stay (they belong to the way people talk); padding keeps word edges.
  const out: [number, number][] = []
  for (const [a, b] of loud) {
    const s = Math.max(0, a - o.pad)
    const e = Math.min(total, b + o.pad)
    const last = out[out.length - 1]
    if (last && s - last[1] < o.minPause) last[1] = Math.max(last[1], e)
    else out.push([s, e])
  }
  return out.filter(([a, b]) => b - a >= 0.1)
}

/** Seconds removed by keeping only `ranges` of a `duration`-long clip. */
export const removedSeconds = (ranges: [number, number][], duration: number) => Math.max(0, duration - ranges.reduce((n, [a, b]) => n + (b - a), 0))

/**
 * Replace a clip by its spoken parts (`ranges` in seconds of the clip's own timeline). On the main
 * track the pieces follow each other; on other tracks they are packed from the clip's start.
 */
export function cutPauses(p: Project, clipId: string, ranges: [number, number][]): Project {
  const f = findClip(p, clipId)
  if (!f || !ranges.length) return p
  const c = f.clip
  const dur = clipDur(c)
  const kept = ranges.map(([a, b]) => [Math.max(0, a), Math.min(dur, b)] as [number, number]).filter(([a, b]) => b - a >= 0.1)
  if (!kept.length) return p
  let at = c.start
  const pieces: Clip[] = kept.map(([a, b], i) => {
    const piece: Clip = {
      ...c,
      id: i === 0 ? c.id : newId('c'),
      start: at,
      in: c.in + a * c.speed,
      out: c.in + b * c.speed,
      fadeIn: i === 0 ? c.fadeIn : 0,
      fadeOut: i === kept.length - 1 ? c.fadeOut : 0,
      transition: i === 0 ? c.transition : null
    }
    at += b - a
    return piece
  })
  return withTrack(p, f.track.id, (t) => ({ ...t, clips: t.clips.flatMap((x) => (x.id === clipId ? pieces : [x])) }))
}
