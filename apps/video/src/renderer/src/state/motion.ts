import type { LayerTransform } from '@easystudio/core'

/**
 * Movement over time, for any picture, video or title clip:
 * - keyframes: the place, size, turn and opacity at chosen moments, smoothly blended between;
 * - animations: a ready-made way to enter and leave (fade, rise, pop…).
 * Pure functions, shared by the player, the export and the editor.
 */

export interface Keyframe {
  /** Seconds from the start of the clip (timeline time). */
  t: number
  tr: LayerTransform
  opacity: number
}

export type AnimKind = 'fade' | 'rise' | 'drop' | 'left' | 'right' | 'zoom' | 'pop'

export const ANIM_KINDS: AnimKind[] = ['fade', 'rise', 'drop', 'left', 'right', 'zoom', 'pop']

export interface ClipAnim {
  in: AnimKind | null
  out: AnimKind | null
  /** Seconds each animation lasts. */
  dur: number
}

export interface Motion {
  tr: LayerTransform
  opacity: number
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v))
const easeInOut = (v: number) => v * v * (3 - 2 * v)
const easeOut = (v: number) => 1 - (1 - v) ** 3
/** Goes a little past 1 and comes back: a "pop". */
const backOut = (v: number) => 1 + 2.7 * (v - 1) ** 3 + 1.7 * (v - 1) ** 2

const lerp = (a: number, b: number, k: number) => a + (b - a) * k

/** Keyframes closer than this (seconds) are the same moment. */
export const KEY_SNAP = 1 / 60

/** Place and opacity at `local` seconds into the clip. Without keyframes: the clip's own. */
export function motionAt(base: LayerTransform, opacity: number, keys: Keyframe[] | undefined, local: number): Motion {
  if (!keys?.length) return { tr: base, opacity }
  if (local <= keys[0].t) return { tr: keys[0].tr, opacity: keys[0].opacity }
  const last = keys[keys.length - 1]
  if (local >= last.t) return { tr: last.tr, opacity: last.opacity }
  let i = 0
  while (keys[i + 1].t < local) i++
  const a = keys[i]
  const b = keys[i + 1]
  const k = easeInOut((local - a.t) / Math.max(1e-6, b.t - a.t))
  return {
    tr: { cx: lerp(a.tr.cx, b.tr.cx, k), cy: lerp(a.tr.cy, b.tr.cy, k), sx: lerp(a.tr.sx, b.tr.sx, k), sy: lerp(a.tr.sy, b.tr.sy, k), rot: lerp(a.tr.rot, b.tr.rot, k) },
    opacity: lerp(a.opacity, b.opacity, k)
  }
}

/** Keyframes with one at `t` added or replaced (kept in time order). */
export function upsertKey(keys: Keyframe[] | undefined, t: number, tr: LayerTransform, opacity: number): Keyframe[] {
  const rest = (keys ?? []).filter((k) => Math.abs(k.t - t) > KEY_SNAP)
  return [...rest, { t, tr, opacity }].sort((a, b) => a.t - b.t)
}

export const keyAt = (keys: Keyframe[] | undefined, t: number) => keys?.find((k) => Math.abs(k.t - t) <= KEY_SNAP) ?? null

export const removeKeyAt = (keys: Keyframe[] | undefined, t: number) => (keys ?? []).filter((k) => Math.abs(k.t - t) > KEY_SNAP)

/** One side of an animation: p = 0 (hidden) … 1 (in place). */
function applyAnim(kind: AnimKind, p: number, m: Motion, W: number, H: number): Motion {
  const e = easeOut(p)
  const tr = { ...m.tr }
  let opacity = m.opacity
  switch (kind) {
    case 'fade':
      opacity *= p
      break
    case 'rise':
      tr.cy += (1 - e) * H * 0.08
      opacity *= p
      break
    case 'drop':
      tr.cy -= (1 - e) * H * 0.08
      opacity *= p
      break
    case 'left':
      tr.cx += (1 - e) * W * 0.12
      opacity *= p
      break
    case 'right':
      tr.cx -= (1 - e) * W * 0.12
      opacity *= p
      break
    case 'zoom': {
      const k = 0.6 + 0.4 * e
      tr.sx *= k
      tr.sy *= k
      opacity *= p
      break
    }
    case 'pop': {
      const k = Math.max(0.01, backOut(p))
      tr.sx *= k
      tr.sy *= k
      opacity *= clamp01(p * 3)
      break
    }
  }
  return { tr, opacity }
}

/** The clip's entering / leaving animation on top of its place at `local` seconds. */
export function animate(m: Motion, anim: ClipAnim | null | undefined, local: number, dur: number, W: number, H: number): Motion {
  if (!anim) return m
  const d = Math.max(0.05, Math.min(anim.dur, dur / 2))
  let out = m
  if (anim.in && local < d) out = applyAnim(anim.in, clamp01(local / d), out, W, H)
  if (anim.out && local > dur - d) out = applyAnim(anim.out, clamp01((dur - local) / d), out, W, H)
  return out
}

/** Move every keyframe's place (export at another size: scale and offset). */
export const scaleKeys = (keys: Keyframe[], k: number, dx: number, dy: number): Keyframe[] =>
  keys.map((f) => ({ ...f, tr: { ...f.tr, cx: f.tr.cx * k + dx, cy: f.tr.cy * k + dy, sx: f.tr.sx * k, sy: f.tr.sy * k } }))
