import i18next from 'i18next'
import { create } from 'zustand'
import { createHistory, pushHistory, redo as hRedo, replacePresent, undo as hUndo, type History } from '@easystudio/core'
import { toEffectParams } from '@easystudio/gpu'
import { fontEpoch, measureText, renderText, type TextStyle } from '@easystudio/draw'
import { engine, fitTransform, type CompClip, type CompTitle, type Composition } from '../engine/engine'
import type { MediaInfo } from '../media/media'
import * as P from './project'
import { toast, useVideo } from './store'

/**
 * The editing session: project history (undo / redo), selection, and turning the project into
 * the engine's `Composition` whenever it changes.
 */

const t = (k: string, o?: Record<string, unknown>) => i18next.t(k, o) as string

export interface EditorState {
  hist: History<P.Project>
  savedProject: P.Project | null
  filePath: string | null
  gestureBase: P.Project | null
  selectedClip: string | null
  /** 'timeline' = the player shows the project; 'media' = it previews a library item. */
  playerMode: 'timeline' | 'media'
  /** Timeline zoom: pixels per second. */
  pps: number
  snapping: boolean
}

export const useEditor = create<EditorState>(() => ({
  // No name yet: shown as "My video" in the current language (see projectName).
  hist: createHistory(P.newProject(''), 'new'),
  savedProject: null,
  filePath: null,
  gestureBase: null,
  selectedClip: null,
  playerMode: 'timeline',
  pps: 60,
  snapping: true
}))

const set = useEditor.setState
const get = useEditor.getState

export const getProject = () => get().hist.present.state
/** The project's name, or "My video" (in the current language) while it has none. */
export const projectName = (p: P.Project) => p.name || (i18next.t('app.untitled') as string)
export const useProject = () => useEditor((s) => s.hist.present.state)
export const isDirty = (s: EditorState = get()) => s.hist.present.state !== s.savedProject && (s.savedProject !== null || P.projectDuration(s.hist.present.state) > 0)

export function mediaById(id: string): MediaInfo | undefined {
  return useVideo.getState().media.find((m) => m.id === id)
}

export function facts(m: MediaInfo): P.MediaFacts {
  return { kind: m.kind, duration: m.duration, hasVideo: m.hasVideo, hasAudio: m.hasAudio }
}

/* ------------------------------ history ------------------------------ */

export function commit(label: string, fn: (p: P.Project) => P.Project): void {
  const s = get()
  if (s.gestureBase) endGesture(label)
  const cur = get().hist
  const next = fn(cur.present.state)
  if (next === cur.present.state) return
  set({ hist: pushHistory(cur, next, label) })
}

export function beginGesture(): void {
  if (!get().gestureBase) set({ gestureBase: getProject() })
}

/** Live change during a drag: shown right away, recorded once at `endGesture`. */
export function live(fn: (p: P.Project) => P.Project): void {
  const { hist, gestureBase } = get()
  if (!gestureBase) return commit('', fn)
  const next = fn(gestureBase)
  if (next !== hist.present.state) set({ hist: replacePresent(hist, next) })
}

export function endGesture(label: string): void {
  const { hist, gestureBase } = get()
  if (!gestureBase) return
  const cur = hist.present.state
  set({ gestureBase: null })
  if (cur === gestureBase) return
  set({ hist: pushHistory(replacePresent(hist, gestureBase), cur, label) })
}

export function cancelGesture(): void {
  const { hist, gestureBase } = get()
  if (!gestureBase) return
  set({ hist: replacePresent(hist, gestureBase), gestureBase: null })
}

export function undo(): void {
  set({ hist: hUndo(get().hist), gestureBase: null })
}

export function redo(): void {
  set({ hist: hRedo(get().hist), gestureBase: null })
}

/* ------------------------------ composition ------------------------------ */

const titleCache = new Map<string, CompTitle>()

/** A title drawn once per look (and per sharpness), then reused. */
export function titleOf(style: TextStyle, scale = 1): CompTitle {
  const key = `${JSON.stringify(style)}|${scale}|${fontEpoch()}`
  let tt = titleCache.get(key)
  if (!tt) {
    const box = measureText(style)
    tt = { key: String(hashCode(key)), canvas: renderText(style, scale), w: box.w, h: box.h }
    titleCache.set(key, tt)
    if (titleCache.size > 64) titleCache.delete(titleCache.keys().next().value!)
  }
  return tt
}

function hashCode(str: string): number {
  let h = 0
  for (let i = 0; i < str.length; i++) h = (Math.imul(31, h) + str.charCodeAt(i)) | 0
  return h >>> 0
}

/** Where a clip sits in the frame when it has not been moved: pictures fit, titles at the centre. */
export function defaultTransform(c: P.Clip, p: P.Project): { cx: number; cy: number; sx: number; sy: number; rot: number } {
  if (c.text) return { cx: p.width / 2, cy: p.height / 2, sx: 1, sy: 1, rot: 0 }
  const m = mediaById(c.mediaId)
  return m ? fitTransform(m.width, m.height, p.width, p.height) : { cx: p.width / 2, cy: p.height / 2, sx: 1, sy: 1, rot: 0 }
}

/**
 * The project as the engine plays it. `titleScale` draws titles sharper (export at a larger
 * size than the project frame).
 */
export function compose(p: P.Project, titleScale = 1): Composition {
  const clips: CompClip[] = []
  let z = 0
  for (const track of p.tracks) {
    const visual = track.kind !== 'audio'
    if (visual) z++
    track.clips.forEach((c, i) => {
      const m = c.text ? null : mediaById(c.mediaId)
      if (!c.text && !m) return
      const shows = visual && !track.hidden && (!!c.text || !!m?.hasVideo)
      // Transitions only exist on the main track, between neighbours.
      const prev = track.kind === 'main' ? track.clips[i - 1] : undefined
      const next = track.kind === 'main' ? track.clips[i + 1] : undefined
      const inDur = P.overlapOf(prev, c)
      const outDur = next ? P.overlapOf(c, next) : 0
      const hasAudio = !!m?.hasAudio
      clips.push({
        id: c.id,
        media: m ?? null,
        title: c.text ? titleOf(c.text, titleScale) : undefined,
        transIn: inDur > 0 && c.transition ? { kind: c.transition.kind, dur: inDur } : null,
        transOut: outDur > 0 && next?.transition ? { kind: next.transition.kind, dur: outDur } : null,
        start: c.start,
        dur: P.clipDur(c),
        in: c.in,
        speed: c.speed,
        z,
        transform: shows ? (c.transform ?? defaultTransform(c, p)) : null,
        opacity: c.opacity,
        blend: 'normal',
        effects: toEffectParams(c.adjust, c.look?.id, c.look?.amount ?? 100),
        volume: track.muted || !hasAudio ? 0 : c.volume,
        // Sound crossfades with the picture.
        fadeIn: Math.max(c.fadeIn, inDur),
        fadeOut: Math.max(c.fadeOut, outDur)
      })
    })
  }
  return { width: p.width, height: p.height, fps: p.fps, duration: P.projectDuration(p), clips }
}

let timelineTime = 0

/** Rebuild what the engine plays (a font finished loading, …). */
export function recompose(): void {
  if (get().playerMode === 'timeline') engine.setComposition(compose(getProject()))
}

/** Show the project in the player (after previewing a library item). */
export function showTimeline(): void {
  if (get().playerMode === 'timeline') return
  engine.pause()
  set({ playerMode: 'timeline' })
  engine.setComposition(compose(getProject()))
  engine.seek(timelineTime)
}

export function showMediaPreview(comp: Composition): void {
  if (get().playerMode === 'timeline') timelineTime = engine.time
  engine.pause()
  set({ playerMode: 'media' })
  engine.setComposition(comp)
  engine.seek(0)
}

// Every project change reaches the engine (when it is showing the project).
useEditor.subscribe((s, prev) => {
  if (s.playerMode === 'timeline' && (s.hist.present.state !== prev.hist.present.state || s.playerMode !== prev.playerMode)) {
    engine.setComposition(compose(s.hist.present.state))
  }
})
// …and so do media changes (a clip whose file just finished loading).
useVideo.subscribe((s, prev) => {
  if (s.media !== prev.media && get().playerMode === 'timeline') engine.setComposition(compose(getProject()))
})

/* ------------------------------ editing ------------------------------ */

const COMMON_FPS = [24, 25, 30, 50, 60]

/** The first clip decides the frame shape (landscape / portrait) and the frame rate. */
function adoptFormat(p: P.Project, m: MediaInfo): P.Project {
  if (P.projectDuration(p) > 0 || !m.hasVideo) return p
  const portrait = m.height > m.width
  const fps = m.kind === 'video' ? COMMON_FPS.reduce((a, b) => (Math.abs(b - m.fps) < Math.abs(a - m.fps) ? b : a)) : p.fps
  return { ...p, width: portrait ? 1080 : 1920, height: portrait ? 1920 : 1080, fps }
}

/** Add a library item to the timeline: pictures / videos at the end of the main track, sound at the playhead. */
export function addToTimeline(mediaId: string, where?: { kind: P.TrackKind; index?: number; start?: number; trackId?: string }): string | null {
  const m = mediaById(mediaId)
  if (!m) return null
  if (!m.playable) {
    toast(t('lib.cantPlayShort'), 'error')
    return null
  }
  showTimeline()
  const clip = P.makeClip(m.id, facts(m))
  const w = where ?? (m.hasVideo ? { kind: 'main' as const } : { kind: 'audio' as const, start: engine.time })
  if (w.kind === 'audio' && !m.hasAudio) return null
  commit(t('hist.add'), (p) => P.addClip(adoptFormat(p, m), clip, w))
  set({ selectedClip: clip.id })
  return clip.id
}

export function selectClip(id: string | null): void {
  set({ selectedClip: id })
}

/** Split the selected clip (or the main-track clip) at the playhead. */
export function splitAtPlayhead(): void {
  showTimeline()
  const p = getProject()
  const tm = engine.time
  const sel = get().selectedClip ? P.findClip(p, get().selectedClip!) : null
  const target = sel && tm > sel.clip.start && tm < P.clipEnd(sel.clip) ? sel.clip : P.mainClipAt(p, tm)
  if (!target) return
  const { project, rightId } = P.splitClip(p, target.id, tm)
  if (!rightId) return
  commit(t('hist.split'), () => project)
  set({ selectedClip: rightId })
}

export function deleteSelected(): void {
  const id = get().selectedClip
  if (!id) return
  commit(t('hist.delete'), (p) => P.removeClip(p, id))
  set({ selectedClip: null })
}

export function setZoom(pps: number): void {
  set({ pps: Math.max(4, Math.min(600, pps)) })
}

export function markSaved(path: string | null): void {
  set({ savedProject: getProject(), filePath: path ?? get().filePath })
}

export function loadProject(p: P.Project, path: string | null): void {
  engine.pause()
  set({ hist: createHistory(p, t('hist.open')), savedProject: p, filePath: path, gestureBase: null, selectedClip: null, playerMode: 'timeline' })
  engine.setComposition(compose(p))
  engine.seek(0)
}

/* ------------------------------ titles & format ------------------------------ */

export const FORMATS = [
  { id: '16:9', w: 1920, h: 1080 },
  { id: '9:16', w: 1080, h: 1920 },
  { id: '1:1', w: 1080, h: 1080 },
  { id: '4:5', w: 1080, h: 1350 }
] as const

export const formatOf = (p: P.Project) => FORMATS.find((f) => f.w === p.width && f.h === p.height)?.id ?? null

/** Change the frame shape; clips that were placed by hand keep their relative position. */
export function setFormat(id: string): void {
  const f = FORMATS.find((x) => x.id === id)
  if (!f) return
  commit(t('hist.format'), (p) => {
    if (p.width === f.w && p.height === f.h) return p
    const kx = f.w / p.width
    const ky = f.h / p.height
    const k = Math.min(kx, ky)
    return {
      ...p,
      width: f.w,
      height: f.h,
      tracks: p.tracks.map((tr) => ({
        ...tr,
        clips: tr.clips.map((c) => (c.transform ? { ...c, transform: { ...c.transform, cx: c.transform.cx * kx, cy: c.transform.cy * ky, sx: c.transform.sx * k, sy: c.transform.sy * k } } : c))
      }))
    }
  })
}

/** Add a title at the playhead (on top of the video) and select it. */
export function addTitle(style: TextStyle): string {
  showTimeline()
  const clip = P.makeTextClip(style, engine.time)
  commit(t('hist.addTitle'), (p) => P.addClip(p, clip, { kind: 'overlay', start: engine.time }))
  set({ selectedClip: clip.id })
  return clip.id
}

/** Change fields of one clip, as one undo step (or live inside a gesture). */
export function updateClipLive(id: string, patch: Partial<P.Clip>): void {
  live((p) => P.updateClip(p, id, patch))
}

export function updateClip(id: string, label: string, patch: Partial<P.Clip>): void {
  commit(label, (p) => P.updateClip(p, id, patch))
}
