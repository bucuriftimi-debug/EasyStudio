import type { LayerTransform } from '@easystudio/core'
import type { AdjustValues } from '@easystudio/gpu'
import type { TextStyle } from '@easystudio/draw'

/**
 * The video project: pure data + pure functions (easy to undo and to test).
 *
 * Tracks (bottom → top for pictures):
 *  - one `main` track: "magnetic" — clips always sit back to back from 0, no gaps;
 *  - `overlay` tracks: pictures on top (picture-in-picture, logos, later text), free placement;
 *  - `audio` tracks: music and voice, free placement.
 */

export type TrackKind = 'main' | 'overlay' | 'audio'

export type TransitionKind = 'dissolve' | 'black' | 'slide' | 'zoom'

/** How a main-track clip enters: it starts `dur` seconds before the previous one ends. */
export interface Transition {
  kind: TransitionKind
  dur: number
}

export interface Look {
  id: string
  /** 0 … 100 */
  amount: number
}

export interface Clip {
  id: string
  mediaId: string
  /** Timeline seconds (on the main track it is recomputed from the order). */
  start: number
  /** Part of the source used, in source seconds (`out` exclusive). Pictures: 0 … how long it shows. */
  in: number
  out: number
  speed: number
  /** 0 … 2 (1 = original). */
  volume: number
  fadeIn: number
  fadeOut: number
  /** Position / size in the frame; null = fit the frame automatically. */
  transform: LayerTransform | null
  /** 0 … 1 */
  opacity: number
  /** Colour sliders (same as EasyStudio Photo). */
  adjust: AdjustValues
  look: Look | null
  transition: Transition | null
  /** Titles: the text and its look (these clips have no media file: `mediaId` is ''). */
  text?: TextStyle
}

export interface Track {
  id: string
  kind: TrackKind
  muted: boolean
  hidden: boolean
  clips: Clip[]
}

export interface Project {
  name: string
  width: number
  height: number
  fps: number
  tracks: Track[]
}

/** What the timeline needs to know about a media file. */
export interface MediaFacts {
  kind: 'video' | 'audio' | 'image'
  duration: number
  hasVideo: boolean
  hasAudio: boolean
}

let seq = 0
export const newId = (p: string) => `${p}${Date.now().toString(36)}${(seq++).toString(36)}`

export const clipDur = (c: Clip) => (c.out - c.in) / c.speed
export const clipEnd = (c: Clip) => c.start + clipDur(c)
export const MIN_CLIP = 0.1
/** Default length of a picture on the timeline. */
export const IMAGE_SECONDS = 5

export function newProject(name: string): Project {
  return {
    name,
    width: 1920,
    height: 1080,
    fps: 30,
    tracks: [{ id: newId('t'), kind: 'main', muted: false, hidden: false, clips: [] }]
  }
}

export const mainTrack = (p: Project) => p.tracks.find((t) => t.kind === 'main')!

export function projectDuration(p: Project): number {
  let d = 0
  for (const t of p.tracks) for (const c of t.clips) d = Math.max(d, clipEnd(c))
  return d
}

export function findClip(p: Project, id: string): { track: Track; clip: Clip; index: number } | null {
  for (const track of p.tracks) {
    const index = track.clips.findIndex((c) => c.id === id)
    if (index >= 0) return { track, clip: track.clips[index], index }
  }
  return null
}

/** Seconds a clip overlaps the previous main-track clip because of its transition. */
export function overlapOf(prev: Clip | undefined, c: Clip): number {
  if (!prev || !c.transition) return 0
  return Math.max(0, Math.min(c.transition.dur, clipDur(c) / 2, clipDur(prev) / 2))
}

/** Main track: starts follow the order, back to back (minus transitions). Other tracks: sorted by start. */
function normalizeTrack(t: Track): Track {
  if (t.kind === 'main') {
    let end = 0
    const clips = t.clips.map((c, i) => {
      const at = i === 0 ? 0 : end - overlapOf(t.clips[i - 1], c)
      const n = c.start === at ? c : { ...c, start: at }
      end = at + clipDur(c)
      return n
    })
    return { ...t, clips }
  }
  return { ...t, clips: [...t.clips].sort((a, b) => a.start - b.start) }
}

function withTrack(p: Project, trackId: string, fn: (t: Track) => Track): Project {
  return { ...p, tracks: p.tracks.map((t) => (t.id === trackId ? normalizeTrack(fn(t)) : t)) }
}

const CLIP_DEFAULTS = { speed: 1, volume: 1, fadeIn: 0, fadeOut: 0, transform: null, opacity: 1, adjust: {}, look: null, transition: null }

export function makeClip(mediaId: string, facts: MediaFacts, start = 0): Clip {
  const len = facts.kind === 'image' ? IMAGE_SECONDS : facts.duration
  return { ...CLIP_DEFAULTS, id: newId('c'), mediaId, start, in: 0, out: len }
}

/** Default length of a title. */
export const TEXT_SECONDS = 3

export function makeTextClip(text: TextStyle, start = 0): Clip {
  return { ...CLIP_DEFAULTS, id: newId('c'), mediaId: '', text, start, in: 0, out: TEXT_SECONDS }
}

/** Titles behave like pictures on the timeline (any length). */
export const TEXT_FACTS: MediaFacts = { kind: 'image', duration: 0, hasVideo: true, hasAudio: false }

/** Fill in fields added by newer versions (projects saved by older versions). */
export function upgradeProject(p: Project): Project {
  return { ...p, tracks: p.tracks.map((t) => normalizeTrack({ ...t, clips: t.clips.map((c) => ({ ...CLIP_DEFAULTS, ...c })) })) }
}

/** Does [start, end) collide with another clip of the track? */
function collides(t: Track, start: number, end: number, ignore?: string): boolean {
  return t.clips.some((c) => c.id !== ignore && start < clipEnd(c) - 1e-6 && end > c.start + 1e-6)
}

/** The track kind a media file goes to by default. */
export const kindFor = (f: MediaFacts): TrackKind => (f.hasVideo ? 'main' : 'audio')

/**
 * Add a clip. Main track: inserted at `index` (default: at the end). Other kinds: at time
 * `start` on the first track of that kind with room (a new track is created when needed).
 */
export function addClip(p: Project, clip: Clip, where: { kind: TrackKind; index?: number; start?: number; trackId?: string }): Project {
  if (where.kind === 'main') {
    const main = mainTrack(p)
    const i = Math.max(0, Math.min(main.clips.length, where.index ?? main.clips.length))
    return withTrack(p, main.id, (t) => ({ ...t, clips: [...t.clips.slice(0, i), clip, ...t.clips.slice(i)] }))
  }
  const start = Math.max(0, where.start ?? 0)
  const c = { ...clip, start }
  const end = start + clipDur(c)
  const candidates = p.tracks.filter((t) => t.kind === where.kind && (!where.trackId || t.id === where.trackId))
  const free = candidates.find((t) => !collides(t, start, end))
  if (free) return withTrack(p, free.id, (t) => ({ ...t, clips: [...t.clips, c] }))
  // New track: overlays go right above the other pictures, audio at the bottom.
  const track: Track = { id: newId('t'), kind: where.kind, muted: false, hidden: false, clips: [c] }
  const tracks = [...p.tracks]
  if (where.kind === 'overlay') {
    const lastVisual = tracks.map((t) => t.kind !== 'audio').lastIndexOf(true)
    tracks.splice(lastVisual + 1, 0, track)
  } else tracks.push(track)
  return { ...p, tracks }
}

export function removeClip(p: Project, id: string): Project {
  const f = findClip(p, id)
  if (!f) return p
  const q = withTrack(p, f.track.id, (t) => ({ ...t, clips: t.clips.filter((c) => c.id !== id) }))
  return dropEmptyTracks(q)
}

/** Empty overlay / audio tracks disappear (the main track always stays). */
export function dropEmptyTracks(p: Project): Project {
  const tracks = p.tracks.filter((t) => t.kind === 'main' || t.clips.length)
  return tracks.length === p.tracks.length ? p : { ...p, tracks }
}

export function updateClip(p: Project, id: string, patch: Partial<Clip>): Project {
  const f = findClip(p, id)
  if (!f) return p
  return withTrack(p, f.track.id, (t) => ({ ...t, clips: t.clips.map((c) => (c.id === id ? { ...c, ...patch } : c)) }))
}

/** Move a main-track clip to another position in the order. */
export function reorderMain(p: Project, id: string, index: number): Project {
  const main = mainTrack(p)
  const from = main.clips.findIndex((c) => c.id === id)
  if (from < 0) return p
  const clips = [...main.clips]
  const [c] = clips.splice(from, 1)
  clips.splice(Math.max(0, Math.min(clips.length, index)), 0, c)
  return withTrack(p, main.id, (t) => ({ ...t, clips }))
}

/**
 * Move a clip of an overlay / audio track in time (and optionally to another track of the same
 * kind). Refused (returns the project unchanged) if it would overlap another clip.
 */
export function moveFree(p: Project, id: string, start: number, trackId?: string): Project {
  const f = findClip(p, id)
  if (!f || f.track.kind === 'main') return p
  const target = trackId ? p.tracks.find((t) => t.id === trackId) : f.track
  if (!target || target.kind !== f.track.kind) return p
  const c = { ...f.clip, start: Math.max(0, start) }
  if (collides(target, c.start, clipEnd(c), id)) return p
  let q = withTrack(p, f.track.id, (t) => ({ ...t, clips: t.clips.filter((x) => x.id !== id) }))
  q = withTrack(q, target.id, (t) => ({ ...t, clips: [...t.clips, c] }))
  return dropEmptyTracks(q)
}

/**
 * Trim one edge. `side` = 'start' moves the beginning (in point), 'end' the end (out point);
 * `delta` is in timeline seconds. Limited by the source (videos) and by neighbours (free tracks).
 */
export function trimClip(p: Project, id: string, side: 'start' | 'end', delta: number, facts: MediaFacts): Project {
  const f = findClip(p, id)
  if (!f) return p
  const c = f.clip
  const srcMax = facts.kind === 'image' ? Infinity : facts.duration
  if (side === 'end') {
    let out = c.out + delta * c.speed
    out = Math.min(srcMax, Math.max(c.in + MIN_CLIP * c.speed, out))
    if (f.track.kind !== 'main') {
      const next = f.track.clips.find((x) => x.start >= clipEnd(c) - 1e-6 && x.id !== id)
      if (next) out = Math.min(out, c.in + (next.start - c.start) * c.speed)
    }
    return updateClip(p, id, { out })
  }
  let inP = c.in + delta * c.speed
  if (facts.kind === 'image') {
    // Pictures have no "source": trimming the start just shortens / lengthens them.
    const len = Math.max(MIN_CLIP, c.out - c.in - delta * c.speed)
    const start = f.track.kind === 'main' ? c.start : Math.max(0, clipEnd(c) - len / c.speed)
    return updateClip(p, id, { in: 0, out: len, start })
  }
  inP = Math.max(0, Math.min(c.out - MIN_CLIP * c.speed, inP))
  let start = c.start + (inP - c.in) / c.speed
  if (f.track.kind !== 'main') {
    const prev = [...f.track.clips].reverse().find((x) => clipEnd(x) <= c.start + 1e-6 && x.id !== id)
    const minStart = prev ? clipEnd(prev) : 0
    if (start < minStart) {
      inP += (minStart - start) * c.speed
      start = minStart
    }
  }
  return updateClip(p, id, { in: inP, start })
}

/** Cut a clip in two at timeline time `t`. Returns the project and the id of the right part. */
export function splitClip(p: Project, id: string, t: number): { project: Project; rightId: string | null } {
  const f = findClip(p, id)
  if (!f) return { project: p, rightId: null }
  const c = f.clip
  if (t <= c.start + MIN_CLIP || t >= clipEnd(c) - MIN_CLIP) return { project: p, rightId: null }
  const cut = c.in + (t - c.start) * c.speed
  const left: Clip = { ...c, out: cut, fadeOut: 0 }
  const right: Clip = { ...c, id: newId('c'), in: cut, start: t, fadeIn: 0 }
  const project = withTrack(p, f.track.id, (tr) => ({ ...tr, clips: tr.clips.flatMap((x) => (x.id === id ? [left, right] : [x])) }))
  return { project, rightId: right.id }
}

/** Clip of the main track under time t (for "split at playhead" with nothing selected). */
export function mainClipAt(p: Project, t: number): Clip | null {
  return mainTrack(p).clips.find((c) => t >= c.start && t < clipEnd(c)) ?? null
}

/** Main-track insertion index for a drop at time t (before the clip whose middle is after t). */
export function mainIndexAt(p: Project, t: number): number {
  const clips = mainTrack(p).clips
  const i = clips.findIndex((c) => t < c.start + clipDur(c) / 2)
  return i < 0 ? clips.length : i
}

/** Times a moving edge can snap to: 0, the playhead and every clip edge (except the moving clip). */
export function snapPoints(p: Project, playhead: number, ignore?: string): number[] {
  const pts = [0, playhead]
  for (const t of p.tracks) for (const c of t.clips) if (c.id !== ignore) pts.push(c.start, clipEnd(c))
  return pts
}

export function snap(t: number, points: number[], tolerance: number): number {
  let best = t
  let bestD = tolerance
  for (const q of points) {
    const d = Math.abs(q - t)
    if (d < bestD) {
      best = q
      bestD = d
    }
  }
  return best
}
