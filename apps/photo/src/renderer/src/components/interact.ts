import { DEG, layerBounds, layerToDoc, type LayerTransform, type Rect, type Vec2 } from '@easystudio/core'
import type { Layer } from '../state/types'
import type { View } from '../state/types'

export const toScreen = (v: View, p: Vec2): Vec2 => ({ x: v.panX + p.x * v.zoom, y: v.panY + p.y * v.zoom })
export const toDoc = (v: View, s: Vec2): Vec2 => ({ x: (s.x - v.panX) / v.zoom, y: (s.y - v.panY) / v.zoom })

export interface Handle {
  kind: 'scale' | 'rotate'
  hx: number
  hy: number
  pos: Vec2
}

const rot = (t: LayerTransform, v: Vec2): Vec2 => {
  const a = Math.cos(t.rot * DEG)
  const b = Math.sin(t.rot * DEG)
  return { x: a * v.x - b * v.y, y: b * v.x + a * v.y }
}
const unrot = (t: LayerTransform, v: Vec2): Vec2 => {
  const a = Math.cos(t.rot * DEG)
  const b = Math.sin(t.rot * DEG)
  return { x: a * v.x + b * v.y, y: -b * v.x + a * v.y }
}

/** Screen-space handles of a layer: 4 corners, 4 edges (if big enough) and a rotation knob. */
export function layerHandles(l: Layer, v: View): Handle[] {
  const { transform: t, width: w, height: h } = l
  const at = (hx: number, hy: number) => toScreen(v, layerToDoc(t, w, h, { x: ((hx + 1) / 2) * w, y: ((hy + 1) / 2) * h }))
  const out: Handle[] = []
  const corners: [number, number][] = [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1]
  ]
  for (const [hx, hy] of corners) out.push({ kind: 'scale', hx, hy, pos: at(hx, hy) })
  const c0 = out[0].pos
  const c1 = out[1].pos
  const c3 = out[3].pos
  const sw = Math.hypot(c1.x - c0.x, c1.y - c0.y)
  const sh = Math.hypot(c3.x - c0.x, c3.y - c0.y)
  if (sw > 44) out.push({ kind: 'scale', hx: 0, hy: -1, pos: at(0, -1) }, { kind: 'scale', hx: 0, hy: 1, pos: at(0, 1) })
  if (sh > 44) out.push({ kind: 'scale', hx: -1, hy: 0, pos: at(-1, 0) }, { kind: 'scale', hx: 1, hy: 0, pos: at(1, 0) })
  const top = at(0, -1)
  const center = at(0, 0)
  let dx = top.x - center.x
  let dy = top.y - center.y
  const len = Math.hypot(dx, dy)
  if (len < 1) {
    dx = 0
    dy = -1
  } else {
    dx /= len
    dy /= len
  }
  out.push({ kind: 'rotate', hx: 0, hy: -1, pos: { x: top.x + dx * 30, y: top.y + dy * 30 } })
  return out
}

export function hitHandle(handles: Handle[], s: Vec2, radius = 9): Handle | null {
  let best: Handle | null = null
  let bd = radius
  for (const h of handles) {
    const d = Math.hypot(h.pos.x - s.x, h.pos.y - s.y)
    if (d <= bd) {
      bd = d
      best = h
    }
  }
  return best
}

/** CSS resize cursor pointing from the layer centre towards a handle. */
export function resizeCursor(center: Vec2, p: Vec2): string {
  const ang = ((Math.atan2(p.y - center.y, p.x - center.x) * 180) / Math.PI + 360) % 180
  if (ang < 22.5 || ang >= 157.5) return 'ew-resize'
  if (ang < 67.5) return 'nwse-resize'
  if (ang < 112.5) return 'ns-resize'
  return 'nesw-resize'
}

/** New transform while dragging a scale handle. The opposite corner/edge stays in place. */
export function scaleFromHandle(t0: LayerTransform, w: number, h: number, hx: number, hy: number, m: Vec2, free: boolean): LayerTransform {
  const o = { x: (-hx * w) / 2, y: (-hy * h) / 2 }
  const A = (() => {
    const r = rot(t0, { x: t0.sx * o.x, y: t0.sy * o.y })
    return { x: t0.cx + r.x, y: t0.cy + r.y }
  })()
  const ml = unrot(t0, { x: m.x - A.x, y: m.y - A.y })
  const dX = hx * w * t0.sx
  const dY = hy * h * t0.sy
  let kx = 1
  let ky = 1
  if (hx !== 0 && hy !== 0 && !free) {
    const k = (ml.x * dX + ml.y * dY) / (dX * dX + dY * dY)
    kx = ky = Math.max(0.01, k)
  } else {
    if (hx !== 0) kx = Math.max(0.01, ml.x / dX)
    if (hy !== 0) ky = Math.max(0.01, ml.y / dY)
  }
  const sx = t0.sx * kx
  const sy = t0.sy * ky
  const r = rot({ ...t0 }, { x: sx * o.x, y: sy * o.y })
  return { ...t0, sx, sy, cx: A.x - r.x, cy: A.y - r.y }
}

export function rotateAround(t0: LayerTransform, m0: Vec2, m: Vec2, snap: boolean): LayerTransform {
  const a0 = Math.atan2(m0.y - t0.cy, m0.x - t0.cx)
  const a1 = Math.atan2(m.y - t0.cy, m.x - t0.cx)
  let r = t0.rot + ((a1 - a0) * 180) / Math.PI
  if (snap) r = Math.round(r / 15) * 15
  else {
    const n = Math.round(r / 90) * 90
    if (Math.abs(r - n) < 2) r = n
  }
  r = ((r % 360) + 540) % 360 - 180
  return { ...t0, rot: r }
}

export interface Guides {
  x?: number
  y?: number
}

/** Snap a moved layer's edges / centre to the canvas edges / centre. */
export function snapMove(t: LayerTransform, w: number, h: number, docW: number, docH: number, threshold: number): { t: LayerTransform; guides: Guides } {
  const b = layerBounds(t, w, h)
  const guides: Guides = {}
  const pick = (cands: [number, number][]) => {
    let best: [number, number] | null = null
    for (const c of cands) if (Math.abs(c[0]) <= threshold && (!best || Math.abs(c[0]) < Math.abs(best[0]))) best = c
    return best
  }
  const sx = pick([
    [docW / 2 - (b.x + b.w / 2), docW / 2],
    [0 - b.x, 0],
    [docW - (b.x + b.w), docW]
  ])
  const sy = pick([
    [docH / 2 - (b.y + b.h / 2), docH / 2],
    [0 - b.y, 0],
    [docH - (b.y + b.h), docH]
  ])
  let out = t
  if (sx) {
    out = { ...out, cx: out.cx + sx[0] }
    guides.x = sx[1]
  }
  if (sy) {
    out = { ...out, cy: out.cy + sy[0] }
    guides.y = sy[1]
  }
  return { t: out, guides }
}

/* ------------------------------ crop ------------------------------ */

export function cropHandles(r: Rect, v: View): Handle[] {
  const out: Handle[] = []
  for (const hy of [-1, 0, 1])
    for (const hx of [-1, 0, 1]) {
      if (!hx && !hy) continue
      out.push({ kind: 'scale', hx, hy, pos: toScreen(v, { x: r.x + ((hx + 1) / 2) * r.w, y: r.y + ((hy + 1) / 2) * r.h }) })
    }
  return out
}

const MIN_CROP = 8

/** Resize a crop rectangle by a handle, keeping `ratio` (w/h) if given, inside the document. */
export function resizeCrop(r0: Rect, hx: number, hy: number, m: Vec2, ratio: number, W: number, H: number): Rect {
  const clampX = (x: number) => Math.max(0, Math.min(W, x))
  const clampY = (y: number) => Math.max(0, Math.min(H, y))
  let x0 = r0.x
  let y0 = r0.y
  let x1 = r0.x + r0.w
  let y1 = r0.y + r0.h
  const mx = clampX(m.x)
  const my = clampY(m.y)
  if (!ratio) {
    if (hx < 0) x0 = Math.min(mx, x1 - MIN_CROP)
    if (hx > 0) x1 = Math.max(mx, x0 + MIN_CROP)
    if (hy < 0) y0 = Math.min(my, y1 - MIN_CROP)
    if (hy > 0) y1 = Math.max(my, y0 + MIN_CROP)
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }
  }
  // Ratio locked.
  const ax = hx < 0 ? x1 : hx > 0 ? x0 : (x0 + x1) / 2
  const ay = hy < 0 ? y1 : hy > 0 ? y0 : (y0 + y1) / 2
  let w: number
  let h: number
  if (hx && hy) {
    w = Math.max(Math.abs(mx - ax), Math.abs(my - ay) * ratio)
    h = w / ratio
  } else if (hx) {
    w = Math.abs(mx - ax)
    h = w / ratio
  } else {
    h = Math.abs(my - ay)
    w = h * ratio
  }
  // Available room from the anchor in the dragged direction(s).
  const roomW = hx < 0 ? ax : hx > 0 ? W - ax : 2 * Math.min(ax, W - ax)
  const roomH = hy < 0 ? ay : hy > 0 ? H - ay : 2 * Math.min(ay, H - ay)
  const k = Math.min(1, roomW / w, roomH / h)
  w = Math.max(MIN_CROP, w * k)
  h = Math.max(MIN_CROP / ratio, w / ratio)
  const x = hx < 0 ? ax - w : hx > 0 ? ax : ax - w / 2
  const y = hy < 0 ? ay - h : hy > 0 ? ay : ay - h / 2
  return { x, y, w, h }
}

export function moveCrop(r0: Rect, dx: number, dy: number, W: number, H: number): Rect {
  return { ...r0, x: Math.max(0, Math.min(W - r0.w, r0.x + dx)), y: Math.max(0, Math.min(H - r0.h, r0.y + dy)) }
}

/** Draw a new crop rectangle from a drag. */
export function drawCrop(a: Vec2, b: Vec2, ratio: number, W: number, H: number): Rect {
  const ax = Math.max(0, Math.min(W, a.x))
  const ay = Math.max(0, Math.min(H, a.y))
  const hx = b.x >= ax ? 1 : -1
  const hy = b.y >= ay ? 1 : -1
  return resizeCrop({ x: ax, y: ay, w: 0, h: 0 }, hx, hy, b, ratio, W, H)
}
